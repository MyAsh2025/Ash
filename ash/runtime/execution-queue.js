function buildCompletedActionSet(results = []) {
  return new Set(
    results
      .filter((result) => result.success)
      .map((result) => result.originalAction || result.action)
  );
}

function resolveQueueItemState(step, completedActions) {
  const dependencies = step.dependencies || [];
  const missingDependencies = dependencies.filter(
    (dependency) => !completedActions.has(dependency)
  );

  if (missingDependencies.length > 0) {
    return {
      state: "blocked",
      missingDependencies
    };
  }

  return {
    state: "ready",
    missingDependencies: []
  };
}

function buildExecutionQueueRuntime({ scheduler, executionResults = [] } = {}) {
  const completedActions = buildCompletedActionSet(executionResults);
  const queue = (scheduler?.executionQueue || []).map((step, index) => {
    const state = resolveQueueItemState(step, completedActions);

    return {
      queueId: `queue-${index + 1}`,
      state: state.state,
      missingDependencies: state.missingDependencies,
      stepId: step.stepId || null,
      action: step.action,
      capability: step.capability || null,
      phase: step.phase || null,
      priority: step.priority ?? null,
      required: Boolean(step.required),
      assignedAgent: step.assignedAgent || null,
      dependencies: step.dependencies || [],
      dispatch: step.dispatch || null
    };
  });

  return {
    mode: "execution-queue-runtime",
    version: "ash-local-runtime-v0.1",
    queue,
    readyItems: queue.filter((item) => item.state === "ready"),
    blockedItems: queue.filter((item) => item.state === "blocked"),
    completedActions: [...completedActions],
    queueLength: queue.length,
    builtAt: new Date().toISOString()
  };
}

module.exports = {
  buildExecutionQueueRuntime,
  buildCompletedActionSet,
  resolveQueueItemState
};
