"use strict";

const coreCheckPath = require.resolve("./corecheck-runtime");
const managerPath = require.resolve("./autonomous-development-manager");

const originalCoreCheckCache = require.cache[coreCheckPath];
const originalManagerCache = require.cache[managerPath];

require.cache[coreCheckPath] = {
  id: coreCheckPath,
  filename: coreCheckPath,
  loaded: true,
  exports: {
    runCoreCheck: () => ({
      mode: "pending-repair-bootstrap-corecheck-stub",
      success: true,
      checkpointRecommended: false
    })
  }
};

delete require.cache[managerPath];

const {
  runAutonomousDevelopmentManager
} = require("./autonomous-development-manager");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const pendingRepairTask = {
  task: "Resume verified pending repair",
  priority: "critical",
  source: "repair_patch",
  targetFile:
    "ash/runtime/autonomous-development-manager.js",
  targetSymbol:
    "runAutonomousDevelopmentManager",
  work: [
    "self-evolution",
    "repair"
  ],
  failureStage:
    "implementation-provider",
  errorMessage:
    "Verified pending repair bootstrap regression."
};

try {
  const withPendingRepair =
    runAutonomousDevelopmentManager({
      task:
        "Explicit user task that must remain behind the pending repair",
      context: {
        projectPath: process.cwd(),
        pendingRepairTask
      },
      maxCycles: 1,
      dryRun: true
    });

  assert(
    Array.isArray(withPendingRepair.cycles) &&
    withPendingRepair.cycles.length >= 1,
    "Manager did not execute a first cycle."
  );

  const selectedPendingRepair =
    withPendingRepair.cycles[0].selectedTask;

  assert(
    selectedPendingRepair === pendingRepairTask,
    "Caller-supplied pending repair was not selected by identity."
  );

  assert(
    selectedPendingRepair.task ===
      "Resume verified pending repair",
    "Caller-supplied pending repair task was not selected first."
  );

  const withoutPendingRepair =
    runAutonomousDevelopmentManager({
      task:
        "Explicit user task without pending repair",
      context: {
        projectPath: process.cwd()
      },
      maxCycles: 1,
      dryRun: true
    });

  assert(
    Array.isArray(withoutPendingRepair.cycles) &&
    withoutPendingRepair.cycles.length >= 1,
    "Control manager run did not execute a first cycle."
  );

  const selectedControlTask =
    withoutPendingRepair.cycles[0].selectedTask;

  assert(
    selectedControlTask &&
    selectedControlTask.source ===
      "user-explicit-task",
    "Behavior without context.pendingRepairTask changed."
  );

  assert(
    selectedControlTask.task ===
      "Explicit user task without pending repair",
    "Explicit user task was not preserved in the control run."
  );

  console.log(
    JSON.stringify(
      {
        mode:
          "autonomous-development-pending-repair-bootstrap-regression-test",
        success: true,
        pendingRepairSelectedFirst:
          selectedPendingRepair === pendingRepairTask,
        pendingRepairSource:
          selectedPendingRepair.source,
        controlSource:
          selectedControlTask.source,
        controlTask:
          selectedControlTask.task
      },
      null,
      2
    )
  );
} finally {
  if (originalCoreCheckCache) {
    require.cache[coreCheckPath] = originalCoreCheckCache;
  } else {
    delete require.cache[coreCheckPath];
  }

  if (originalManagerCache) {
    require.cache[managerPath] = originalManagerCache;
  } else {
    delete require.cache[managerPath];
  }
}
