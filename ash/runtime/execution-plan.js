const { evaluateRules } = require("./rule-evaluator");
const { classifyAction } = require("./action-classification");
const { resolveActionDependencies } = require("./dependency-policy");

function resolvePhase(action, manager) {
  const actionClassification = classifyAction(action);

  if (actionClassification.phase) {
    return actionClassification.phase;
  }

  if (manager === "repository-manager") {
    return "repository";
  }

  return "general";
}
function resolveDependencies(action) {
  return resolveActionDependencies(action);
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
    source: task.source || null,
    work: task.work || [],
    reportOnly: Boolean(task.reportOnly),
    automaticDeletionAllowed: task.automaticDeletionAllowed === true,
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
    dependencyMode: "dependency-policy",
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





