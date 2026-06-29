"use strict";

const { resolveCapabilityForAction } = require("./capability-resolver");
const { executeRegisteredAction } = require("./executor-registry");
const {
  createCapabilityRegistry,
  runCapability
} = require("./capability-registry");
const { classifyCapabilityResult } = require("./capability-result");

function dispatchAction(step = {}, context = {}) {
  const action = step.action || "unknown";
  const resolved = resolveCapabilityForAction(action);

  if (!resolved.executableCapability) {
    const registeredResult = executeRegisteredAction(step, context);

    if (!registeredResult?.skipped) {
      const classification = classifyCapabilityResult({
        action,
        executableCapability: null,
        dispatchResult: {
          success: Boolean(registeredResult.success),
          route: "registered-executor",
          result: registeredResult
        }
      });

      return {
        mode: "capability-dispatcher-runtime",
        version: "ash-local-runtime-v0.3-registered-classification",
        success: Boolean(registeredResult.success),
        action,
        capability: resolved.capability,
        executableCapability: null,
        dispatched: true,
        route: "registered-executor",
        classification,
        result: registeredResult,
        dispatchedAt: new Date().toISOString()
      };
    }

    return {
      mode: "capability-dispatcher-runtime",
      version: "ash-local-runtime-v0.2-registered-fallback",
      success: false,
      action,
      capability: resolved.capability,
      executableCapability: null,
      dispatched: false,
      route: "unresolved",
      reason: "No executable capability or registered executor mapped for action."
    };
  }

  const registry = createCapabilityRegistry();

  const input = {
    ...context,
    ...step,
    action,
    capability: resolved.capability,
    executableCapability: resolved.executableCapability
  };

  const result = runCapability(
    registry,
    resolved.executableCapability,
    input
  );

  const classification = classifyCapabilityResult({
    action,
    executableCapability: resolved.executableCapability,
    dispatchResult: result
  });

  return {
    mode: "capability-dispatcher-runtime",
    version: "ash-local-runtime-v0.1",
    success: Boolean(result.success),
    action,
    capability: resolved.capability,
    executableCapability: resolved.executableCapability,
    dispatched: true,
    classification,
    result,
    dispatchedAt: new Date().toISOString()
  };
}

module.exports = {
  dispatchAction
};



