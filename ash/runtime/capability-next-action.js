"use strict";

const nextActionMap = {
  continue: [],
  stop: [],
  run_development_pipeline: ["development_pipeline"],
  repair_patch: ["repair_patch"],
  verify_patch: ["verify_patch"],
  corecheck_or_save_gate: [
    "run_corecheck",
    "prepare_ash_core_save",
    "prepare_handover"
  ]
};

function expandNextAction(nextAction = "stop", context = {}) {
  const actions = nextActionMap[nextAction] || [];

  return {
    mode: "capability-next-action-runtime",
    version: "ash-local-runtime-v0.1",
    nextAction,
    actions,
    expanded: actions.length > 0,
    requiresStop: nextAction === "stop",
    requiresContinue: nextAction === "continue",
    source: context.source || "capability-result",
    expandedAt: new Date().toISOString()
  };
}

module.exports = {
  expandNextAction,
  nextActionMap
};

