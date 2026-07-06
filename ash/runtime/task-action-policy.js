"use strict";

const TASK_ACTION_MAP = {
  load_previous_runtime_state: ["inspect_repository"],
  classify_resume_state: ["inspect_repository"],
  inspect_repository: ["inspect_repository"],
  runtime_corecheck: ["runtime_corecheck"],
  git_diff_check: ["git_diff_check"],
  save_verification: [
    "classify_save_scope",
    "prepare_ash_core_save",
    "prepare_memory_save"
  ],
  shutdown_verification: [],
  prepare_handover: ["prepare_handover"],
  prepare_patch_plan: ["prepare_patch_plan"],
  run_checkpoint_when_needed: ["run_checkpoint_when_needed"]
};

function resolveActionsForOperationalStep(step) {
  return TASK_ACTION_MAP[step] || [];
}

module.exports = {
  TASK_ACTION_MAP,
  resolveActionsForOperationalStep
};
