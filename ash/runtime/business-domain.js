function buildBusinessDomain({ executiveRuntime }) {
  const active = executiveRuntime?.domain === "business";

  const plannedActions = active
    ? [
        "market_review",
        "competitor_review",
        "product_review",
        "business_summary"
      ]
    : [];

  return {
    mode: "business-domain-runtime",
    version: "ash-local-runtime-v0.1",
    active,
    objective: executiveRuntime?.objective || null,
    plannedActions,
    planReady: active,
    reason: active
      ? "Business domain selected by Executive Runtime."
      : "Business domain is idle.",
    evaluatedAt: new Date().toISOString()
  };
}

module.exports = {
  buildBusinessDomain
};
