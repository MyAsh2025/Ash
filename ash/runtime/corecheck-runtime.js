"use strict";

const { spawnSync } = require("child_process");

function runCommand(command, args = []) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false
  });

  return {
    command,
    args,
    status: result.status,
    success: result.status === 0,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? result.error.message : null
  };
}

function runNodeCheck(files = []) {
  const results = files.map((file) => runCommand("node", ["--check", file]));

  return {
    mode: "node-check-runtime",
    success: results.length > 0 && results.every((result) => result.success),
    results
  };
}

function runGitDiffCheck() {
  const diff = runCommand("git", ["diff", "--stat"]);
  const status = runCommand("git", ["status", "--short"]);

  return {
    mode: "git-diff-check-runtime",
    success: diff.success && status.success,
    clean: status.stdout.trim().length === 0,
    diffStat: diff.stdout.trim(),
    statusShort: status.stdout.trim()
  };
}

function runCoreCheck({
  developmentPipeline = null,
  files = []
} = {}) {
  const nodeCheck = runNodeCheck(files);
  const gitDiffCheck = runGitDiffCheck();

  const developmentPipelineOk =
    developmentPipeline == null ||
    developmentPipeline.success === true;

  const success =
    nodeCheck.success &&
    gitDiffCheck.success &&
    developmentPipelineOk;

  return {
    mode: "corecheck-runtime",
    version: "ash-local-runtime-v0.1",
    success,
    developmentPipelineOk,
    nodeCheck,
    gitDiffCheck,
    repositoryClean: gitDiffCheck.clean,
    checkpointRecommended: success && !gitDiffCheck.clean,
    reason: success
      ? "CoreCheck passed."
      : "CoreCheck failed.",
    checkedAt: new Date().toISOString()
  };
}

module.exports = {
  runCoreCheck,
  runNodeCheck,
  runGitDiffCheck
};
