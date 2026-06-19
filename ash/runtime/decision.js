function makeDecision(observation) {
  const signals = observation?.signals || [];
  const importance = observation?.importance || { level: "low", score: 0 };

  const decision = {
    mode: "decision-runtime",
    version: "ash-local-runtime-v0.1",
    accepted: false,
    reason: "low importance",
    requiresCoreCheck: false,
    requiresAshCoreSave: false,
    requiresMemorySave: false,
    requiresHandover: false,
    requiresCheckpoint: false,
  };

  if (importance.score >= 35) {
    decision.accepted = true;
    decision.reason = "important runtime or architecture signal detected";
  }

  if (signals.includes("corecheck")) {
    decision.requiresCoreCheck = true;
  }

  if (signals.includes("runtime-change") || signals.includes("architecture-change")) {
    decision.requiresCoreCheck = true;
    decision.requiresAshCoreSave = true;
    decision.requiresMemorySave = true;
  }

  if (signals.includes("save-required")) {
    decision.requiresCoreCheck = true;
    decision.requiresAshCoreSave = true;
  }

  if (signals.includes("handover-required")) {
    decision.requiresCoreCheck = true;
    decision.requiresHandover = true;
  }

  if (signals.includes("development-task")) {
    decision.requiresCoreCheck = true;
    decision.requiresCheckpoint = true;
  }

  return decision;
}

module.exports = { makeDecision };
