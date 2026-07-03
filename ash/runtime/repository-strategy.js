function buildRepositoryStrategy({
  repository,
  repositoryIntelligence,
  runtimeGovernor,
  saveVerification,
  shutdownRuntime
}) {
  const state = repositoryIntelligence?.state || "unknown";
  const repositoryDirty = repository?.clean === false;
  const saveCompleted = saveVerification?.saveCompleted === true;
  const shutdownCompleted = shutdownRuntime?.shutdownCompleted === true;

  const strategyActions = [];
  let strategy = "observe";

  if (state === "clean") {
    strategy = "idle";
  } else if (state === "dirty-but-managed" && saveCompleted && shutdownCompleted) {
    strategy = "review-before-commit";
    strategyActions.push("inspect_repository");
    strategyActions.push("git_diff_check");
  } else if (state === "dirty-checkpoint-required") {
    strategy = "checkpoint-first";
    strategyActions.push("runtime_corecheck");
    strategyActions.push("git_diff_check");
    strategyActions.push("run_checkpoint_when_needed");
  } else if (state === "dirty-diff-required") {
    strategy = "diff-first";
    strategyActions.push("git_diff_check");
  } else if (repositoryDirty) {
    strategy = "inspect-first";
    strategyActions.push("inspect_repository");
  }

  const requiresHumanReview =
    strategy === "review-before-commit" ||
    strategy === "checkpoint-first";

  const commitCandidate =
    state === "dirty-but-managed" &&
    saveCompleted &&
    shutdownCompleted;

  return {
    mode: "repository-strategy-runtime",
    version: "ash-local-runtime-v0.1",
    repositoryState: state,
    governorState: runtimeGovernor?.nextState || null,
    strategy,
    strategyActions: [...new Set(strategyActions)],
    commitCandidate,
    pushCandidate: false,
    requiresHumanReview,
    allowedToAutoCommit: false,
    reason:
      strategy === "idle"
        ? "Repository is clean."
        : strategy === "review-before-commit"
          ? "Repository changes were managed; review is required before commit."
          : strategy === "checkpoint-first"
            ? "Repository requires checkpoint before commit consideration."
            : "Repository requires inspection or diff before further action.",
    evaluatedAt: new Date().toISOString()
  };
}

module.exports = {
  buildRepositoryStrategy
};
