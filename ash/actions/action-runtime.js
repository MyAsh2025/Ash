const { spawnSync } = require("child_process");

function runPowerShellScript(script, args = []) {
  const result = spawnSync("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    script,
    ...args
  ], {
    encoding: "utf8",
    shell: false
  });

  return {
    action: "powershell",
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
  if (action === "run_corecheck") {
    return runPowerShellScript(
      "C:\\Users\\Owner\\StudioProjects\\honne_fortune\\scripts\\runtime-corecheck.ps1",
      [
        "-Intent",
        context.task || "ash action runtime",
        "-RuntimeChange"
      ]
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

module.exports = { runAction };
