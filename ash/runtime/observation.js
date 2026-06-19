function scoreImportance(signals, repository) {
  let score = 0;

  if (signals.includes("architecture-change")) score += 35;
  if (signals.includes("runtime-change")) score += 30;
  if (signals.includes("save-required")) score += 20;
  if (signals.includes("handover-required")) score += 15;
  if (signals.includes("development-task")) score += 15;
  if (signals.includes("corecheck")) score += 10;
  if (signals.includes("market-observation")) score += 20;
  if (signals.includes("finance-observation")) score += 25;

  if (repository && repository.clean === false) score += 10;

  if (score >= 60) return { level: "critical", score };
  if (score >= 35) return { level: "high", score };
  if (score >= 15) return { level: "medium", score };
  return { level: "low", score };
}

function detectDomain(signals) {
  if (signals.includes("market-observation")) return "market";
  if (signals.includes("finance-observation")) return "finance";

  if (signals.includes("architecture-change") || signals.includes("runtime-change")) {
    return "architecture";
  }

  if (signals.includes("development-task")) return "development";
  if (signals.includes("save-required")) return "knowledge";
  if (signals.includes("handover-required")) return "continuity";

  return "general";
}

function mergeObservations({ conversation, repository }) {
  const signals = conversation?.signals || [];
  const importance = scoreImportance(signals, repository);
  const domain = detectDomain(signals);

  return {
    mode: "observation-runtime",
    version: "ash-local-runtime-v0.3",
    sensors: {
      conversation,
      repository
    },
    input: conversation?.input || "",
    signals,
    domain,
    importance,
    decisionCandidate: importance.score >= 35,
    repositoryRisk: repository?.risk || "unknown",
    observedAt: new Date().toISOString()
  };
}

module.exports = { mergeObservations };
