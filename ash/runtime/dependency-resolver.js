function buildCompletedActionSet(executionResults = []) {
  return new Set(
    executionResults
      .filter((result) => result.success)
      .map((result) => result.originalAction || result.action)
  );
}

function resolveStepDependencies(step, completedActions) {
  const dependencies = step.dependencies || [];
  const missingDependencies = dependencies.filter(
    (dependency) => !completedActions.has(dependency)
  );

  return {
    ...step,
    dependencyStatus:
      missingDependencies.length === 0 ? "ready" : "blocked",
    missingDependencies
  };
}

function resolveDependencies(executionPlan, executionResults = []) {
  const steps = executionPlan?.steps || [];
  const completedActions = buildCompletedActionSet(executionResults);

  const resolvedSteps = steps.map((step) =>
    resolveStepDependencies(step, completedActions)
  );

  return {
    mode: "dependency-resolver-runtime",
    version: "ash-local-runtime-v0.1",
    completedActions: [...completedActions],
    readySteps: resolvedSteps.filter((step) => step.dependencyStatus === "ready"),
    blockedSteps: resolvedSteps.filter((step) => step.dependencyStatus === "blocked"),
    resolvedSteps,
    resolvedAt: new Date().toISOString()
  };
}

module.exports = {
  resolveDependencies,
  resolveStepDependencies,
  buildCompletedActionSet
};
