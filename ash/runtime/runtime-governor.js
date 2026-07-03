function buildRuntimeGovernor({
  reflectionRuntime,
  repository,
  repositoryIntelligence,
  saveVerification,
  shutdownRuntime
}) {
  const repositoryDirty = repository?.clean === false;
  const stable = reflectionRuntime?.status === "stable";
  const saveCompleted = saveVerification?.saveCompleted === true;
  const shutdownCompleted = shutdownRuntime?.shutdownCompleted === true;

  let nextState = "idle";
  const nextActions = [];

  if (!stable) {
    nextState = "resolve-reflection";
    nextActions.push(...(reflectionRuntime?.recommendations || []));
  } else if (repositoryIntelligence?.state === "dirty-but-managed") {
    nextState = "stable-with-managed-repository-dirty";
    nextActions.push(...(repositoryIntelligence?.nextActions || []));
  } else if (repositoryDirty && repositoryIntelligence?.nextActions?.length) {
    nextState = repositoryIntelligence.state || "repository-management-required";
    nextActions.push(...repositoryIntelligence.nextActions);
  } else if (stable && saveCompleted && shutdownCompleted) {
    nextState = "idle";
  } else {
    nextState = "verification-required";
    nextActions.push("runtime_corecheck");
    nextActions.push("git_diff_check");
  }

  return {
    mode: "runtime-governor",
    version: "ash-local-runtime-v0.2-repository-intelligence-aware",
    stable,
    repositoryDirty,
    repositoryState: repositoryIntelligence?.state || null,
    saveCompleted,
    shutdownCompleted,
    nextState,
    nextActions: [...new Set(nextActions)],
    shouldContinue:
      nextState === "resolve-reflection" ||
      nextState === "verification-required" ||
      nextState === "dirty-checkpoint-required" ||
      nextState === "dirty-diff-required" ||
      nextState === "dirty-inspection-required",
    shouldIdle: nextState === "idle",
    shouldReport: true,
    reason:
      nextState === "idle"
        ? "Runtime is stable and no immediate continuation is required."
        : nextState === "stable-with-managed-repository-dirty"
          ? "Runtime is stable and repository changes were managed during this cycle."
          : nextState === "resolve-reflection"
            ? "Reflection returned pending recommendations."
            : "Repository or verification requires additional runtime action.",
    evaluatedAt: new Date().toISOString()
  };
}

module.exports = {
  buildRuntimeGovernor
};
