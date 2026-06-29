"use strict";

const { executeExecutiveTask } = require("./executive-runtime");

function runQueueItem({
  item = null,
  context = {},
  maxSteps = 8
} = {}) {
  if (!item) {
    return {
      mode: "execution-worker-runtime",
      version: "ash-local-runtime-v0.1",
      success: false,
      status: "failed",
      reason: "No queue item provided.",
      ranAt: new Date().toISOString()
    };
  }

  const runningItem = {
    ...item,
    status: "running",
    startedAt: new Date().toISOString()
  };

  const execution = executeExecutiveTask({
    task: item.task,
    context,
    maxSteps
  });

  const completedItem = {
    ...runningItem,
    status: execution.success ? "completed" : "failed",
    completedAt: new Date().toISOString()
  };

  return {
    mode: "execution-worker-runtime",
    version: "ash-local-runtime-v0.1",
    success: Boolean(execution.success),
    item: completedItem,
    execution,
    ranAt: new Date().toISOString()
  };
}

function runExecutionWorker({
  executionQueue = null,
  context = {},
  maxSteps = 8
} = {}) {
  const queue = executionQueue?.queue || [];
  const nextItem = queue.find((item) => item.status === "waiting") || null;
  const result = runQueueItem({
    item: nextItem,
    context,
    maxSteps
  });

  return {
    mode: "execution-worker-runtime",
    version: "ash-local-runtime-v0.1",
    success: Boolean(result.success),
    processed: Boolean(nextItem),
    result,
    remainingQueue: queue
      .filter((item) => item.id !== nextItem?.id)
      .map((item) => ({ ...item })),
    ranAt: new Date().toISOString()
  };
}

module.exports = {
  runQueueItem,
  runExecutionWorker
};
