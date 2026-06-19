function evaluateConversationHealth({ observation, repository, runtimeResult }) {
  const signals = observation?.signals || [];
  const importance = observation?.importance || { score: 0, level: "low" };

  let score = 100;
  const reasons = [];

  if (importance.score >= 80) {
    score -= 20;
    reasons.push("critical runtime or architecture activity");
  }

  if (signals.includes("handover-required")) {
    score -= 35;
    reasons.push("handover requested or detected");
  }

  if (signals.includes("architecture-change") || signals.includes("runtime-change")) {
    score -= 15;
    reasons.push("architecture/runtime change increases continuity risk");
  }

  if (repository && repository.clean === false) {
    score -= 15;
    reasons.push("repository has pending changes");
  }

  const logCount = runtimeResult?.logCount || 0;
  if (logCount >= 8) {
    score -= 10;
    reasons.push("many runtime logs in current session");
  }

  if (score < 0) score = 0;

  let recommendedAction = "continue";
  if (score <= 40) recommendedAction = "handover";
  else if (score <= 65) recommendedAction = "prepare_handover";

  return {
    mode: "conversation-health-runtime",
    version: "ash-local-runtime-v0.1",
    score,
    recommendedAction,
    reasons,
    shouldPrepareHandover: recommendedAction === "handover" || recommendedAction === "prepare_handover",
    evaluatedAt: new Date().toISOString()
  };
}

module.exports = { evaluateConversationHealth };
