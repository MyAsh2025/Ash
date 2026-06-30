"use strict";

const { observeRepository } = require("./repository-observation-runtime");
const { discoverTaskFromRepository } = require("./task-discovery-runtime");
const { runCapabilityLoop } = require("./capability-loop");
const { runCoreCheck } = require("./corecheck-runtime");

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

    const explicitUserTask = hasExplicitUserTask
      ? {
          task: task.trim(),
          priority: "critical",
          source: "user-explicit-task",
          file: null,
          work: ["self-evolution", "priority"],
          reason: "Explicit user task takes priority over repository observation."
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
      return {
        mode: "autonomous-development-manager-runtime",
        version: "ash-local-runtime-v0.1",
        success: false,
        stopped: true,
        stopReason: !capabilityLoop.success
          ? "capability_loop_failed"
          : "corecheck_failed",
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

