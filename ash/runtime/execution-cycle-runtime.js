"use strict";

const { executeExecutiveTask } = require("./executive-runtime");
const { buildGoalProgressRuntime } = require("./goal-progress-runtime");
const { generateNextTask } = require("./task-generator-runtime");
const { buildExecutionQueue } = require("./execution-queue-runtime");

function runExecutionCycle({
  task = "",
  context = {},
  maxCycles = 1,
  maxSteps = 8
} = {}) {
  const cycles = [];
  let currentTask = task;

  for (let i = 0; i < maxCycles; i++) {
    const executive = executeExecutiveTask({
      task: currentTask,
      context,
      maxSteps
    });

    const goalProgress = buildGoalProgressRuntime({
      task: currentTask,
      goalRuntime: executive.goalRuntime,
      execution: executive.execution
    });

    const generatedTask = generateNextTask({
      executive,
      goalProgress,
      execution: executive.execution
    });

    const executionQueue = buildExecutionQueue({
      generatedTask,
      source: "execution-cycle"
    });

    cycles.push({
      index: i,
      task: currentTask,
      executive,
      goalProgress,
      generatedTask,
      executionQueue,
      decision: executive.decision,
      continueExecution: executive.continueExecution
    });

    if (!executive.continueExecution || !executive.success) {
      return {
        mode: "execution-cycle-runtime",
        version: "ash-local-runtime-v0.3-execution-queue",
        success: false,
        stopped: true,
        stopReason: executive.decision || "execution_failed",
        cycles,
        ranAt: new Date().toISOString()
      };
    }

    if (goalProgress.completed && maxCycles === 1) {
      return {
        mode: "execution-cycle-runtime",
        version: "ash-local-runtime-v0.3-execution-queue",
        success: true,
        stopped: true,
        stopReason: "cycle_complete",
        cycles,
        finalGoalProgress: goalProgress,
        nextRecommendedAction: goalProgress.nextPlanningTarget,
        ranAt: new Date().toISOString()
      };
    }

    currentTask = generatedTask?.nextTask?.task || goalProgress.nextPlanningTarget || currentTask;
  }

  return {
    mode: "execution-cycle-runtime",
    version: "ash-local-runtime-v0.3-execution-queue",
    success: true,
    stopped: true,
    stopReason: "max_cycles_reached",
    cycles,
    finalGoalProgress: cycles[cycles.length - 1]?.goalProgress || null,
    ranAt: new Date().toISOString()
  };
}

module.exports = {
  runExecutionCycle
};


