"use strict";

const { resolveExecutionAdapter } = require("./execution-adapter");
const { buildPatchPlanner } = require("./patch-planner");
const { buildImplementationPlanner } = require("./implementation-planner");

function adaptQueueItemForExecution({
  item = null,
  context = {}
} = {}) {
  const bootstrap = context.bootstrap || null;
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
  const implementationPlanner = buildImplementationPlanner({
    task: item.task,
    targetFile:
      item.targetFile ||
      item.file ||
      null,
    work: item.work || [],
    implementationType:
      item.implementationType || null,
    strategy:
      item.strategy || null,
    recommendedOperation:
      item.recommendedOperation || null,
    confidence:
      item.confidence || null,
    targetSymbol:
      item.targetSymbol || null,
    symbolType:
      item.symbolType || null,
    expectedBehavior:
      item.expectedBehavior || [],
    implementationTemplate:
      item.implementationTemplate || null,
    repairAction:
      item.repairAction || null,
    failureStage:
      item.failureStage || null,
    issues:
      item.issues || [],
    previousTask:
      item.previousTask || null
  });

  const patchPlanner = buildPatchPlanner({
    task: item.task,
    targetFile:
      item.targetFile ||
      item.file ||
      implementationPlanner.targetFile ||
      null,
    work: item.work || [],
    targetSymbol:
      implementationPlanner.targetSymbol ||
      item.targetSymbol ||
      null,
    symbolType:
      implementationPlanner.symbolType ||
      item.symbolType ||
      null,
    expectedBehavior:
      implementationPlanner.expectedBehavior ||
      item.expectedBehavior ||
      [],
    recommendedOperation:
      implementationPlanner.recommendedOperation ||
      item.recommendedOperation ||
      null,
    executionPolicy: {
      plannedActions: ["prepare_patch_plan"]
    },
    companyPlanner: null,
    bootstrap
  });

  return {
    mode: "queue-task-adapter-runtime",
    version: "ash-local-runtime-v0.1",
    success: true,
    item,
    step,
    adapter,
    implementationPlanner,
    patchPlanner,
    readyForPatchPlanning: Boolean(patchPlanner.planReady),
    adaptedAt: new Date().toISOString()
  };
}

module.exports = {
  adaptQueueItemForExecution
};
