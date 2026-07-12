"use strict";

function extractExplicitTargetFile(task = "") {
  const text = String(task || "");
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();

    const inlineTarget = line.match(/^target(?:\s+file)?\s*:\s*(.+)$/i);
    if (inlineTarget && inlineTarget[1]) {
      const candidate = inlineTarget[1].trim().replace(/^[-*]\s*/, "");
      if (/\.(js|json|md|ps1|txt)$/i.test(candidate)) return candidate;
    }

    if (/^target(?:\s+file)?\s*:?\s*$/i.test(line) && lines[i + 1]) {
      const candidate = lines[i + 1].trim().replace(/^[-*]\s*/, "");
      if (/\.(js|json|md|ps1|txt)$/i.test(candidate)) return candidate;
    }
  }

  const pathMatch = text.match(/\b(ash[\/\\][A-Za-z0-9._\/\\-]+\.(?:js|json|md|ps1|txt))\b/i);
  return pathMatch ? pathMatch[1].replace(/\\/g, "/") : null;
}
const { observeRepository } = require("./repository-observation-runtime");
const { discoverTaskFromRepository } = require("./task-discovery-runtime");
const { runCapabilityLoop } = require("./capability-loop");
const { runCoreCheck } = require("./corecheck-runtime");

function extractCapabilityFailure(capabilityLoop = null) {
  const failedStep = [...(capabilityLoop?.steps || [])]
    .reverse()
    .find((step) =>
      step?.classification?.success === false ||
      step?.dispatchResult?.classification?.success === false ||
      step?.dispatchResult?.result?.result?.success === false
    );

  const pipelineResult = failedStep?.dispatchResult?.result?.result || null;
  const classification = failedStep?.classification || failedStep?.dispatchResult?.classification || null;

  return {
    failureStage:
      pipelineResult?.failureStage ||
      pipelineResult?.mode ||
      failedStep?.action ||
      "capability-loop",
    errorMessage:
      pipelineResult?.reason ||
      classification?.reason ||
      capabilityLoop?.stopReason ||
      "Capability loop failed.",
    failedAction: failedStep?.action || null,
    issues: Array.isArray(pipelineResult?.patchValidator?.issues)
      ? pipelineResult.patchValidator.issues
      : [],
    validatedOperations: Array.isArray(
      pipelineResult?.patchValidator?.validatedOperations
    )
      ? pipelineResult.patchValidator.validatedOperations
      : [],
    targetFile:
      pipelineResult?.patchValidator?.validatedOperations?.[0]?.file ||
      pipelineResult?.editPlanner?.edits?.[0]?.file ||
      null
  };
}

