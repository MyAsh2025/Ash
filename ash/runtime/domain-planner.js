function buildDomainPlanner({ executiveRuntime }) {

  const domain = executiveRuntime?.domain || "development";

  const plans = {
    development: [
      "inspect_repository",
      "prepare_patch_plan"
    ],
    repository: [
      "inspect_repository",
      "git_diff_check"
    ],
    business: [
      "market_review"
    ],
    finance: [
      "financial_review"
    ],
    growth: [
      "growth_review"
    ],
    learning: [
      "learning_review"
    ]
  };

  return {
    mode: "domain-planner-runtime",
    version: "ash-local-runtime-v0.1",
    activeDomain: domain,
    plannedActions: plans[domain] || [],
    planReady: true,
    plannedAt: new Date().toISOString()
  };
}

module.exports = {
  buildDomainPlanner
};
