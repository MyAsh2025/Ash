const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

function resolveScriptPath(context = {}, scriptName) {
  const project = context.project || {};
  const projectScripts = project.scripts || {};

  const scriptFromRegistry =
    scriptName === "runtime-corecheck.ps1"
      ? projectScripts.corecheck
      : scriptName === "runtime-checkpoint.ps1"
        ? projectScripts.checkpoint
        : null;

  const candidates = [
    scriptFromRegistry && project.path ? path.join(project.path, scriptFromRegistry) : null,
    path.join(process.cwd(), scriptName),
    path.join(process.cwd(), "scripts", scriptName),
    context.projectPath ? path.join(context.projectPath, scriptName) : null,
    context.projectPath ? path.join(context.projectPath, "scripts", scriptName) : null
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function checkLocalApiHealth() {
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "try { Invoke-RestMethod -Method GET -Uri 'http://127.0.0.1:8787/' -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
    ],
    {
      encoding: "utf8"
    }
  );

  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };
}

function runPowerShellScript(step = {}, context = {}, scriptName, args = []) {
  const scriptPath = resolveScriptPath(context, scriptName);

  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      ...args
    ],
    {
      cwd: context.projectPath || context.project?.path || process.cwd(),
      encoding: "utf8"
    }
  );

  return {
    executor: "powershell-executor",
    action: step.action,
    command: [scriptPath, ...args].join(" "),
    success: result.status === 0,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    executedAt: new Date().toISOString()
  };
}

function runRuntimeCorecheck(step = {}, context = {}) {
  return runPowerShellScript(step, context, "runtime-corecheck.ps1");
}

function runCheckpointWhenNeeded(step = {}, context = {}) {
  const apiHealth = checkLocalApiHealth();

  if (!apiHealth.ok) {
    return {
      executor: "powershell-executor",
      action: step.action,
      command: "runtime-checkpoint.ps1",
      success: false,
      skipped: true,
      reason: "Local API server is not running. Start honne_fortune server before checkpoint.",
      apiHealth,
      executedAt: new Date().toISOString()
    };
  }

  const commitMessage =
    step.commitMessage ||
    context.commitMessage ||
    "Run Ash managed checkpoint";

  const expectedAuditKey =
    step.expectedAuditKey ||
    context.expectedAuditKey ||
    "sectionMergeValidationRuntime";

  return runPowerShellScript(
    step,
    context,
    "runtime-checkpoint.ps1",
    [
      "-CommitMessage",
      commitMessage,
      "-ExpectedAuditKey",
      expectedAuditKey
    ]
  );
}

module.exports = {
  runRuntimeCorecheck,
  runCheckpointWhenNeeded,
  resolveScriptPath,
  checkLocalApiHealth
};
