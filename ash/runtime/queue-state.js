function initializeQueueStateItem(item = {}) {
  return {
    ...item,
    lifecycle: {
      state: item.state || "queued",
      previousState: null,
      retryCount: 0,
      maxRetries: item.required ? 1 : 0,
      startedAt: null,
      finishedAt: null,
      error: null,
      updatedAt: new Date().toISOString()
    }
  };
}

function initializeQueueState(executionQueue = {}) {
  const queue = executionQueue.queue || [];
  const statefulQueue = queue.map(initializeQueueStateItem);

  return {
    mode: "queue-state-runtime",
    version: "ash-local-runtime-v0.1",
    queue: statefulQueue,
    readyItems: statefulQueue.filter((item) => item.lifecycle.state === "ready"),
    blockedItems: statefulQueue.filter((item) => item.lifecycle.state === "blocked"),
    runningItems: statefulQueue.filter((item) => item.lifecycle.state === "running"),
    completedItems: statefulQueue.filter((item) => item.lifecycle.state === "completed"),
    failedItems: statefulQueue.filter((item) => item.lifecycle.state === "failed"),
    initializedAt: new Date().toISOString()
  };
}

function transitionQueueItem(item = {}, nextState, metadata = {}) {
  return {
    ...item,
    lifecycle: {
      ...(item.lifecycle || {}),
      previousState: item.lifecycle?.state || item.state || null,
      state: nextState,
      retryCount: metadata.retryCount ?? item.lifecycle?.retryCount ?? 0,
      maxRetries: item.lifecycle?.maxRetries ?? (item.required ? 1 : 0),
      startedAt: nextState === "running"
        ? new Date().toISOString()
        : item.lifecycle?.startedAt || null,
      finishedAt: ["completed", "failed", "skipped"].includes(nextState)
        ? new Date().toISOString()
        : item.lifecycle?.finishedAt || null,
      error: metadata.error || null,
      updatedAt: new Date().toISOString()
    }
  };
}

module.exports = {
  initializeQueueState,
  initializeQueueStateItem,
  transitionQueueItem
};
