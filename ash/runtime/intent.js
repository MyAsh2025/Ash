function classifyIntent(observation, decision = null, policy = null) {
  const rules = policy?.rules || {};

  return {
    mode: "intent-runtime",
    version: "ash-local-runtime-v0.3",
    primary: observation?.domain || "general",
    requiresCoreCheck: Boolean(rules.coreCheck),
    requiresCheckpoint: Boolean(rules.checkpoint),
    requiresHandover: Boolean(rules.handover),
    requiresAshCoreSave: Boolean(rules.ashCoreSave),
    requiresMemorySave: Boolean(rules.memorySave),
    requiresExecutiveReview: Boolean(rules.executiveReview),
    requiresMarketReview: Boolean(rules.marketReview),
    requiresCashflowReview: Boolean(rules.cashflowReview)
  };
}

module.exports = { classifyIntent };
