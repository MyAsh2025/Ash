const fs = require("fs");
const path = require("path");

function readTextIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

function includesAny(text, keywords = []) {
  if (!text) return false;
  return keywords.some((keyword) => text.includes(keyword));
}

function buildCoreContext({ exists, loadedFiles }) {
  const runtimeRules = loadedFiles.runtimeExecutionRules?.content || "";
  const honneFortune = loadedFiles.honneFortuneDecisionLog?.content || "";
  const ashArchitecture = loadedFiles.ashOsArchitecture?.content || "";

  const allText = [runtimeRules, honneFortune, ashArchitecture].filter(Boolean).join("\n\n");

  return {
    mode: "ash-core-context",
    version: "v0.3-normalized-context",
    available: Boolean(exists),
    identity: {
      source: "Ash_Core",
      role: "identity-governance-memory-core",
      ashCoreIsSourceOfTruth: true
    },
    governance: {
      requiresCoreCheckBeforeRuntimeChange: includesAny(allText, [
        "CoreCheck",
        "corecheck",
        "Before patch",
        "Before checkpoint",
        "Before git"
      ]),
      requiresOwnerApprovalForHighImpact: includesAny(allText, [
        "Executive",
        "Finance",
        "Business",
        "owner",
        "approval",
        "確認"
      ]),
      preferLowRiskAutonomy: includesAny(allText, [
        "low-risk",
        "低リスク",
        "自動",
        "autonomous"
      ])
    },
    developmentPrinciples: {
      verifiedTargetEditing: includesAny(allText, [
        "位置特定",
        "verified",
        "anchor",
        "Select-String"
      ]),
      connectExistingRuntimesFirst: true,
      avoidDuplicateRuntimes: true,
      preferReuseBeforeCreation: true,
      measureAutonomyOverRuntimeCount: true
    },
    coreCheckRules: {
      beforePatch: includesAny(allText, ["Before patch", "patch"]),
      beforeCheckpoint: includesAny(allText, ["Before checkpoint", "checkpoint"]),
      beforeGit: includesAny(allText, ["Before git", "git"]),
      beforeHandover: includesAny(allText, ["Before handover", "handover"])
    },
    memory: {
      hasRuntimeRules: Boolean(runtimeRules),
      hasHonneFortuneDecisionLog: Boolean(honneFortune),
      hasAshOsArchitecture: Boolean(ashArchitecture)
    },
    sourceFiles: Object.fromEntries(
      Object.entries(loadedFiles).map(([key, value]) => [
        key,
        {
          path: value.path,
          exists: value.exists,
          loaded: Boolean(value.content)
        }
      ])
    ),
    builtAt: new Date().toISOString()
  };
}

function loadAshCore(options = {}) {
  const ashCorePath =
    options.ashCorePath ||
    process.env.ASH_CORE_PATH ||
    path.resolve(process.cwd(), "..", "Ash_Core");

  const exists = fs.existsSync(ashCorePath);

  const files = {
    runtimeExecutionRules: path.join(ashCorePath, "runtime_execution_rules.md"),
    honneFortuneDecisionLog: path.join(ashCorePath, "decision_logs", "honne_fortune.md"),
    ashOsArchitecture: path.join(ashCorePath, "decision_logs", "ash_os_architecture.md")
  };

  const loadedFiles = Object.fromEntries(
    Object.entries(files).map(([key, filePath]) => [
      key,
      {
        path: filePath,
        exists: fs.existsSync(filePath),
        content: readTextIfExists(filePath)
      }
    ])
  );

  const coreContext = buildCoreContext({ exists, loadedFiles });

  return {
    mode: "ash-core-connector",
    version: "v0.3-core-context",
    ashCorePath,
    exists,
    loadedFiles,
    coreContext,
    principles: {
      readOnly: true,
      connectorOnly: true,
      doNotCreateRuntimeBeforeCheckingExisting: true,
      ashCoreBeforePcAshJudgment: true
    },
    loadedAt: new Date().toISOString()
  };
}

module.exports = {
  loadAshCore,
  buildCoreContext
};
