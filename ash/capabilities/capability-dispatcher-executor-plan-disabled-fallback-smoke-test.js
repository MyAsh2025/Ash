"use strict";

const { dispatchAction } = require("../runtime/capability-dispatcher");

const result = dispatchAction(
  {
    action: "development_pipeline",
    generatedTask: {
      nextTask: {
        task: "dispatcher executor plan disabled fallback smoke"
      }
    },
    dryRun: true
  },
  {
    projectPath: process.cwd(),
    dryRun: true,
    disableExecutorPlan: true
  }
);

const summary = {
  mode: "capability-dispatcher-executor-plan-disabled-fallback-smoke-test",
  success: result.success === true,
  route: result.route,
  dispatcherVersion: result.version,
  resultMode: result.result?.mode || null
};

console.log(JSON.stringify(summary, null, 2));

if (summary.success !== true) process.exitCode = 1;
if (summary.route !== "registered-executor") process.exitCode = 1;
