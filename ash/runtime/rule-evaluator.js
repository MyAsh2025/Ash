"use strict";

function extractCoreContext(bootstrap) {
  return bootstrap?.ashCore?.coreContext ||
    bootstrap?.startupGate?.ashCore?.coreContext ||
    null;
}

function evaluateRules({
  bootstrap = null,
  workflow = null,
  taskRuntime = null
} = {}) {
  const coreContext = extractCoreContext(bootstrap);

  const runtimeStack = coreContext?.runtimeStack || {};
  const governance = coreContext?.governance || {};
  const coreCheckRules = coreContext?.coreCheckRules || {};
  const developmentPrinciples =
    coreContext?.developmentPrinciples || {};

  const runtimeEnforcement =
    coreContext?.runtimeEnforcement || {};

  const persistenceRules =
    coreContext?.persistenceRules || {};

  const outputSafety =
    coreContext?.outputSafety || {};

  const requiredCore =
    runtimeStack?.requiredCore || {};

  const coreAvailable =
    coreContext?.available === true;

  const requiredCoreComplete =
    requiredCore?.complete === true;

  const activeRuntimeDeclaredCount =
    Number(runtimeStack?.declaredCount || 0);

  const activeRuntimeLoadedCount =
    Number(runtimeStack?.loadedCount || 0);

  const activeRuntimeStackComplete =
    activeRuntimeDeclaredCount > 0 &&
    activeRuntimeLoadedCount === activeRuntimeDeclaredCount &&
    Array.isArray(runtimeStack?.missingFiles) &&
    runtimeStack.missingFiles.length === 0;

  const runtimeExecutionAllowed =
    coreAvailable &&
    requiredCoreComplete &&
    activeRuntimeStackComplete;

  return {
    mode: "rule-evaluator",
    version: "ash-local-runtime-v0.2-core-enforcement",
    coreContextAware: Boolean(coreContext),
    coreAvailable,
    runtimeExecutionAllowed,
    unavailableReasons:
      coreContext?.unavailableReasons || [],
    runtimeStack: {
      indexLoaded: runtimeStack?.indexLoaded === true,
      declaredCount: activeRuntimeDeclaredCount,
      loadedCount: activeRuntimeLoadedCount,
      missingFiles: runtimeStack?.missingFiles || [],
      requiredCoreComplete,
      complete: activeRuntimeStackComplete
    },
    governance: {
      requiresCoreCheckBeforeRuntimeChange:
        governance.requiresCoreCheckBeforeRuntimeChange === true,
      requiresOwnerApprovalForHighImpact:
        governance.requiresOwnerApprovalForHighImpact === true,
      preferLowRiskAutonomy:
        governance.preferLowRiskAutonomy === true
    },
    execution: {
      coreCheckBeforePatch:
        coreCheckRules.beforePatch === true,
      coreCheckBeforeCheckpoint:
        coreCheckRules.beforeCheckpoint === true,
      coreCheckBeforeGit:
        coreCheckRules.beforeGit === true,
      coreCheckBeforeHandover:
        coreCheckRules.beforeHandover === true,
      requireCheckpointVerification:
        coreCheckRules.beforeCheckpoint === true ||
        coreCheckRules.beforeGit === true,
      coreLoadingRequired:
        runtimeEnforcement.coreLoadingRequired === true,
      enforcementBeforeOutput:
        runtimeEnforcement.enforcementBeforeOutput === true,
      skipIsRuntimeFailure:
        runtimeEnforcement.skipIsRuntimeFailure === true
    },
    persistence: {
      saveRequiredMonitoring:
        persistenceRules.saveRequiredMonitoring === true,
      gitStatusMonitoring:
        persistenceRules.gitStatusMonitoring === true,
      endingVerificationGate:
        persistenceRules.endingVerificationGate === true
    },
    outputSafety: {
      powershellSingleCodeBlock:
        outputSafety.powershellSingleCodeBlock === true,
      noExplanationInsidePowerShellBlock:
        outputSafety.noExplanationInsidePowerShellBlock === true,
      verifiedTargetBeforeEdit:
        outputSafety.verifiedTargetBeforeEdit === true
    },
    planning: {
      connectExistingRuntimesFirst:
        developmentPrinciples.connectExistingRuntimesFirst === true,
      avoidDuplicateRuntimes:
        developmentPrinciples.avoidDuplicateRuntimes === true,
      preferReuseBeforeCreation:
        developmentPrinciples.preferReuseBeforeCreation === true,
      measureAutonomyOverRuntimeCount:
        developmentPrinciples.measureAutonomyOverRuntimeCount === true,
      verifiedTargetEditing:
        developmentPrinciples.verifiedTargetEditing === true
    },
    workflow: {
      autoExecutable: workflow?.autoExecutable === true,
      taskCount: taskRuntime?.tasks?.length || 0
    },
    violations: [
      ...(!coreAvailable
        ? ["core-context-unavailable"]
        : []),
      ...(!requiredCoreComplete
        ? ["required-core-incomplete"]
        : []),
      ...(!activeRuntimeStackComplete
        ? ["active-runtime-stack-incomplete"]
        : []),
      ...(
        runtimeEnforcement.coreLoadingRequired !== true
          ? ["core-loading-rule-unavailable"]
          : []
      ),
      ...(
        runtimeEnforcement.enforcementBeforeOutput !== true
          ? ["runtime-enforcement-rule-unavailable"]
          : []
      )
    ],
    evaluatedAt: new Date().toISOString()
  };
}

module.exports = {
  evaluateRules,
  extractCoreContext
};