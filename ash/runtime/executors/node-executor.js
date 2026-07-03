const { spawnSync } = require("child_process");
const path = require("path");

function runNodeCheck(step = {}, context = {}) {
  const projectPath = context.projectPath || process.cwd();
  const targetFile =
    step.targetFile ||
    context.targetFile ||
    path.join(projectPath, "server", "index.js");

  const result = spawnSync("node", ["--check", targetFile], {
    cwd: projectPath,
    encoding: "utf8",
    shell: false
  });

  return {
    executor: "node-executor",
    action: step.action || "node_check",
    command: `node --check ${targetFile}`,
    cwd: projectPath,
    success: result.status === 0,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    executedAt: new Date().toISOString()
  };
}

module.exports = {
  runNodeCheck
};
