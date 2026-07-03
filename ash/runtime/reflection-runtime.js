function hasCompletedAction(queueExecution, action) {
  return Boolean(
    queueExecution?.queueState?.completedActions?.includes(action)
  );
}

function buildReflectionRuntime({
  runtimeDiff,
  saveVerification,
  shutdownRuntime,
  repository,
  queueExecution
}) {
  const diff = runtimeDiff?.diff || {};
  const saveCompleted = saveVerification?.saveCompleted === true;
  const shutdownCompleted = shutdownRuntime?.shutdownCompleted === true;

  const recommendations = [];

  if (
    diff.addedActions?.length &&
    !saveCompleted &&
    !hasCompletedAction(queueExecution, "prepare_ash_core_save")
  ) {
    recommendations.push("prepare_ash_core_save");
  }

  if (
    diff.taskChanged &&
    !saveCompleted &&
    !hasCompletedAction(queueExecution, "prepare_memory_save")
  ) {
    recommendations.push("prepare_memory_save");
  }

  if (
    repository?.clean === false &&
    !saveCompleted &&
    !hasCompletedAction(queueExecution, "run_checkpoint_when_needed")
  ) {
    recommendations.push("run_checkpoint_when_needed");
  }

  if (
    shutdownCompleted !== true &&
    !hasCompletedAction(queueExecution, "prepare_handover")
  ) {
    recommendations.push("prepare_handover");
  }

  const stable =
    saveCompleted &&
    shutdownCompleted &&
    recommendations.length === 0;

  return {
    mode: "reflection-runtime",
    version: "ash-local-runtime-v0.2-completion-aware",
    changed: Boolean(runtimeDiff?.changed),
    status: stable ? "stable" : "action-required",
    nextMode: stable ? "continue" : "resolve-recommendations",
    recommendations: [...new Set(recommendations)],
    decisions: {
      ashCoreSave: recommendations.includes("prepare_ash_core_save"),
      memorySave: recommendations.includes("prepare_memory_save"),
      checkpoint: recommendations.includes("run_checkpoint_when_needed"),
      handover: recommendations.includes("prepare_handover")
    },
    completed: stable,
    evaluatedAt: new Date().toISOString()
  };
}

module.exports = {
  buildReflectionRuntime,
  hasCompletedAction
};
