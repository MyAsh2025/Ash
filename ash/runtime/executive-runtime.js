"use strict";

const { executeTask } = require("./task-executor");
const { buildGoalRuntime } = require("./goal-runtime");

function buildExecutiveRuntime({
  repositoryStrategy,
  runtimeGovernor,
  conversationHealth,
  reflectionRuntime
}) {
  const reviewNeeded =
    repositoryStrategy?.commitCandidate &&
    repositoryStrategy?.requiresHumanReview;

  const runtimeStable = reflectionRuntime?.status === "stable";

  let objective = "continue-development";
  let priority = "development";
  let domain = "development";

  if (reviewNeeded) {
    objective = "repository-review";
    priority = "high";
    domain = "repository";
  } else if (!runtimeStable) {
    objective = "runtime-stabilization";
    priority = "critical";
    domain = "runtime";
  } else if (conversationHealth?.shouldPrepareHandover) {
    objective = "prepare-handover";
    priority = "medium";
    domain = "operations";
  }

  return {
    mode: "executive-runtime",
    version: "ash-local-runtime-v0.1",
    objective,
    priority,
    domain,
    nextActions:
      objective === "repository-review"
        ? repositoryStrategy.strategyActions
        : runtimeGovernor?.nextActions || [],
    continueExecution:
      objective !== "prepare-handover",
    requiresHumanReview: reviewNeeded,
    evaluatedAt: new Date().toISOString()
  };
}


function executeExecutiveTask({
  task = "",
  context = {},
  maxSteps = 8
} = {}) {
  const execution = executeTask({ task, context, maxSteps });
  const reflection = execution.reflection || {};
  const goalRuntime = buildGoalRuntime({
    task,
    execution,
    reflection
  });

  const decision = reflection.completed
    ? "continue"
    : "stop";

  return {
    mode: "executive-runtime",
    version: "ash-local-runtime-v0.2-task-execution",
    task,
    success: Boolean(execution.success),
    decision,
    continueExecution: decision === "continue",
    requiresHumanReview: false,
    execution,
    goalRuntime,
    evaluatedAt: new Date().toISOString()
  };
}
module.exports = {
  buildExecutiveRuntime,
  executeExecutiveTask
};


