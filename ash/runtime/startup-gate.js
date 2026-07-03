const fs = require("fs");
const path = require("path");

function listRecentLogs(logDir, limit = 5) {
  if (!fs.existsSync(logDir)) {
    return [];
  }

  return fs.readdirSync(logDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .slice(-limit);
}

function classifyRepositoryState(repository = {}) {
  if (repository.clean === true) {
    return "completed";
  }

  const changedFiles = repository.changedFiles || [];

  if (changedFiles.length > 0) {
    return "implemented-but-uncommitted";
  }

  return "unverified";
}

function runStartupGate({ task, projectContext, repository, dryRun }) {
  const logDir = path.join(process.cwd(), "ash", "logs");
  const recentLogs = listRecentLogs(logDir);

  const repositoryState = classifyRepositoryState(repository);

  const coreCheckRequired =
    repositoryState !== "completed" ||
    Boolean(repository.risk && repository.risk !== "low") ||
    task.includes("runtime") ||
    task.includes("architecture") ||
    task.includes("corecheck") ||
    task.includes("gate");

  const saveVerificationRequired =
    repositoryState === "implemented-but-uncommitted";

  const handoverReviewRequired =
    recentLogs.length >= 5 ||
    task.includes("handover") ||
    task.includes("resume");

  return {
    mode: "startup-gate-runtime",
    version: "ash-local-runtime-v0.1",
    task,
    dryRun,
    projectPath: projectContext?.projectPath || null,
    repositoryState,
    stateClassification: {
      completed: repositoryState === "completed",
      implementedButUncommitted: repositoryState === "implemented-but-uncommitted",
      unverified: repositoryState === "unverified",
      unimplemented: false
    },
    gates: {
      coreCheckRequired,
      repositoryVerificationRequired: true,
      saveVerificationRequired,
      handoverReviewRequired,
      resumeRequired: true
    },
    recommendedActions: [
      "inspect_repository",
      ...(coreCheckRequired ? ["runtime_corecheck"] : []),
      ...(saveVerificationRequired ? ["git_diff_check"] : [])
    ],
    recentLogs,
    evaluatedAt: new Date().toISOString()
  };
}

module.exports = {
  runStartupGate,
  classifyRepositoryState
};
