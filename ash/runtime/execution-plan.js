const { evaluateRules } = require("./rule-evaluator");
function resolvePhase(action, manager) {
  if (
    action === "node_check" ||
    action === "runtime_corecheck" ||
    action === "git_diff_check" ||
    action === "audit_check"
  ) {
    return "verification";
  }

  if (
    action === "inspect_repository" ||
    action === "prepare_patch_plan"
  ) {
    return "preparation";
  }

  if (
    action === "run_corecheck"
  ) {
    return "execution";
  }

  if (
    action === "run_checkpoint_when_needed"
  ) {
    return "checkpoint";
  }

  if (manager === "repository-manager") {
    return "repository";
  }

  return "general";
}

function resolveDependencies(action) {
  if (action === "runtime_corecheck") {
    return ["node_check"];
  }

  if (action === "audit_check") {
    return ["runtime_corecheck"];
  }

  if (action === "prepare_patch_plan") {
    return ["inspect_repository"];
  }

  if (action === "run_corecheck") {
    return ["node_check"];
  }

  if (action === "run_checkpoint_when_needed") {
    return ["runtime_corecheck", "git_diff_check"];
  }

  return [];
}

function extractCoreContext(bootstrap) {
  return bootstrap?.ashCore?.coreContext ||
    bootstrap?.startupGate?.ashCore?.coreContext ||
    null;
}

function buildStep(task, action, index) {
  const phase = resolvePhase(action, task.manager);

  return {
    stepId: `${task.taskId}:${action}:${index}`,
    taskId: task.taskId,
    manager: task.manager,
    phase,
    action,
    priority: task.priority,
    required: task.required,
    dependencies: resolveDependencies(action)
  };
}

function groupStepsByPhase(steps) {
  const order = [
    "verification",
    "preparation",
    "execution",
    "checkpoint",
    "repository",
    "general"
  ];

  return order
    .map((phase) => {
      const phaseSteps = steps.filter((step) => step.phase === phase);

      return {
        phase,
        steps: phaseSteps,
        required: phaseSteps.some((step) => step.required),
        stepCount: phaseSteps.length
      };
    })
    .filter((phaseGroup) => phaseGroup.stepCount > 0);
}

function buildExecutionPlan({ taskRuntime, workflow, bootstrap = null }) {
  const tasks = taskRuntime?.tasks || [];
  const ruleEvaluation = evaluateRules({ bootstrap, workflow, taskRuntime });

  const steps = [];

  for (const task of tasks) {
    for (const action of task.actions || []) {
      steps.push(buildStep(task, action, steps.length + 1));
    }
  }

  steps.sort((a, b) => {
    if (a.phase === b.phase) {
      return b.priority - a.priority;
    }

    const phaseOrder = {
      verification: 1,
      preparation: 2,
      execution: 3,
      checkpoint: 4,
      repository: 5,
      general: 6
    };

    return (phaseOrder[a.phase] || 99) - (phaseOrder[b.phase] || 99);
  });

  const phases = groupStepsByPhase(steps);

  return {
    mode: "execution-plan-runtime",
    version: "ash-local-runtime-v0.4-core-context-aware",
    tasks: tasks.length,
    phases,
    steps,
    executable: Boolean(workflow?.autoExecutable),
    dependencyMode: "action-name",
    coreContextAware: Boolean(ruleEvaluation.coreContextAware),
    ruleEvaluation,
    builtAt: new Date().toISOString()
  };
}

module.exports = {
  buildExecutionPlan,
  resolvePhase,
  resolveDependencies,
  groupStepsByPhase,
  extractCoreContext
};
