"use strict";

const GOAL_ACTIONS = {
  continue_governor_next_actions: [
    "inspect_repository",
    "git_diff_check",
    "runtime_corecheck"
  ],
  continue_previous_operation: [
    "inspect_repository",
    "runtime_corecheck"
  ],
  continue_after_completed_cycle: [
    "inspect_repository",
    "runtime_corecheck"
  ],
  develop_runtime_architecture: [
    "inspect_repository",
    "prepare_patch_plan",
    "runtime_corecheck",
    "git_diff_check",
    "prepare_ash_core_save",
    "prepare_memory_save",
    "run_checkpoint_when_needed"
  ],
  general_operation: [
    "inspect_repository",
    "runtime_corecheck"
  ]
};

const DIRTY_REPOSITORY_GOAL_ACTIONS = [
  "git_diff_check",
  "prepare_ash_core_save",
  "prepare_memory_save",
  "run_checkpoint_when_needed"
];

function resolveActionsForGoal(goal, { repositoryDirty = false } = {}) {
  const actions = [...(GOAL_ACTIONS[goal] || GOAL_ACTIONS.general_operation)];

  if (
    repositoryDirty &&
    (
      goal === "continue_governor_next_actions" ||
      goal === "continue_previous_operation" ||
      goal === "continue_after_completed_cycle"
    )
  ) {
    actions.push(...DIRTY_REPOSITORY_GOAL_ACTIONS);
  }

  return actions;
}

module.exports = {
  GOAL_ACTIONS,
  DIRTY_REPOSITORY_GOAL_ACTIONS,
  resolveActionsForGoal
};
