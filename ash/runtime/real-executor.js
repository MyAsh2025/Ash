"use strict";

const { executeRegisteredAction } = require("./executor-registry");
const { dispatchAction } = require("./capability-dispatcher");

function executeRealStep(step = {}, context = {}) {
  const registeredResult = executeRegisteredAction(step, context);

  if (!registeredResult?.skipped) {
    return {
      mode: "real-executor-runtime",
      ...registeredResult,
      mode: "real-executor-runtime",
      version: "ash-local-runtime-v0.4-dispatcher",
      action: step.action || registeredResult.action || "unknown",
      route: "registered-executor"
    };
  }

  const dispatchResult = dispatchAction(step, context);

  return {
    mode: "real-executor-runtime",
    version: "ash-local-runtime-v0.4-dispatcher",
    action: step.action || dispatchResult.action || "unknown",
    route: dispatchResult.dispatched ? "capability-dispatcher" : "unresolved",
    success: Boolean(dispatchResult.success),
    registeredResult,
    dispatchResult
  };
}

module.exports = {
  executeRealStep
};
