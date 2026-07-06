"use strict";

const { dispatchAction } = require("../runtime/capability-dispatcher");

const result = dispatchAction(
  {
    action: "prepare_memory_save",
    generatedTask: {
      nextTask: {
        task: "dispatcher registered executor fallback smoke"
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
  resultMode: result.result?.mode || null,
  fallbackMode: result.fallback?.mode || null,
  fallbackAction: result.fallback?.action || null,
  fallbackObserved: Boolean(result.fallback?.observedAt)
};

console.log(JSON.stringify(summary, null, 2));

if (summary.success !== true) process.exitCode = 1;
if (summary.route !== "registered-executor") process.exitCode = 1;
if (summary.fallbackMode !== "registered-executor-fallback") process.exitCode = 1;
if (summary.fallbackAction !== "prepare_memory_save") process.exitCode = 1;
if (summary.fallbackObserved !== true) process.exitCode = 1;


