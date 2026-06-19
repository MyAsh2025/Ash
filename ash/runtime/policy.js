const fs = require("fs");
const path = require("path");

function loadPolicies() {
  const policyPath = path.join(process.cwd(), "ash", "config", "policies.json");
  const raw = fs.readFileSync(policyPath, "utf8");
  return JSON.parse(raw);
}

function applyPolicy(observation, decision) {
  const policies = loadPolicies();
  const domain = observation?.domain || "general";
  const basePolicy = policies[domain] || policies.general;

  return {
    mode: "policy-runtime",
    version: "ash-local-runtime-v0.1",
    domain,
    accepted: Boolean(decision?.accepted),
    reason: decision?.reason || "no decision reason",
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
