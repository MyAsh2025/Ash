function buildPatchPlanner({ task, targetFile = null, work = [], executionPolicy, companyPlanner }) {
  const plannedActions = executionPolicy?.plannedActions || companyPlanner?.plannedActions || [];
  const repositoryTargetFile = targetFile || null;
  const repositoryWork = Array.isArray(work) ? work : [];

  const needsPatchPlanning =
    plannedActions.includes("prepare_patch_plan") ||
    String(task || "").toLowerCase().includes("develop") ||
    String(task || "").includes("自律開発") ||
    String(task || "").includes("自立開発");

  return {
    mode: "patch-planner-runtime",
    version: "ash-local-runtime-v0.1",
    task,
    needsPatchPlanning,
    targetProject: "ash",
    targetFiles: needsPatchPlanning
      ? [
          ...(repositoryTargetFile ? [repositoryTargetFile] : []),
          "ash/index.js",
          "ash/runtime"
        ]
      : [],
    repositoryTargetFile,
    repositoryWork,
    requiredCapabilities: needsPatchPlanning
      ? [
          "target_location",
          "patch_generation",
          "safe_patch",
          "node_check",
          "git_diff_check",
          "runtime_corecheck"
        ]
      : [],
    nextActions: needsPatchPlanning
      ? [
          "locate_patch_target",
          "generate_patch",
          "apply_safe_patch",
          "verify_patch"
        ]
      : [],
    planReady: needsPatchPlanning,
    reason: needsPatchPlanning
      ? "Patch planning is required for autonomous development."
      : "No patch planning required.",
    plannedAt: new Date().toISOString()
  };
}

module.exports = {
  buildPatchPlanner
};

