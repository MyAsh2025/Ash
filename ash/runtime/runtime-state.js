const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getRuntimeStateDir(
  projectPath = process.cwd()
) {
  return path.join(
    projectPath,
    "ash",
    "runtime-state"
  );
}

function getLatestRuntimeStatePath(
  projectPath = process.cwd()
) {
  return path.join(
    getRuntimeStateDir(
      projectPath
    ),
    "latest-runtime.json"
  );
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


function buildAutonomousTaskIdentity(
  task = null
) {
  if (
    !task ||
    typeof task !== "object"
  ) {
    return null;
  }

  return JSON.stringify({
    task:
      task.task || null,

    source:
      task.source || null,

    targetFile:
      task.targetFile ||
      task.file ||
      null,

    targetSymbol:
      task.targetSymbol || null,

    work:
      Array.isArray(
        task.work
      )
        ? task.work
        : []
  });
}

function resolveAutonomousTargetFingerprint({
  task = null,
  projectPath = process.cwd()
} = {}) {
  const targetFile =
    task?.targetFile ||
    task?.file ||
    null;

  if (
    typeof targetFile !== "string" ||
    targetFile.trim().length === 0
  ) {
    return null;
  }

  const absolutePath =
    path.resolve(
      projectPath,
      targetFile
    );

  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  const stat =
    fs.statSync(
      absolutePath
    );

  if (!stat.isFile()) {
    return null;
  }

  return crypto
    .createHash("sha256")
    .update(
      fs.readFileSync(
        absolutePath
      )
    )
    .digest("hex");
}

function readAutonomousCompletedTasks({
  projectPath = process.cwd()
} = {}) {
  const latestPath =
    getLatestRuntimeStatePath(
      projectPath
    );

  if (!fs.existsSync(latestPath)) {
    return {
      mode:
        "autonomous-completion-state-reader",
      version:
        "ash-local-runtime-v0.1-fingerprint",
      exists:
        false,
      path:
        latestPath,
      tasks: [],
      records: []
    };
  }

  const state =
    JSON.parse(
      fs.readFileSync(
        latestPath,
        "utf8"
      )
    );

  const records =
    Array.isArray(
      state
        ?.autonomousDevelopment
        ?.completedTasks
    )
      ? state
          .autonomousDevelopment
          .completedTasks
      : [];

  const activeRecords =
    records.filter(
      (record) => {
        if (
          !record ||
          typeof record !== "object" ||
          !record.task
        ) {
          return false;
        }

        const currentFingerprint =
          resolveAutonomousTargetFingerprint({
            task:
              record.task,
            projectPath
          });

        return (
          typeof record.targetFingerprint ===
            "string" &&
          record.targetFingerprint.length > 0 &&
          currentFingerprint ===
            record.targetFingerprint
        );
      }
    );

  return {
    mode:
      "autonomous-completion-state-reader",
    version:
      "ash-local-runtime-v0.1-fingerprint",
    exists:
      true,
    path:
      latestPath,
    tasks:
      activeRecords.map(
        (record) =>
          record.task
      ),
    records:
      activeRecords
  };
}

function writeAutonomousCompletedTask({
  task = null,
  projectPath = process.cwd()
} = {}) {
  const identity =
    buildAutonomousTaskIdentity(
      task
    );

  const targetFingerprint =
    resolveAutonomousTargetFingerprint({
      task,
      projectPath
    });

  if (
    !identity ||
    !targetFingerprint
  ) {
    return {
      mode:
        "autonomous-completion-state-writer",
      version:
        "ash-local-runtime-v0.1-fingerprint",
      saved:
        false,
      reason:
        "A concrete task identity and target-file fingerprint are required."
    };
  }

  const stateDir =
    getRuntimeStateDir(
      projectPath
    );

  ensureDir(
    stateDir
  );

  const latestPath =
    getLatestRuntimeStatePath(
      projectPath
    );

  let state = {
    mode:
      "persistent-runtime-state",
    version:
      "ash-local-runtime-v0.1",
    latestRuntime:
      null
  };

  if (fs.existsSync(latestPath)) {
    state =
      JSON.parse(
        fs.readFileSync(
          latestPath,
          "utf8"
        )
      );
  }

  const existingRecords =
    Array.isArray(
      state
        ?.autonomousDevelopment
        ?.completedTasks
    )
      ? state
          .autonomousDevelopment
          .completedTasks
      : [];

  const retainedRecords =
    existingRecords.filter(
      (record) =>
        buildAutonomousTaskIdentity(
          record?.task
        ) !== identity
    );

  const record = {
    identity,
    task,
    targetFingerprint,
    completedAt:
      new Date().toISOString()
  };

  state.autonomousDevelopment = {
    mode:
      "autonomous-development-completion-state",
    version:
      "ash-local-runtime-v0.1-fingerprint",
    completedTasks: [
      ...retainedRecords,
      record
    ]
  };

  state.savedAt =
    new Date().toISOString();

  fs.writeFileSync(
    latestPath,
    JSON.stringify(
      state,
      null,
      2
    ),
    "utf8"
  );

  return {
    mode:
      "autonomous-completion-state-writer",
    version:
      "ash-local-runtime-v0.1-fingerprint",
    saved:
      true,
    path:
      latestPath,
    record
  };
}

module.exports = {
  writeRuntimeState,
  readRuntimeState,
  getRuntimeStateDir,
  getLatestRuntimeStatePath,
  readAutonomousCompletedTasks,
  writeAutonomousCompletedTask
};



