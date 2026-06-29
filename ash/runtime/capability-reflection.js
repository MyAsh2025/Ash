"use strict";

function reflectCapabilityLoop(loopResult = {}) {
  const steps = loopResult.steps || [];
  const failedSteps = steps.filter((step) => !step.success);
  const finalStep = steps[steps.length - 1] || null;

  const allStepsSucceeded = steps.length > 0 && failedSteps.length === 0;
  const coreGateTriggered = steps.some(
    (step) => step.classification?.classification === "core_gate_triggered"
  );
  const coreCheckSucceeded = steps.some(
    (step) =>
      step.action === "run_corecheck" &&
      step.classification?.classification === "registered_executor_success"
  );
  const savePrepared = steps.some(
    (step) => step.action === "prepare_ash_core_save" && step.success
  );
  const handoverPrepared = steps.some(
    (step) => step.action === "prepare_handover" && step.success
  );

  const completed =
    allStepsSucceeded &&
    (!coreGateTriggered || (coreCheckSucceeded && savePrepared && handoverPrepared));

  return {
    mode: "capability-reflection-runtime",
    version: "ash-local-runtime-v0.1",
    success: completed,
    completed,
    allStepsSucceeded,
    coreGateTriggered,
    coreCheckSucceeded,
    savePrepared,
    handoverPrepared,
    failedSteps: failedSteps.map((step) => ({
      index: step.index,
      action: step.action,
      reason:
        step.classification?.reason ||
        step.dispatchResult?.reason ||
        "Step failed."
    })),
    finalAction: finalStep?.action || null,
    finalNextAction: loopResult.finalNextAction || null,
    recommendation: completed
      ? "Continue autonomous development."
      : "Stop and resolve failed runtime step before continuing.",
    reflectedAt: new Date().toISOString()
  };
}

module.exports = {
  reflectCapabilityLoop
};
