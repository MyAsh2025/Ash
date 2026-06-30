"use strict";

function normalizeAction(task = "") {
  return String(task || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unknown_task";
}

function buildExecutionQueue({
  generatedTask = null,
  source = "task-generator"
} = {}) {
  const nextTask = generatedTask?.nextTask || {};
  const task = nextTask.task || "Unknown task";
  const priority = nextTask.priority || "normal";

  const item = {
    id: `queue-${Date.now()}`,
    task,
    action: normalizeAction(task),
    priority,
    status: "waiting",
    source,
    reason: nextTask.reason || null,
    targetFile: nextTask.file || nextTask.targetFile || null,
    work: Array.isArray(nextTask.work) ? nextTask.work : [],
    createdAt: new Date().toISOString()
  };

  return {
    mode: "execution-queue-runtime",
    version: "ash-local-runtime-v0.1",
    success: true,
    queue: [item],
    size: 1,
    createdAt: new Date().toISOString()
  };
}

module.exports = {
  buildExecutionQueue,
  normalizeAction
};

