"use strict";

const BASE_OPERATIONAL_STEPS = [
  "load_previous_runtime_state",
  "classify_resume_state"
];

const GOAL_OPERATIONAL_STEPS = {
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
    "save_verification",
    "shutdown_verification"
  ],
  general_operation: [
    "inspect_repository",
    "runtime_corecheck"
  ]
};

const DIRTY_REPOSITORY_OPERATIONAL_STEPS = [
  "git_diff_check",
  "save_verification",
  "shutdown_verification"
];

const GOVERNOR_ALLOWED_OPERATIONAL_STEPS = [
  "inspect_repository",
  "runtime_corecheck",
  "git_diff_check",
  "save_verification",
  "shutdown_verification"
];

function resolveBaseOperationalSteps() {
  return [...BASE_OPERATIONAL_STEPS];
}

function resolveOperationalStepsForGoal(goal) {
  return GOAL_OPERATIONAL_STEPS[goal] || GOAL_OPERATIONAL_STEPS.general_operation;
}

function resolveDirtyRepositoryOperationalSteps() {
  return [...DIRTY_REPOSITORY_OPERATIONAL_STEPS];
}

function filterGovernorOperationalSteps(actions = []) {
  return actions.filter((action) => GOVERNOR_ALLOWED_OPERATIONAL_STEPS.includes(action));
}

module.exports = {
  BASE_OPERATIONAL_STEPS,
  GOAL_OPERATIONAL_STEPS,
  DIRTY_REPOSITORY_OPERATIONAL_STEPS,
  GOVERNOR_ALLOWED_OPERATIONAL_STEPS,
  resolveBaseOperationalSteps,
  resolveOperationalStepsForGoal,
  resolveDirtyRepositoryOperationalSteps,
  filterGovernorOperationalSteps
};
