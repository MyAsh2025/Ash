const fs = require("fs");
const path = require("path");

function loadPolicies() {
  const policyPath = path.join(process.cwd(), "ash", "config", "policies.json");
  const raw = fs.readFileSync(policyPath, "utf8");
  return JSON.parse(raw);
}

function normalizePolicyInput(input, legacyDecision) {
  if (input && input.observation) {
    return {
      observation: input.observation,
      decision: input.decision || legacyDecision,
      bootstrap: input.bootstrap || null
    };
  }

  return {
    observation: input,
    decision: legacyDecision,
    bootstrap: null
  };
}

function applyPolicy(input, legacyDecision) {
  const { observation, decision, bootstrap } = normalizePolicyInput(input, legacyDecision);
  const policies = loadPolicies();
  const domain = observation?.domain || "general";
  const basePolicy = policies[domain] || policies.general;
  const ashCore = bootstrap?.ashCore || bootstrap?.startupGate?.ashCore || null;

  return {
    mode: "policy-runtime",
    version: "ash-local-runtime-v0.2-bootstrap-aware",
    domain,
    accepted: Boolean(decision?.accepted),
    reason: decision?.reason || "no decision reason",
    ashCoreAware: Boolean(ashCore?.exists),
    ashCorePath: ashCore?.ashCorePath || null,
    rules: {
      ...basePolicy,
      coreCheck: Boolean(basePolicy.coreCheck || decision?.requiresCoreCheck),
      ashCoreSave: Boolean(basePolicy.ashCoreSave || decision?.requiresAshCoreSave),
      memorySave: Boolean(basePolicy.memorySave || decision?.requiresMemorySave),
      checkpoint: Boolean(basePolicy.checkpoint || decision?.requiresCheckpoint),
      handover: Boolean(basePolicy.handover || decision?.requiresHandover)
    }
  };
}

module.exports = { applyPolicy };
