function phaseRank(phase) {
  const ranks = {
    verification: 1,
    preparation: 2,
    execution: 3,
    checkpoint: 4,
    repository: 5,
    general: 6
  };

  return ranks[phase] || 99;
}

function collectPreparedSteps(agentRuntime = {}) {
  const steps = [];

  for (const agentResult of agentRuntime.results || []) {
    for (const step of agentResult.preparedSteps || []) {
      steps.push({
        ...step,
        assignedAgent: agentResult.agent,
        agentStatus: agentResult.status,
        dependencies: step.dependencies || []
      });
    }
  }

  return steps;
}

function sortByDependencyWithinPhase(steps = []) {
  const remaining = [...steps];
  const sorted = [];
  const completedActions = new Set();

  while (remaining.length > 0) {
    const ready = remaining
      .filter((step) =>
        (step.dependencies || []).every((dependency) =>
          completedActions.has(dependency)
        )
      )
      .sort((a, b) => {
        const priorityDiff = (b.priority || 0) - (a.priority || 0);
        if (priorityDiff !== 0) return priorityDiff;

        return String(a.action || "").localeCompare(String(b.action || ""));
      });

    if (ready.length === 0) {
      sorted.push(...remaining.sort((a, b) =>
        String(a.action || "").localeCompare(String(b.action || ""))
      ));
      break;
    }

    for (const step of ready) {
      sorted.push(step);
      completedActions.add(step.action);

      const index = remaining.findIndex((item) => item.stepId === step.stepId);
      if (index >= 0) {
        remaining.splice(index, 1);
      }
    }
  }

  return sorted;
}

function buildExecutionQueue(agentRuntime = {}) {
  const steps = collectPreparedSteps(agentRuntime);

  const phases = [...new Set(steps.map((step) => step.phase))]
    .sort((a, b) => phaseRank(a) - phaseRank(b));

  return phases.flatMap((phase) => {
    const phaseSteps = steps.filter((step) => step.phase === phase);
    return sortByDependencyWithinPhase(phaseSteps);
  });
}

function buildSchedulerRuntime(agentRuntime = {}) {
  const executionQueue = buildExecutionQueue(agentRuntime);

  return {
    mode: "scheduler-runtime",
    version: "ash-local-runtime-v0.2-dependency-aware",
    strategy: "phase-dependency-priority",
    executionQueue,
    queueLength: executionQueue.length,
    agents: [...new Set(executionQueue.map((step) => step.assignedAgent))],
    phases: [...new Set(executionQueue.map((step) => step.phase))],
    blockedSteps: [],
    scheduledAt: new Date().toISOString()
  };
}

module.exports = {
  buildSchedulerRuntime,
  buildExecutionQueue,
  collectPreparedSteps,
  sortByDependencyWithinPhase,
  phaseRank
};
