const fs = require("fs");
const path = require("path");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getRuntimeStateDir() {
  return path.join(process.cwd(), "ash", "runtime-state");
}

function getLatestRuntimeStatePath() {
  return path.join(getRuntimeStateDir(), "latest-runtime.json");
}

function writeRuntimeState(runtimeResult = {}) {
  const stateDir = getRuntimeStateDir();
  ensureDir(stateDir);

  const latestPath = getLatestRuntimeStatePath();

  const state = {
    mode: "persistent-runtime-state",
    version: "ash-local-runtime-v0.1",
    latestRuntime: {
      task: runtimeResult.task || null,
      project: runtimeResult.projectContext?.project?.id || null,
      projectPath:
        runtimeResult.projectContext?.project?.path ||
        runtimeResult.projectContext?.projectPath ||
        null,
      resumeState: runtimeResult.resumeRuntime?.resumeState || null,
      saveCompleted: Boolean(runtimeResult.saveVerification?.saveCompleted),
      shutdownCompleted: Boolean(runtimeResult.shutdownRuntime?.shutdownCompleted),
      completedActions: runtimeResult.queueExecution?.queueState?.completedActions || [],
      executiveRuntime: runtimeResult.executiveRuntime
        ? {
            objective: runtimeResult.executiveRuntime.objective,
            priority: runtimeResult.executiveRuntime.priority,
            domain: runtimeResult.executiveRuntime.domain,
            nextActions: runtimeResult.executiveRuntime.nextActions || [],
            continueExecution: runtimeResult.executiveRuntime.continueExecution,
            requiresHumanReview: runtimeResult.executiveRuntime.requiresHumanReview
          }
        : null,
      repositoryStrategy: runtimeResult.repositoryStrategy
        ? {
            strategy: runtimeResult.repositoryStrategy.strategy,
            strategyActions: runtimeResult.repositoryStrategy.strategyActions || [],
            commitCandidate: runtimeResult.repositoryStrategy.commitCandidate,
            pushCandidate: runtimeResult.repositoryStrategy.pushCandidate,
            requiresHumanReview: runtimeResult.repositoryStrategy.requiresHumanReview,
            allowedToAutoCommit: runtimeResult.repositoryStrategy.allowedToAutoCommit,
            reason: runtimeResult.repositoryStrategy.reason
          }
        : null,
      governor: runtimeResult.runtimeGovernor
        ? {
            nextState: runtimeResult.runtimeGovernor.nextState,
            nextActions: runtimeResult.runtimeGovernor.nextActions || [],
            shouldContinue: runtimeResult.runtimeGovernor.shouldContinue,
            shouldIdle: runtimeResult.runtimeGovernor.shouldIdle,
            shouldReport: runtimeResult.runtimeGovernor.shouldReport,
            reason: runtimeResult.runtimeGovernor.reason
          }
        : null,
      logPath: runtimeResult.logPath || null
    },
    savedAt: new Date().toISOString()
  };

  fs.writeFileSync(latestPath, JSON.stringify(state, null, 2), "utf8");

  return {
    mode: "runtime-state-writer",
    version: "ash-local-runtime-v0.1",
    path: latestPath,
    saved: true,
    state
  };
}

function readRuntimeState() {
  const latestPath = getLatestRuntimeStatePath();

  if (!fs.existsSync(latestPath)) {
    return {
      mode: "runtime-state-reader",
      version: "ash-local-runtime-v0.1",
      exists: false,
      path: latestPath,
      state: null
    };
  }

  return {
    mode: "runtime-state-reader",
    version: "ash-local-runtime-v0.1",
    exists: true,
    path: latestPath,
    state: JSON.parse(fs.readFileSync(latestPath, "utf8"))
  };
}

module.exports = {
  writeRuntimeState,
  readRuntimeState,
  getRuntimeStateDir,
  getLatestRuntimeStatePath
};



