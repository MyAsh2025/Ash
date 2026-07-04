const fs = require("fs");
const path = require("path");

function readTextIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
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

  return {
    mode: "ash-core-connector",
    version: "v0.1-read-only",
    ashCorePath,
    exists,
    loadedFiles,
    principles: {
      readOnly: true,
      connectorOnly: true,
      doNotCreateRuntimeBeforeCheckingExisting: true,
      ashCoreBeforePcAshJudgment: true
    },
    loadedAt: new Date().toISOString()
  };
}

module.exports = { loadAshCore };
