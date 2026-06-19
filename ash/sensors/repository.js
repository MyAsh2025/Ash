const { spawnSync } = require("child_process");

function runGit(args) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    shell: false
  });

  return {
    status: result.status,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim()
  };
}

function observeRepository() {
  const branchResult = runGit(["branch", "--show-current"]);
  const statusResult = runGit(["status", "--porcelain"]);
  const latestCommitResult = runGit(["rev-parse", "--short", "HEAD"]);
  const latestMessageResult = runGit(["log", "-1", "--pretty=%s"]);

  const changedFiles = statusResult.stdout
    ? statusResult.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    : [];

  const clean = changedFiles.length === 0;

  return {
    type: "repository",
    branch: branchResult.stdout || "unknown",
    clean,
    changedFiles,
    latestCommit: latestCommitResult.stdout || "unknown",
    latestMessage: latestMessageResult.stdout || "unknown",
    risk: clean ? "low" : "medium",
    observedAt: new Date().toISOString()
  };
}

module.exports = { observeRepository };
