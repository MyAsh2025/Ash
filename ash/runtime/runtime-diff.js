function buildRuntimeDiff({
  previousRuntimeState,
  currentRuntime
}) {
  const previous =
    previousRuntimeState?.state?.latestRuntime || {};

  const current = {
    task: currentRuntime?.task || null,
    project: currentRuntime?.projectContext?.project?.id || null,
    resumeState: currentRuntime?.resumeRuntime?.resumeState || null,
    saveCompleted: currentRuntime?.saveVerification?.saveCompleted || false,
    shutdownCompleted: currentRuntime?.shutdownRuntime?.shutdownCompleted || false,
    completedActions:
      currentRuntime?.queueExecution?.queueState?.completedActions || []
  };

  const addedActions =
    current.completedActions.filter(
      (action) => !(previous.completedActions || []).includes(action)
    );

  const removedActions =
    (previous.completedActions || []).filter(
      (action) => !current.completedActions.includes(action)
    );

  return {
    mode: "runtime-diff-runtime",
    version: "ash-local-runtime-v0.1",
    previous,
    current,
    diff: {
      taskChanged: previous.task !== current.task,
      resumeStateChanged:
        previous.resumeState !== current.resumeState,
      addedActions,
      removedActions
    },
    changed:
      addedActions.length > 0 ||
      removedActions.length > 0 ||
      previous.resumeState !== current.resumeState,
    evaluatedAt: new Date().toISOString()
  };
}

module.exports = {
  buildRuntimeDiff
};
