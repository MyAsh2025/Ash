"use strict";

const { resolveExecutionAdapter } = require("./execution-adapter");
const { buildPatchPlanner } = require("./patch-planner");

function adaptQueueItemForExecution({
  item = null,
  context = {}
} = {}) {
  if (!item) {
    return {
      mode: "queue-task-adapter-runtime",
      version: "ash-local-runtime-v0.1",
      success: false,
      reason: "No queue item provided."
    };
  }

  const step = {
    action: "prepare_patch_plan",
    queueId: item.id || item.queueId || null,
    task: item.task,
    priority: item.priority || "normal",
    source: item.source || "execution-queue",
    reason: item.reason || null
  };

  const adapter = resolveExecutionAdapter(step);
  const patchPlanner = buildPatchPlanner({
    task: item.task,
    executionPolicy: {
      plannedActions: ["prepare_patch_plan"]
    },
    companyPlanner: null
  });

  return {
    mode: "queue-task-adapter-runtime",
    version: "ash-local-runtime-v0.1",
    success: true,
    item,
    step,
    adapter,
    patchPlanner,
    readyForPatchPlanning: Boolean(patchPlanner.planReady),
    adaptedAt: new Date().toISOString()
  };
}

module.exports = {
  adaptQueueItemForExecution
};
