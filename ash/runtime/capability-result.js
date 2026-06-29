"use strict";

function classifyCapabilityResult({
  action = "unknown",
  executableCapability = null,
  dispatchResult = null
} = {}) {
  const innerResult = dispatchResult?.result?.result || dispatchResult?.result || dispatchResult;

  if (!dispatchResult) {
    return {
      mode: "capability-result-runtime",
      version: "ash-local-runtime-v0.1",
      action,
      executableCapability,
      success: false,
      classification: "missing_result",
      nextAction: "stop",
      reason: "No dispatch result was provided."
    };
  }

  if (dispatchResult.success === false) {
    return {
      mode: "capability-result-runtime",
      version: "ash-local-runtime-v0.1",
      action,
      executableCapability,
      success: false,
      classification: "dispatch_failed",
      nextAction: "stop",
      reason: dispatchResult.reason || "Dispatch failed."
    };
  }

  if (executableCapability === "verify_patch") {
    if (innerResult?.fileChecksPassed === false) {
      return {
        mode: "capability-result-runtime",
        version: "ash-local-runtime-v0.1",
        action,
        executableCapability,
        success: false,
        classification: "verification_failed",
        nextAction: "repair_patch",
        reason: "Patch verification failed."
      };
    }

    if (innerResult?.diffCheckPassed === false && innerResult?.requireCleanDiff === true) {
      return {
        mode: "capability-result-runtime",
        version: "ash-local-runtime-v0.1",
        action,
        executableCapability,
        success: false,
        classification: "diff_check_failed",
        nextAction: "repair_patch",
        reason: "Diff check failed while clean diff was required."
      };
    }

    return {
      mode: "capability-result-runtime",
      version: "ash-local-runtime-v0.1",
      action,
      executableCapability,
      success: true,
      classification: "verification_passed",
      nextAction: "continue",
      reason: "Patch verification passed."
    };
  }

  if (executableCapability === "repair_patch") {
    const repairType = innerResult?.classification?.type || null;

    return {
      mode: "capability-result-runtime",
      version: "ash-local-runtime-v0.1",
      action,
      executableCapability,
      success: Boolean(innerResult?.success),
      classification: repairType || "repair_evaluated",
      nextAction: innerResult?.repaired ? "verify_patch" : "continue",
      reason: innerResult?.reason || "Repair result evaluated."
    };
  }

  if (executableCapability === "minimal_core_gate") {
    const required = innerResult?.required || {};

    return {
      mode: "capability-result-runtime",
      version: "ash-local-runtime-v0.1",
      action,
      executableCapability,
      success: true,
      classification: innerResult?.triggered ? "core_gate_triggered" : "core_gate_clear",
      nextAction: innerResult?.triggered ? "corecheck_or_save_gate" : "continue",
      required,
      reason: innerResult?.triggered
        ? "Minimal Core Gate requires follow-up."
        : "Minimal Core Gate did not trigger."
    };
  }

  return {
    mode: "capability-result-runtime",
    version: "ash-local-runtime-v0.1",
    action,
    executableCapability,
    success: Boolean(innerResult?.success ?? dispatchResult?.success),
    classification: Boolean(innerResult?.success ?? dispatchResult?.success)
      ? "success"
      : "failed",
    nextAction: Boolean(innerResult?.success ?? dispatchResult?.success)
      ? "continue"
      : "stop",
    reason: innerResult?.reason || "Capability result classified."
  };
}

module.exports = {
  classifyCapabilityResult
};
