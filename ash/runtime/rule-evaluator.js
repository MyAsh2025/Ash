function extractCoreContext(bootstrap) {
  return bootstrap?.ashCore?.coreContext ||
    bootstrap?.startupGate?.ashCore?.coreContext ||
    null;
}

function evaluateRules({ bootstrap = null, workflow = null, taskRuntime = null } = {}) {
  const coreContext = extractCoreContext(bootstrap);
  const coreCheckRules = coreContext?.coreCheckRules || {};
  const developmentPrinciples = coreContext?.developmentPrinciples || {};

  return {
    mode: "rule-evaluator",
    version: "ash-local-runtime-v0.1-core-context",
    coreContextAware: Boolean(coreContext?.available),
    execution: {
      coreCheckBeforePatch: Boolean(coreCheckRules.beforePatch),
      coreCheckBeforeCheckpoint: Boolean(coreCheckRules.beforeCheckpoint),
      coreCheckBeforeGit: Boolean(coreCheckRules.beforeGit),
      coreCheckBeforeHandover: Boolean(coreCheckRules.beforeHandover),
      requireCheckpointVerification: Boolean(coreCheckRules.beforeCheckpoint || coreCheckRules.beforeGit)
    },
    planning: {
      connectExistingRuntimesFirst: Boolean(developmentPrinciples.connectExistingRuntimesFirst),
      avoidDuplicateRuntimes: Boolean(developmentPrinciples.avoidDuplicateRuntimes),
      preferReuseBeforeCreation: Boolean(developmentPrinciples.preferReuseBeforeCreation),
      measureAutonomyOverRuntimeCount: Boolean(developmentPrinciples.measureAutonomyOverRuntimeCount),
      verifiedTargetEditing: Boolean(developmentPrinciples.verifiedTargetEditing)
    },
    workflow: {
      autoExecutable: Boolean(workflow?.autoExecutable),
      taskCount: taskRuntime?.tasks?.length || 0
    },
    evaluatedAt: new Date().toISOString()
  };
}

module.exports = {
  evaluateRules,
  extractCoreContext
};
