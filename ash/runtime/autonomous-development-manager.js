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
      pipelineResult?.mode ||
      failedStep?.action ||
      "capability-loop",
    errorMessage:
      pipelineResult?.reason ||
      classification?.reason ||
      capabilityLoop?.stopReason ||
      "Capability loop failed.",
    failedAction: failedStep?.action || null
  };
}
function runAutonomousDevelopmentManager({
  task = "autonomous development",
  context = {},
  maxCycles = 1,
  dryRun = false
} = {}) {
  const cycles = [];

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

    const discoveredTask = explicitUserTask || taskDiscovery.task;

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
      coreCheck
    });

    if (!capabilityLoop.success || !coreCheck.success) {
      const capabilityFailure = !capabilityLoop.success
        ? extractCapabilityFailure(capabilityLoop)
        : null;

      return {
        mode: "autonomous-development-manager-runtime",
        version: "ash-local-runtime-v0.1",
        success: false,
        stopped: true,
        stopReason: !capabilityLoop.success
          ? "capability_loop_failed"
          : "corecheck_failed",
        failureStage: capabilityFailure?.failureStage || null,
        errorMessage: capabilityFailure?.errorMessage || null,
        failedAction: capabilityFailure?.failedAction || null,
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

