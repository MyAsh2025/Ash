function buildRepositoryIntelligence({
  repository,
  queueExecution,
  saveVerification,
  shutdownRuntime
}) {
  const completedActions = queueExecution?.queueState?.completedActions || [];

  const repositoryDirty = repository?.clean === false;
  const repositoryClean = repository?.clean === true;

  const inspected = completedActions.includes("inspect_repository");
  const diffChecked = completedActions.includes("git_diff_check");
  const checkpointAttempted = completedActions.includes("run_checkpoint_when_needed");

  const saveCompleted = saveVerification?.saveCompleted === true;
  const shutdownCompleted = shutdownRuntime?.shutdownCompleted === true;

  let state = "unknown";
  const nextActions = [];

  if (repositoryClean) {
    state = "clean";
  } else if (repositoryDirty && checkpointAttempted && saveCompleted && shutdownCompleted) {
    state = "dirty-but-managed";
    nextActions.push("inspect_repository");
  } else if (repositoryDirty && diffChecked && !checkpointAttempted) {
    state = "dirty-checkpoint-required";
    nextActions.push("run_checkpoint_when_needed");
  } else if (repositoryDirty && inspected && !diffChecked) {
    state = "dirty-diff-required";
    nextActions.push("git_diff_check");
  } else if (repositoryDirty) {
    state = "dirty-inspection-required";
    nextActions.push("inspect_repository");
  }

  return {
    mode: "repository-intelligence-runtime",
    version: "ash-local-runtime-v0.1",
    repositoryClean,
    repositoryDirty,
    inspected,
    diffChecked,
    checkpointAttempted,
    saveCompleted,
    shutdownCompleted,
    state,
    nextActions: [...new Set(nextActions)],
    recommendation:
      state === "clean"
        ? "Repository is clean."
        : state === "dirty-but-managed"
          ? "Repository remains dirty but current runtime cycle completed required management actions."
          : "Repository requires additional management actions.",
    evaluatedAt: new Date().toISOString()
  };
}

module.exports = {
  buildRepositoryIntelligence
};
