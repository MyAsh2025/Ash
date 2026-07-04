const fs = require("fs");
const path = require("path");

function loadPermissions() {
  const permissionPath = path.join(process.cwd(), "ash", "config", "permissions.json");
  const raw = fs.readFileSync(permissionPath, "utf8");
  return JSON.parse(raw);
}

function inferPermissionLevel({ observation, policy, executive }) {
  const domain = observation?.domain || "general";
  const signals = observation?.signals || [];
  const rules = policy?.rules || {};
  const topPriority = executive?.topPriority?.domain || "general";

  if (
    domain === "finance" ||
    signals.includes("finance-observation") ||
    rules.cashflowReview ||
    topPriority === "finance"
  ) {
    return "level3";
  }

  if (
    signals.includes("market-observation") ||
    rules.marketReview ||
    rules.executiveReview ||
    topPriority === "executive"
  ) {
    return "level2";
  }

  if (
    domain === "architecture" ||
    rules.ashCoreSave ||
    rules.memorySave
  ) {
    return "level2";
  }

  if (
    domain === "development" ||
    signals.includes("development-task") ||
    topPriority === "development"
  ) {
    return "level1";
  }

  if (
    signals.includes("corecheck") ||
    rules.coreCheck
  ) {
    return "level0";
  }

  return "level0";
}

function normalizeGovernanceInput(input) {
  return {
    observation: input?.observation || null,
    policy: input?.policy || null,
    executive: input?.executive || null,
    bootstrap: input?.bootstrap || null
  };
}

function applyGovernance(input) {
  const { observation, policy, executive, bootstrap } = normalizeGovernanceInput(input);
  const permissions = loadPermissions();
  const level = inferPermissionLevel({ observation, policy, executive });
  const permission = permissions[level] || permissions.level2;
  const ashCore = bootstrap?.ashCore || bootstrap?.startupGate?.ashCore || null;

  return {
    mode: "governance-runtime",
    version: "ash-local-runtime-v0.2-bootstrap-aware",
    level,
    permission,
    autoExecutable: Boolean(permission.autoExecute),
    requiresApproval: Boolean(permission.requiresApproval),
    ownerOnly: Boolean(permission.ownerOnly),
    ashCoreAware: Boolean(ashCore?.exists),
    ashCorePath: ashCore?.ashCorePath || null,
    reason: `Selected ${level} for domain=${observation?.domain || "general"}`,
    decidedAt: new Date().toISOString()
  };
}

module.exports = { applyGovernance };
