"use strict";

const ACTION_DEPENDENCIES = {
  runtime_corecheck: ["node_check"],
  run_corecheck: ["node_check"],
  audit_check: ["runtime_corecheck"],
  prepare_patch_plan: ["inspect_repository"],
  run_checkpoint_when_needed: ["runtime_corecheck", "git_diff_check"]
};

function resolveActionDependencies(action) {
  return ACTION_DEPENDENCIES[action] || [];
}

function expandActionWithDependencies(action) {
  return [
    ...resolveActionDependencies(action),
    action
  ];
}

module.exports = {
  ACTION_DEPENDENCIES,
  resolveActionDependencies,
  expandActionWithDependencies
};
