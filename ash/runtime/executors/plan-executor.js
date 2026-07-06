"use strict";

function normalizePlanFromStep(step = {}, context = {}) {
  const plan =
    step.plan ||
    context.plan ||
    {
      task: step.task || context.task || "execute registered plan",
      steps: step.steps || context.steps || []
    };

  return {
    ...plan,
    steps: Array.isArray(plan.steps) ? plan.steps : []
  };
}

function runPlanExecutor(step = {}, context = {}) {
  const { executePlan } = require("../executor");
  const plan = normalizePlanFromStep(step, context);

  const executorContext = {
    ...context,
    ...step.context,
    enforceCoreRuleGate: step.enforceCoreRuleGate ?? context.enforceCoreRuleGate ?? true,
    autoCoreCheck: step.autoCoreCheck ?? context.autoCoreCheck ?? true,
    autoGitCheck: step.autoGitCheck ?? context.autoGitCheck ?? true,
    autoCheckpoint: step.autoCheckpoint ?? context.autoCheckpoint ?? true,
    autoAshCoreSave: step.autoAshCoreSave ?? context.autoAshCoreSave ?? true,
    autoMemorySave: step.autoMemorySave ?? context.autoMemorySave ?? true,
    autoHandover: step.autoHandover ?? context.autoHandover ?? true
  };

  const result = executePlan(plan, executorContext);

  return {
    mode: "plan-executor-runtime",
    version: "ash-local-runtime-v0.1-execute-plan-adapter",
    action: step.action || "execute_plan",
    success: Boolean(result.success),
    plan,
    result,
    executedAt: new Date().toISOString()
  };
}

module.exports = {
  runPlanExecutor,
  normalizePlanFromStep
};
