function hasCompletedOperationalCycle(previousLatest = {}) {
  const completedActions = previousLatest.completedActions || [];

  return Boolean(
    previousLatest.shutdownCompleted === true &&
    previousLatest.saveCompleted === true &&
    completedActions.includes("runtime_corecheck") &&
    completedActions.includes("git_diff_check") &&
    completedActions.includes("run_checkpoint_when_needed") &&
    completedActions.includes("prepare_ash_core_save") &&
    completedActions.includes("prepare_memory_save")
  );
}

function classifyResumeState({ startupGate, repository, queueExecution, previousRuntimeState }) {
  const repositoryState = startupGate?.repositoryState || "unverified";
  const previousLatest = previousRuntimeState?.state?.latestRuntime || null;

  if (hasCompletedOperationalCycle(previousLatest)) {
    return "completed-from-previous-runtime";
  }

  if (queueExecution?.success === true && repository?.clean === true) {
    return "completed";
  }

  if (repositoryState === "implemented-but-uncommitted" || repository?.clean === false) {
    return "implemented-but-uncommitted";
  }

  if (!queueExecution) {
    return "unverified";
  }

  if (queueExecution?.success === false) {
    return "unverified";
  }

  return repositoryState || "unverified";
}

function buildResumeRuntime({
  task,
  projectContext,
  previousRuntimeState,
  startupGate,
  repository,
  queueExecution
}) {
  const previousLatest = previousRuntimeState?.state?.latestRuntime || null;

  const resumeState = classifyResumeState({
    startupGate,
    repository,
    queueExecution,
    previousRuntimeState
  });

  const requiredNextActions = [];

  if (resumeState === "implemented-but-uncommitted") {
    requiredNextActions.push("git_diff_check");
    requiredNextActions.push("runtime_corecheck");
    requiredNextActions.push("save_verification");
  }

  if (resumeState === "unverified") {
    requiredNextActions.push("inspect_repository");
    requiredNextActions.push("runtime_corecheck");
  }

  return {
    mode: "resume-runtime",
    version: "ash-local-runtime-v0.3-persistent-state-priority",
    task,
    project: projectContext?.project?.id || null,
    projectPath: projectContext?.project?.path || projectContext?.projectPath || null,
    resumeState,
    previousRuntimeAvailable: Boolean(previousRuntimeState?.exists),
    previousRuntime: previousLatest,
    previousOperationalCycleCompleted: hasCompletedOperationalCycle(previousLatest),
    repositoryState: startupGate?.repositoryState || "unverified",
    repositoryClean: Boolean(repository?.clean),
    classification: {
      completed:
        resumeState === "completed" ||
        resumeState === "completed-from-previous-runtime",
      implementedButUncommitted: resumeState === "implemented-but-uncommitted",
      unverified: resumeState === "unverified",
      unimplemented: resumeState === "unimplemented"
    },
    requiredNextActions,
    resumeAllowed: resumeState !== "unimplemented",
    reason:
      resumeState === "completed-from-previous-runtime"
        ? "Previous persistent runtime state completed the operational cycle."
        : resumeState === "completed"
          ? "Current runtime state is completed."
          : resumeState === "implemented-but-uncommitted"
            ? "Repository has implemented changes that still require save verification."
            : "Runtime state requires verification before continuation.",
    evaluatedAt: new Date().toISOString()
  };
}

module.exports = {
  buildResumeRuntime,
  classifyResumeState,
  hasCompletedOperationalCycle
};
