"use strict";

const { dispatchAction } = require("./capability-dispatcher");

function createLoopStep(action, input = {}) {
  return {
    ...input,
    action
  };
}

function runCapabilityLoop({
  initialAction = "minimal_core_gate",
  initialInput = {},
  context = {},
  maxSteps = 5
} = {}) {
  const steps = [];
  let currentAction = initialAction;
  let currentInput = initialInput;

  for (let i = 0; i < maxSteps; i++) {
    const step = createLoopStep(currentAction, currentInput);
    const dispatchResult = dispatchAction(step, context);
    const classification = dispatchResult.classification || null;
    const nextAction = classification?.nextAction || "stop";

    steps.push({
      index: i,
      action: currentAction,
      success: Boolean(dispatchResult.success),
      classification,
      dispatchResult
    });

    if (!dispatchResult.success) {
      return {
        mode: "capability-loop-runtime",
        version: "ash-local-runtime-v0.1",
        success: false,
        stopped: true,
        stopReason: "dispatch_failed",
        steps,
        finalAction: currentAction,
        finalNextAction: nextAction,
        ranAt: new Date().toISOString()
      };
    }

    if (
      nextAction === "continue" ||
      nextAction === "stop" ||
      nextAction === "corecheck_or_save_gate"
    ) {
      return {
        mode: "capability-loop-runtime",
        version: "ash-local-runtime-v0.1",
        success: true,
        stopped: true,
        stopReason: nextAction,
        steps,
        finalAction: currentAction,
        finalNextAction: nextAction,
        required: classification?.required || null,
        ranAt: new Date().toISOString()
      };
    }

    currentAction = nextAction;
    currentInput = {
      previousAction: currentAction,
      previousClassification: classification,
      previousDispatchResult: dispatchResult
    };
  }

  return {
    mode: "capability-loop-runtime",
    version: "ash-local-runtime-v0.1",
    success: false,
    stopped: true,
    stopReason: "max_steps_reached",
    steps,
    finalAction: currentAction,
    ranAt: new Date().toISOString()
  };
}

module.exports = {
  runCapabilityLoop
};
