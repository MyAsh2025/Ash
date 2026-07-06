"use strict";

const { dispatchAction } = require("../runtime/capability-dispatcher");

const result = dispatchAction(
  {
    action: "development_pipeline",
    generatedTask: {
      nextTask: {
        task: "executor plan opt in smoke"
      }
    },
    dryRun: true
  },
  {
    projectPath: process.cwd(),
    dryRun: true,
    useExecutorPlan: true,
    enforceCoreRuleGate: false
  }
);

const summary = {
  mode: "capability-dispatcher-executor-plan-smoke-test",
  success: result.success === true,
  route: result.route,
  dispatcherVersion: result.version,
  planExecutorMode: result.result?.mode || null,
  executorMode: result.result?.result?.mode || null,
  stepMode: result.result?.result?.results?.[0]?.mode || null,
  stepId: result.result?.result?.results?.[0]?.stepId || null
};

console.log(JSON.stringify(summary, null, 2));

if (
  summary.success !== true ||
  summary.route !== "executor-plan" ||
  summary.planExecutorMode !== "plan-executor-runtime" ||
  summary.executorMode !== "executor-runtime" ||
  summary.stepMode !== "development-pipeline-executor-runtime" ||
  summary.stepId !== "executor-plan-development_pipeline"
) {
  process.exit(1);
}
