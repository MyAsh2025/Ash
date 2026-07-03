function expandGoalToActions({ operationalPlan, repository }) {
  const goal = operationalPlan?.goal || "general_operation";
  const repositoryDirty = repository?.clean === false;

  if (goal === "continue_governor_next_actions") {
    return [
      "inspect_repository",
      "git_diff_check",
      "runtime_corecheck",
      ...(repositoryDirty
        ? [
            "prepare_ash_core_save",
            "prepare_memory_save",
            "run_checkpoint_when_needed"
          ]
        : [])
    ];
  }

  if (goal === "continue_previous_operation" || goal === "continue_after_completed_cycle") {
    return [
      "inspect_repository",
      "runtime_corecheck",
      ...(repositoryDirty
        ? [
            "git_diff_check",
            "prepare_ash_core_save",
            "prepare_memory_save",
            "run_checkpoint_when_needed"
          ]
        : [])
    ];
  }

  if (goal === "develop_runtime_architecture") {
    return [
      "inspect_repository",
      "prepare_patch_plan",
      "runtime_corecheck",
      "git_diff_check",
      "prepare_ash_core_save",
      "prepare_memory_save",
      "run_checkpoint_when_needed"
    ];
  }

  return [
    "inspect_repository",
    "runtime_corecheck"
  ];
}

function buildGoalExpanderRuntime({ operationalPlan, repository }) {
  const actions = [...new Set(expandGoalToActions({ operationalPlan, repository }))];

  return {
    mode: "goal-expander-runtime",
    version: "ash-local-runtime-v0.1",
    goal: operationalPlan?.goal || null,
    sourceSteps: operationalPlan?.steps || [],
    repositoryDirty: repository?.clean === false,
    actions,
    actionCount: actions.length,
    expandedAt: new Date().toISOString()
  };
}

module.exports = {
  buildGoalExpanderRuntime,
  expandGoalToActions
};
