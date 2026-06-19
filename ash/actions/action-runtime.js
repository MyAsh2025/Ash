const path = require("path");
const { spawnSync } = require("child_process");

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
  const project = context.projectContext?.project || {};
  const projectPath = project.path || process.cwd();

  if (action === "run_corecheck" || action === "runtime_corecheck") {
    const script = project.scripts?.corecheck
      ? path.join(projectPath, project.scripts.corecheck)
      : path.join(projectPath, "scripts", "runtime-corecheck.ps1");

    return runPowerShellScript(
      script,
      [
        "-Intent",
        context.task || "ash action runtime",
        "-RuntimeChange"
      ],
      projectPath
    );
  }

  if (action === "run_checkpoint_when_needed") {
    return {
      action,
      success: true,
      skipped: true,
      result: "Checkpoint action is not bound yet.",
      executedAt: new Date().toISOString()
    };
  }

  return {
    action,
    success: true,
    simulated: true,
    result: "No concrete action binding yet.",
    executedAt: new Date().toISOString()
  };
}

module.exports = { runAction };
