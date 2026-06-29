"use strict";

const { resolveCapabilityForAction } = require("./capability-resolver");
const {
  createCapabilityRegistry,
  runCapability
} = require("./capability-registry");

function dispatchAction(step = {}, context = {}) {
  const action = step.action || "unknown";
  const resolved = resolveCapabilityForAction(action);

  if (!resolved.executableCapability) {
    return {
      mode: "capability-dispatcher-runtime",
      version: "ash-local-runtime-v0.1",
      success: false,
      action,
      capability: resolved.capability,
      executableCapability: null,
      dispatched: false,
      reason: "No executable capability mapped for action."
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

  return {
    mode: "capability-dispatcher-runtime",
    version: "ash-local-runtime-v0.1",
    success: Boolean(result.success),
    action,
    capability: resolved.capability,
    executableCapability: resolved.executableCapability,
    dispatched: true,
    result,
    dispatchedAt: new Date().toISOString()
  };
}

module.exports = {
  dispatchAction
};
