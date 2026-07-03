function runPreparePatchPlan(step = {}, context = {}) {
  const projectPath =
    context.projectPath ||
    context.project?.path ||
    process.cwd();

  return {
    executor: "prepare-patch-executor",
    action: step.action || "prepare_patch_plan",
    success: true,
    status: 0,
    projectPath,
    planPrepared: true,
    patchSafety: {
      requiresVerifiedAnchor: true,
      requiresBackupBeforePatch: true,
      requiresNodeCheckAfterPatch: true,
      requiresDiffCheckAfterPatch: true
    },
    result: "Patch plan prepared. Verified-anchor editing is required before any patch.",
    executedAt: new Date().toISOString()
  };
}

module.exports = {
  runPreparePatchPlan
};
