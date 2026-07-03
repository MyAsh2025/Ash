function buildSaveVerificationRuntime({
  task,
  projectContext,
  repository,
  startupGate,
  resumeRuntime,
  queueExecution,
  conversationHealth,
  handover
}) {
  const repositoryDirty =
    repository?.clean === false ||
    startupGate?.repositoryState === "implemented-but-uncommitted" ||
    resumeRuntime?.resumeState === "implemented-but-uncommitted";

  const runtimeChanged =
    String(task || "").toLowerCase().includes("runtime") ||
    String(task || "").toLowerCase().includes("architecture") ||
    Boolean(startupGate?.gates?.coreCheckRequired);

  const coreCheckCompleted =
    queueExecution?.queueState?.completedActions?.includes("runtime_corecheck") ||
    queueExecution?.queueState?.completedActions?.includes("run_corecheck");

  const gitDiffChecked =
    queueExecution?.queueState?.completedActions?.includes("git_diff_check");

  const handoverRequired =
    Boolean(conversationHealth?.shouldPrepareHandover);

  const completedActions = queueExecution?.queueState?.completedActions || [];

  const ashCoreSavePrepared =
    completedActions.includes("prepare_ash_core_save");

  const memorySavePrepared =
    completedActions.includes("prepare_memory_save");

  const checkpointAttempted =
    completedActions.includes("run_checkpoint_when_needed");

  const handoverPrepared =
    completedActions.includes("prepare_handover") ||
    Boolean(handover?.prepared);

  const ashCoreSaveRequired =
    runtimeChanged || handoverRequired;

  const memorySaveRequired =
    runtimeChanged || handoverRequired;

  const gitSaveRequired =
    repositoryDirty;

  const saveRequired =
    ashCoreSaveRequired ||
    memorySaveRequired ||
    gitSaveRequired ||
    handoverRequired;

  const blockers = [];

  if (gitSaveRequired && !gitDiffChecked) {
    blockers.push("git_diff_check_required");
  }

  if ((ashCoreSaveRequired || gitSaveRequired) && !coreCheckCompleted) {
    blockers.push("corecheck_required");
  }

  return {
    mode: "save-verification-runtime",
    version: "ash-local-runtime-v0.1",
    task,
    project: projectContext?.project?.id || null,
    projectPath: projectContext?.project?.path || projectContext?.projectPath || null,
    saveRequired,
    requirements: {
      ashCoreSaveRequired,
      memorySaveRequired,
      gitSaveRequired,
      handoverRequired
    },
    verification: {
      coreCheckCompleted,
      gitDiffChecked,
      ashCoreSavePrepared,
      memorySavePrepared,
      checkpointAttempted,
      handoverPrepared,
      repositoryDirty,
      runtimeChanged
    },
    blockers,
    saveAllowed: blockers.length === 0,
    recommendedActions: [
      ...(gitDiffChecked ? [] : ["git_diff_check"]),
      ...(coreCheckCompleted ? [] : ["runtime_corecheck"]),
      ...(ashCoreSaveRequired && !ashCoreSavePrepared ? ["prepare_ash_core_save"] : []),
      ...(memorySaveRequired && !memorySavePrepared ? ["prepare_memory_save"] : []),
      ...(gitSaveRequired && !checkpointAttempted ? ["run_checkpoint_when_needed"] : []),
      ...(handoverRequired && !handoverPrepared ? ["prepare_handover"] : [])
    ],
    saveCompleted:
      saveRequired &&
      blockers.length === 0 &&
      (!ashCoreSaveRequired || ashCoreSavePrepared) &&
      (!memorySaveRequired || memorySavePrepared) &&
      (!gitSaveRequired || checkpointAttempted) &&
      (!handoverRequired || handoverPrepared),
    reason: saveRequired
      ? "Save verification detected required save actions."
      : "No save action required.",
    evaluatedAt: new Date().toISOString()
  };
}

module.exports = {
  buildSaveVerificationRuntime
};


