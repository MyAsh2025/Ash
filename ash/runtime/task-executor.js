"use strict";

const { planTask } = require("./planner-runtime");
const { runCapabilityLoop } = require("./capability-loop");
const { reflectCapabilityLoop } = require("./capability-reflection");

function executeTask({
  task = "",
  context = {},
  maxSteps = 8
} = {}) {
  const plan = planTask({ task, context });
  const firstStep = plan.steps[0] || { action: "minimal_core_gate" };

  const loop = runCapabilityLoop({
    task,
    initialAction: firstStep.action,
    initialInput: firstStep,
    context: {
      ...context,
      projectContext: plan.projectContext,
      project: plan.projectContext?.project || null,
      projectPath: plan.projectContext?.project?.path || null
    },
    maxSteps
  });

  const reflection = reflectCapabilityLoop(loop);

  return {
    mode: "task-executor-runtime",
    version: "ash-local-runtime-v0.1",
    task,
    success: Boolean(reflection.success),
    ruleEvaluatorAware: Boolean(plan.ruleEvaluatorAware),
    coreContextAware: Boolean(plan.coreContextAware),
    planningRules: plan.planningRules || {},
    plan,
    loop,
    reflection,
    executedAt: new Date().toISOString()
  };
}

module.exports = {
  executeTask
};

