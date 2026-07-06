"use strict";

const { dispatchAction } = require("../runtime/capability-dispatcher");

const result = dispatchAction(
  {
    action: "development_pipeline",
    generatedTask: {
      nextTask: {
        task: "dispatcher default executor plan smoke"
      }
    },
    dryRun: true
  },
  {
    projectPath: process.cwd(),
    dryRun: true,
    defaultExecutorPlan: true
  }
);

const summary = {
  mode: "capability-dispatcher-default-executor-plan-smoke-test",
  success: result.success === true,
  route: result.route,
  dispatcherVersion: result.version,
  planExecutorMode: result.result?.mode || null,
  executorMode: result.result?.result?.mode || null,
  stepMode: result.result?.result?.results?.[0]?.mode || null,
  stepId: result.result?.result?.results?.[0]?.stepId || null
};

console.log(JSON.stringify(summary, null, 2));

if (summary.success !== true) process.exitCode = 1;
if (summary.route !== "executor-plan") process.exitCode = 1;
if (summary.executorMode !== "executor-runtime") process.exitCode = 1;
if (summary.stepId !== "executor-plan-development_pipeline") process.exitCode = 1;
