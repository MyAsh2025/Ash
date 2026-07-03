const { spawnSync } = require("child_process");

function runGitDiffCheck(step = {}, context = {}) {
  const projectPath = context.projectPath || process.cwd();

  const result = spawnSync("git", ["diff", "--check"], {
    cwd: projectPath,
    encoding: "utf8",
    shell: false
  });

  return {
    executor: "git-executor",
    action: step.action || "git_diff_check",
    command: "git diff --check",
    cwd: projectPath,
    success: result.status === 0,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    executedAt: new Date().toISOString()
  };
}

function inspectRepository(step = {}, context = {}) {
  const projectPath = context.projectPath || process.cwd();

  const result = spawnSync("git", ["status", "--short"], {
    cwd: projectPath,
    encoding: "utf8",
    shell: false
  });

  return {
    executor: "git-executor",
    action: step.action || "inspect_repository",
    command: "git status --short",
    cwd: projectPath,
    success: result.status === 0,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    clean: (result.stdout || "").trim().length === 0,
    executedAt: new Date().toISOString()
  };
}

module.exports = {
  runGitDiffCheck,
  inspectRepository
};
