"use strict";

const { runCapabilityLoop } = require("../runtime/capability-loop");

const result = runCapabilityLoop({
  task: "executor plan adapter e2e smoke",
  initialAction: "execute_plan",
  initialInput: {
    plan: {
      task: "executor plan adapter e2e smoke",
      steps: []
    }
  },
  context: {
    projectPath: process.cwd(),
    enforceCoreRuleGate: true,
    autoCoreCheck: true,
    autoGitCheck: true,
    autoCheckpoint: true,
    autoAshCoreSave: true,
    autoMemorySave: true,
    autoHandover: true
  },
  maxSteps: 1
});

const firstStep = result.steps?.[0] || null;
const inner = firstStep?.dispatchResult?.result?.result || null;

const summary = {
  mode: "capability-loop-execute-plan-smoke-test",
  success: result.success === true,
  stopReason: result.stopReason,
  firstAction: firstStep?.action || null,
  dispatchRoute: firstStep?.dispatchResult?.route || null,
  planExecutorMode: firstStep?.dispatchResult?.result?.mode || null,
  executorMode: inner?.mode || null,
  executorSuccess: inner?.success === true
};

console.log(JSON.stringify(summary, null, 2));

if (
  summary.success !== true ||
  summary.firstAction !== "execute_plan" ||
  summary.dispatchRoute !== "registered-executor" ||
  summary.planExecutorMode !== "plan-executor-runtime" ||
  summary.executorMode !== "executor-runtime" ||
  summary.executorSuccess !== true
) {
  process.exit(1);
}
