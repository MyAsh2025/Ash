function buildCompletedActionSet(queue = []) {
  return new Set(
    queue
      .filter((item) => item.lifecycle?.state === "completed")
      .map((item) => item.action)
  );
}

function refreshQueueItem(item, completedActions) {
  if (item.lifecycle?.state !== "blocked") {
    return {
      ...item,
      state: undefined
    };
  }

  const dependencies = item.dependencies || [];
  const missingDependencies = dependencies.filter(
    (dependency) => !completedActions.has(dependency)
  );

  if (missingDependencies.length > 0) {
    return {
      ...item,
      state: undefined,
      missingDependencies,
      lifecycle: {
        ...(item.lifecycle || {}),
        state: "blocked",
        updatedAt: new Date().toISOString()
      }
    };
  }

  return {
    ...item,
    state: undefined,
    missingDependencies: [],
    lifecycle: {
      ...(item.lifecycle || {}),
      previousState: item.lifecycle?.state || null,
      state: "ready",
      updatedAt: new Date().toISOString()
    }
  };
}

function refreshQueueState(queueState = {}) {
  const queue = queueState.queue || [];
  const completedActions = buildCompletedActionSet(queue);
  const refreshedQueue = queue.map((item) =>
    refreshQueueItem(item, completedActions)
  );

  return {
    mode: "queue-refresh-runtime",
    version: "ash-local-runtime-v0.1",
    queue: refreshedQueue,
    readyItems: refreshedQueue.filter((item) => item.lifecycle?.state === "ready"),
    blockedItems: refreshedQueue.filter((item) => item.lifecycle?.state === "blocked"),
    runningItems: refreshedQueue.filter((item) => item.lifecycle?.state === "running"),
    completedItems: refreshedQueue.filter((item) => item.lifecycle?.state === "completed"),
    failedItems: refreshedQueue.filter((item) => item.lifecycle?.state === "failed"),
    completedActions: [...completedActions],
    refreshedAt: new Date().toISOString()
  };
}

module.exports = {
  refreshQueueState,
  refreshQueueItem,
  buildCompletedActionSet
};



