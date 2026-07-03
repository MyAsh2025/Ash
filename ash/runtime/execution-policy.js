function buildExecutionPolicy({ companyPlanner, executiveRuntime }) {
  const requiresReview =
    executiveRuntime?.requiresHumanReview === true ||
    companyPlanner?.primaryDomain === "repository";

  const executionOrder =
    (companyPlanner?.domains || [])
      .filter((domain) => domain.active)
      .sort((a, b) => b.priority - a.priority)
      .map((domain) => domain.name);

  return {
    mode: "execution-policy-runtime",
    version: "ash-local-runtime-v0.1",
    executionMode: "continue",
    primaryDomain: companyPlanner?.primaryDomain || null,
    executionOrder,
    plannedActions: companyPlanner?.plannedActions || [],
    parallel: false,
    autoCommit: false,
    requiresReview,
    continueExecution: executiveRuntime?.continueExecution !== false,
    reason: requiresReview
      ? "Execution may continue, but review is required before commit or release actions."
      : "Execution may continue under current policy.",
    evaluatedAt: new Date().toISOString()
  };
}

module.exports = {
  buildExecutionPolicy
};
