"use strict";

const { dispatchAction } = require("./capability-dispatcher");
const { expandNextAction } = require("./capability-next-action");

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
  maxSteps = 8
} = {}) {
  const steps = [];
  const queue = [
    createLoopStep(initialAction, initialInput)
  ];

  while (queue.length > 0 && steps.length < maxSteps) {
    const step = queue.shift();
    const dispatchResult = dispatchAction(step, context);
    const classification = dispatchResult.classification || null;
    const nextAction = classification?.nextAction || "stop";
    const expansion = expandNextAction(nextAction, {
      source: "capability-loop"
    });

    steps.push({
      index: steps.length,
      action: step.action,
      success: Boolean(dispatchResult.success),
      classification,
      expansion,
      dispatchResult
    });

    if (!dispatchResult.success) {
      return {
        mode: "capability-loop-runtime",
        version: "ash-local-runtime-v0.2-next-action-expansion",
        success: false,
        stopped: true,
        stopReason: "dispatch_failed",
        steps,
        finalAction: step.action,
        finalNextAction: nextAction,
        ranAt: new Date().toISOString()
      };
    }

    if (nextAction === "stop") {
      return {
        mode: "capability-loop-runtime",
        version: "ash-local-runtime-v0.2-next-action-expansion",
        success: false,
        stopped: true,
        stopReason: "stop",
        steps,
        finalAction: step.action,
        finalNextAction: nextAction,
        ranAt: new Date().toISOString()
      };
    }

    if (nextAction === "continue" && queue.length === 0) {
      return {
        mode: "capability-loop-runtime",
        version: "ash-local-runtime-v0.2-next-action-expansion",
        success: true,
        stopped: true,
        stopReason: "continue",
        steps,
        finalAction: step.action,
        finalNextAction: nextAction,
        ranAt: new Date().toISOString()
      };
    }

    for (const action of expansion.actions) {
      queue.push(createLoopStep(action, {
        previousAction: step.action,
        previousClassification: classification
      }));
    }

    if (queue.length === 0) {
      return {
        mode: "capability-loop-runtime",
        version: "ash-local-runtime-v0.2-next-action-expansion",
        success: true,
        stopped: true,
        stopReason: nextAction,
        steps,
        finalAction: step.action,
        finalNextAction: nextAction,
        required: classification?.required || null,
        ranAt: new Date().toISOString()
      };
    }
  }

  return {
    mode: "capability-loop-runtime",
    version: "ash-local-runtime-v0.2-next-action-expansion",
    success: false,
    stopped: true,
    stopReason: "max_steps_reached",
    steps,
    remainingQueue: queue.map((step) => step.action),
    ranAt: new Date().toISOString()
  };
}

module.exports = {
  runCapabilityLoop
};
