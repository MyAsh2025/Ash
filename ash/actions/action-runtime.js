const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function resolveExistingScript(projectPath, configuredScript, fallbackNames = []) {
  const candidates = [];

  if (configuredScript) {
    candidates.push(path.join(projectPath, configuredScript));
  }

  for (const name of fallbackNames) {
    candidates.push(path.join(projectPath, name));
    candidates.push(path.join(projectPath, "scripts", name));
  }

  const found = candidates.find((candidate) => fs.existsSync(candidate));

  return {
    script: found || candidates[0],
    found: Boolean(found),
    candidates
  };
}

function runPowerShellScript(script, args = [], cwd = process.cwd()) {
  const result = spawnSync("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    script,
    ...args
  ], {
    cwd,
    encoding: "utf8",
    shell: false
  });

  return {
    action: "powershell",
    cwd,
    script,
    args,
    status: result.status,
    success: result.status === 0,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
    executedAt: new Date().toISOString()
  };
}

function runAction(action, context = {}) {
  const project = context.projectContext?.project || context.project || {};
  const projectPath = project.path || context.projectPath || process.cwd();

  if (action === "run_corecheck" || action === "runtime_corecheck") {
    const resolved = resolveExistingScript(
      projectPath,
      project.scripts?.corecheck,
      ["runtime-corecheck.ps1"]
    );

    if (!resolved.found) {
      return {
        action,
        success: false,
        cwd: projectPath,
        script: resolved.script,
        error: "CoreCheck script not found.",
        candidates: resolved.candidates,
        executedAt: new Date().toISOString()
      };
    }

    return runPowerShellScript(
      resolved.script,
      [
        "-Intent",
        context.task || "ash action runtime",
        "-RuntimeChange"
      ],
      projectPath
    );
  }

  if (action === "run_checkpoint_when_needed") {
    const commitMessage = context.commitMessage || context.checkpoint?.commitMessage;
    const expectedAuditKey = context.expectedAuditKey || context.checkpoint?.expectedAuditKey;

    if (!commitMessage || !expectedAuditKey) {
      return {
        action,
        success: true,
        skipped: true,
        reason: "Checkpoint requires commitMessage and expectedAuditKey.",
        cwd: projectPath,
        executedAt: new Date().toISOString()
      };
    }

    const resolved = resolveExistingScript(
      projectPath,
      project.scripts?.checkpoint,
      ["runtime-checkpoint.ps1"]
    );

    if (!resolved.found) {
      return {
        action,
        success: false,
        cwd: projectPath,
        script: resolved.script,
        error: "Checkpoint script not found.",
        candidates: resolved.candidates,
        executedAt: new Date().toISOString()
      };
    }

    return runPowerShellScript(
      resolved.script,
      [
        "-CommitMessage",
        commitMessage,
        "-ExpectedAuditKey",
        expectedAuditKey
      ],
      projectPath
    );
  }

  return {
    action,
    success: true,
    simulated: true,
    result: "No concrete action binding yet.",
    executedAt: new Date().toISOString()
  };
}

module.exports = { runAction, resolveExistingScript };

