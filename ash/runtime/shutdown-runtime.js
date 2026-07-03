function buildShutdownRuntime({
  task,
  projectContext,
  startupGate,
  resumeRuntime,
  queueExecution,
  conversationHealth,
  saveVerification,
  handover
}) {
  const completedActions = queueExecution?.queueState?.completedActions || [];

  const coreCheckCompleted =
    completedActions.includes("runtime_corecheck") ||
    completedActions.includes("run_corecheck");

  const gitDiffChecked =
    completedActions.includes("git_diff_check");

  const checkpointAttempted =
    completedActions.includes("run_checkpoint_when_needed");

  const ashCoreSavePrepared =
    completedActions.includes("prepare_ash_core_save");

  const memorySavePrepared =
    completedActions.includes("prepare_memory_save");

  const handoverPrepared =
    Boolean(handover?.prepared);

  const shutdownRequired =
    Boolean(saveVerification?.saveRequired) ||
    Boolean(conversationHealth?.shouldPrepareHandover) ||
    resumeRuntime?.resumeState === "implemented-but-uncommitted";

  const blockers = [];

  if (shutdownRequired && !coreCheckCompleted) {
    blockers.push("corecheck_not_completed");
  }

  if (saveVerification?.requirements?.gitSaveRequired && !gitDiffChecked) {
    blockers.push("git_diff_check_not_completed");
  }

  const incompleteActions = [];

  if (saveVerification?.requirements?.ashCoreSaveRequired && !ashCoreSavePrepared) {
    incompleteActions.push("ash_core_save_required");
  }

  if (saveVerification?.requirements?.memorySaveRequired && !memorySavePrepared) {
    incompleteActions.push("memory_save_required");
  }

  if (saveVerification?.requirements?.gitSaveRequired && !checkpointAttempted) {
    incompleteActions.push("checkpoint_required");
  }

  if (saveVerification?.requirements?.handoverRequired && !handoverPrepared) {
    incompleteActions.push("handover_required");
  }

  return {
    mode: "shutdown-runtime",
    version: "ash-local-runtime-v0.1",
    task,
    project: projectContext?.project?.id || null,
    projectPath: projectContext?.project?.path || projectContext?.projectPath || null,
    shutdownRequired,
    shutdownAllowed: blockers.length === 0,
    verification: {
      coreCheckCompleted,
      gitDiffChecked,
      checkpointAttempted,
      ashCoreSavePrepared,
      memorySavePrepared,
      handoverPrepared
    },
    requirements: {
      ashCoreSaveRequired: Boolean(saveVerification?.requirements?.ashCoreSaveRequired),
      memorySaveRequired: Boolean(saveVerification?.requirements?.memorySaveRequired),
      gitSaveRequired: Boolean(saveVerification?.requirements?.gitSaveRequired),
      handoverRequired: Boolean(saveVerification?.requirements?.handoverRequired)
    },
    blockers,
    incompleteActions,
    recommendedActions: [
      ...(!coreCheckCompleted ? ["runtime_corecheck"] : []),
      ...(!gitDiffChecked ? ["git_diff_check"] : []),
      ...(saveVerification?.requirements?.ashCoreSaveRequired && !ashCoreSavePrepared ? ["prepare_ash_core_save"] : []),
      ...(saveVerification?.requirements?.memorySaveRequired && !memorySavePrepared ? ["prepare_memory_save"] : []),
      ...(saveVerification?.requirements?.gitSaveRequired && !checkpointAttempted ? ["run_checkpoint_when_needed"] : []),
      ...(saveVerification?.requirements?.handoverRequired && !handoverPrepared ? ["prepare_handover"] : [])
    ],
    shutdownCompleted: shutdownRequired && blockers.length === 0 && incompleteActions.length === 0,
    reason: shutdownRequired
      ? "Shutdown verification detected required finalization actions."
      : "No shutdown action required.",
    evaluatedAt: new Date().toISOString()
  };
}

module.exports = {
  buildShutdownRuntime
};


