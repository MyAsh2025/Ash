"use strict";

const ACTION_CLASSIFICATIONS = {
  development_pipeline: {
    classification: "capability-route",
    exposure: "public-capability",
    reason: "Primary implementation pipeline.",
    requiredRules: ["coreCheckBeforePatch"]
  },
  prepare_patch_plan: {
    classification: "capability-route",
    exposure: "public-capability",
    reason: "Patch planning capability.",
    requiredRules: ["coreCheckBeforePatch"],
    executionPolicy: {
      reportOnly: "deny",
      cleanupReview: "deny"
    }
  },
  execute_plan: {
    classification: "executor-internal",
    exposure: "internal-only",
    reason: "Registry bridge into Plan Executor."
  },

  audit_check: {
    classification: "compatibility-layer",
    exposure: "internal-verification",
    phase: "verification",
    executionPolicy: {
      reportOnly: "allow",
      cleanupReview: "deny"
    }
  },
  classify_save_scope: {
    classification: "compatibility-layer",
    exposure: "internal-save",
    phase: "preparation",
    executionPolicy: {
      reportOnly: "allow",
      cleanupReview: "deny"
    }
  },
  git_diff_check: {
    classification: "compatibility-layer",
    exposure: "internal-verification",
    phase: "verification",
    requiredRules: ["coreCheckBeforeGit"],
    executionPolicy: {
      reportOnly: "allow",
      cleanupReview: "deny"
    }
  },
  inspect_repository: {
    classification: "compatibility-layer",
    exposure: "internal-observation",
    phase: "preparation",
    executionPolicy: {
      reportOnly: "allow",
      cleanupReview: "allow"
    }
  },
  node_check: {
    classification: "compatibility-layer",
    exposure: "internal-verification",
    phase: "verification",
    executionPolicy: {
      reportOnly: "allow",
      cleanupReview: "deny"
    }
  },
  prepare_ash_core_save: {
    classification: "compatibility-layer",
    exposure: "internal-save",
    requiredRules: ["coreCheckBeforeCheckpoint"],
    executionPolicy: {
      reportOnly: "deny",
      cleanupReview: "deny"
    }
  },
  prepare_handover: {
    classification: "compatibility-layer",
    exposure: "internal-save",
    requiredRules: ["coreCheckBeforeHandover"],
    executionPolicy: {
      reportOnly: "deny",
      cleanupReview: "deny"
    }
  },
  prepare_memory_save: {
    classification: "compatibility-layer",
    exposure: "internal-save",
    requiredRules: ["coreCheckBeforeCheckpoint"],
    executionPolicy: {
      reportOnly: "deny",
      cleanupReview: "deny"
    }
  },
  run_checkpoint_when_needed: {
    classification: "compatibility-layer",
    exposure: "internal-checkpoint",
    phase: "checkpoint",
    requiredRules: ["coreCheckBeforeCheckpoint"],
    executionPolicy: {
      reportOnly: "deny",
      cleanupReview: "deny"
    }
  },
  run_corecheck: {
    classification: "compatibility-layer",
    exposure: "internal-verification",
    phase: "execution",
    executionPolicy: {
      reportOnly: "allow",
      cleanupReview: "deny"
    }
  },
  runtime_corecheck: {
    classification: "compatibility-layer",
    exposure: "internal-verification",
    phase: "verification",
    executionPolicy: {
      reportOnly: "allow",
      cleanupReview: "deny"
    }
  }
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

function resolveRequiredRulesForAction(action) {
  return classifyAction(action).requiredRules || [];
}

function resolveExecutionPolicyForAction(action) {
  return classifyAction(action).executionPolicy || {};
}

module.exports = {
  ACTION_CLASSIFICATIONS,
  classifyAction,
  classifyActions,
  resolveRequiredRulesForAction,
  resolveExecutionPolicyForAction
};

