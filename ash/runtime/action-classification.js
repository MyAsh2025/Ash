"use strict";

const ACTION_CLASSIFICATIONS = {
  development_pipeline: {
    classification: "capability-route",
    exposure: "public-capability",
    reason: "Primary implementation pipeline."
  },
  prepare_patch_plan: {
    classification: "capability-route",
    exposure: "public-capability",
    reason: "Patch planning capability."
  },
  execute_plan: {
    classification: "executor-internal",
    exposure: "internal-only",
    reason: "Registry bridge into Plan Executor."
  },

  audit_check: { classification: "compatibility-layer", exposure: "internal-verification" },
  classify_save_scope: { classification: "compatibility-layer", exposure: "internal-save" },
  git_diff_check: { classification: "compatibility-layer", exposure: "internal-verification" },
  inspect_repository: { classification: "compatibility-layer", exposure: "internal-observation" },
  node_check: { classification: "compatibility-layer", exposure: "internal-verification" },
  prepare_ash_core_save: { classification: "compatibility-layer", exposure: "internal-save" },
  prepare_handover: { classification: "compatibility-layer", exposure: "internal-save" },
  prepare_memory_save: { classification: "compatibility-layer", exposure: "internal-save" },
  run_checkpoint_when_needed: { classification: "compatibility-layer", exposure: "internal-checkpoint" },
  run_corecheck: { classification: "compatibility-layer", exposure: "internal-verification" },
  runtime_corecheck: { classification: "compatibility-layer", exposure: "internal-verification" }
};

function classifyAction(action) {
  return ACTION_CLASSIFICATIONS[action] || {
    classification: "unknown-action",
    exposure: "unknown",
    reason: "No action classification is registered."
  };
}

function classifyActions(actions = []) {
  return actions.map((action) => ({
    action,
    ...classifyAction(action)
  }));
}

module.exports = {
  ACTION_CLASSIFICATIONS,
  classifyAction,
  classifyActions
};