function buildRepairTask({
  failure,
  previousTask,
  cycleIndex
} = {}) {
  const issues = Array.isArray(failure?.issues)
    ? failure.issues
    : [];

  const validatedOperations = Array.isArray(failure?.validatedOperations)
    ? failure.validatedOperations
    : [];

  return {
    task: [
      "Repair autonomous development failure",
      failure?.failureStage ? `at ${failure.failureStage}` : null,
      failure?.targetFile ? `for ${failure.targetFile}` : null
    ].filter(Boolean).join(" "),
    priority: "critical",
    source: "autonomous-failure-recovery",
    file: failure?.targetFile || previousTask?.file || null,
    targetFile:
      failure?.targetFile ||
      previousTask?.targetFile ||
      previousTask?.file ||
      null,
    work: [
      "repair",
      "self-evolution",
      failure?.failureStage || "capability-loop"
    ],
    failureStage: failure?.failureStage || null,
    errorMessage: failure?.errorMessage || null,
    failedAction: failure?.failedAction || null,
    issues,
    validatedOperations,
    previousTask: previousTask || null,
    repairAction: "repair_patch",
    cycleIndex,
    reason: [
      failure?.errorMessage || "Autonomous development failed.",
      issues.length > 0 ? `Issues: ${issues.join(" | ")}` : null,
      "Repair this failure and continue autonomous development."
    ].filter(Boolean).join(" ")
  };
}
function runAutonomousDevelopmentManager({
  task = "autonomous development",
  context = {},
  maxCycles = 1,
  dryRun = false
} = {}) {
  const cycles = [];
  let pendingRepairTask = null;

  for (let i = 0; i < maxCycles; i++) {
    const repositoryObservation = observeRepository({
      projectPath: context.projectPath || process.cwd()
    });

    const taskDiscovery = discoverTaskFromRepository({
      observation: repositoryObservation
    });

    if (!taskDiscovery.discovered) {
      return {
        mode: "autonomous-development-manager-runtime",
        version: "ash-local-runtime-v0.1",
        success: true,
        stopped: true,
        stopReason: "no_repository_task",
        cycles,
        finalObservation: repositoryObservation,
        ranAt: new Date().toISOString()
      };
    }

    const hasExplicitUserTask =
      task &&
      task.trim() &&
      task.trim() !== "autonomous development" &&
      task.trim() !== "run fully autonomous Ash development";

    const explicitTargetFile = hasExplicitUserTask ? extractExplicitTargetFile(task) : null;

    const explicitUserTask = hasExplicitUserTask
      ? {
          task: task.trim(),
          priority: "critical",
          source: "user-explicit-task",
          file: explicitTargetFile,
          targetFile: explicitTargetFile,
          work: ["self-evolution", "priority"],
          reason: explicitTargetFile
            ? `Explicit user task targets ${explicitTargetFile}.`
            : "Explicit user task takes priority over repository observation."
        }
      : null;

    const discoveredTask =
      pendingRepairTask ||
      explicitUserTask ||
      taskDiscovery.task;

    pendingRepairTask = null;

    const capabilityLoop = runCapabilityLoop({
      task: discoveredTask.task || task,
      initialAction: "minimal_core_gate",
      initialInput: {
        generatedTask: {
          nextTask: discoveredTask
        },
        dryRun
      },
      context: {
        ...context,
        generatedTask: {
          nextTask: discoveredTask
        },
        dryRun
      },
      maxSteps: 8
    });

    const coreCheck = runCoreCheck({
      files: [
        "./ash/runtime/autonomous-development-manager.js",
        "./ash/runtime/development-pipeline-runtime.js",
        "./ash/runtime/capability-loop.js",
        "./ash/capabilities/development-pipeline.js"
      ]
    });

    cycles.push({
      index: i,
      repositoryObservation,
      taskDiscovery,
      selectedTask: discoveredTask,
      capabilityLoop,
      coreCheck,
      repairTask: null
    });

    if (!capabilityLoop.success || !coreCheck.success) {
      const capabilityFailure = !capabilityLoop.success
        ? extractCapabilityFailure(capabilityLoop)
        : null;

      if (!coreCheck.success) {
        return {
          mode: "autonomous-development-manager-runtime",
          version: "ash-local-runtime-v0.2-repair-carryover",
          success: false,
          stopped: true,
          stopReason: "corecheck_failed",
          failureStage: null,
          errorMessage: coreCheck.reason || "CoreCheck failed.",
          failedAction: null,
          cycles,
          ranAt: new Date().toISOString()
        };
      }

      const repairTask = buildRepairTask({
        failure: capabilityFailure,
        previousTask: discoveredTask,
        cycleIndex: i
      });

      cycles[cycles.length - 1].repairTask = repairTask;
      pendingRepairTask = repairTask;

      if (i < maxCycles - 1) {
        continue;
      }

      return {
        mode: "autonomous-development-manager-runtime",
        version: "ash-local-runtime-v0.2-repair-carryover",
        success: false,
        stopped: true,
        stopReason: "max_cycles_reached_with_pending_repair",
        failureStage: capabilityFailure?.failureStage || null,
        errorMessage: capabilityFailure?.errorMessage || null,
        failedAction: capabilityFailure?.failedAction || null,
        pendingRepairTask: repairTask,
        cycles,
        ranAt: new Date().toISOString()
      };
    }
  }

  return {
    mode: "autonomous-development-manager-runtime",
    version: "ash-local-runtime-v0.1",
    success: true,
    stopped: true,
    stopReason: "max_cycles_reached",
    cycles,
    ranAt: new Date().toISOString()
  };
}

module.exports = {
  runAutonomousDevelopmentManager
};

