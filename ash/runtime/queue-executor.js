const { transitionQueueItem } = require("./queue-state");
const { refreshQueueState } = require("./queue-refresh");
const { executeRealStep } = require("./real-executor");

function isExecutionApproved(approval = {}) {
  return Boolean(approval.executionAllowed);
}

function blockQueueStateForApproval(queueState = {}, approval = {}) {
  const queue = (queueState.queue || []).map((item) => {
    if (item.lifecycle?.state === "completed") {
      return item;
    }

    return transitionQueueItem(item, "blocked", {
      error: approval.reason || "Execution blocked by approval runtime."
    });
  });

  return refreshQueueState({ queue });
}

function simulateQueueItemExecution(item = {}) {
  const running = transitionQueueItem(item, "running");

  return {
    completed: transitionQueueItem(running, "completed", {
      result: "Simulated execution completed."
    }),
    result: {
      success: true,
      simulated: true
    }
  };
}

function realQueueItemExecution(item = {}, context = {}) {
  const running = transitionQueueItem(item, "running");
  const result = executeRealStep(item, context);

  const completed = transitionQueueItem(
    running,
    result.success || result.skipped ? "completed" : "failed",
    {
      result
    }
  );

  return {
    completed,
    result
  };
}

function executeReadyQueueItems(queueState = {}, options = {}) {
  const approval = options.approval || {};
  const executionMode = options.executionMode || "simulated";
  const context = options.context || {};

  if (!isExecutionApproved(approval)) {
    const blockedState = blockQueueStateForApproval(queueState, approval);

    return {
      mode: "queue-executor-runtime",
      version: "ash-local-runtime-v0.4-real-executor-gated",
      executionMode: "blocked",
      success: false,
      blockedByApproval: true,
      approval,
      results: [],
      queueState: blockedState,
      reason: approval.reason || "Execution blocked by approval runtime.",
      executedAt: new Date().toISOString()
    };
  }

  const results = [];
  let workingState = refreshQueueState({ queue: queueState.queue || [] });
  let iteration = 0;

  while (true) {
    iteration += 1;

    const nextReady = workingState.readyItems.find((item) =>
      !results.some((result) => result.queueId === item.queueId)
    );

    if (!nextReady) {
      break;
    }

    const execution = executionMode === "real"
      ? realQueueItemExecution(nextReady, context)
      : simulateQueueItemExecution(nextReady);

    const completed = execution.completed;
    const result = execution.result || {};

    results.push({
      queueId: nextReady.queueId,
      action: nextReady.action,
      assignedAgent: nextReady.assignedAgent || null,
      success: Boolean(result.success || result.skipped),
      skipped: Boolean(result.skipped),
      executor: result.executor || null,
      status: result.status ?? null,
      state: completed.lifecycle.state,
      executedAt: completed.lifecycle.finishedAt,
      result
    });

    const updatedQueue = workingState.queue.map((item) =>
      item.queueId === nextReady.queueId ? completed : item
    );

    workingState = refreshQueueState({ queue: updatedQueue });

    if (iteration > (queueState.queue || []).length + 1) {
      throw new Error("Queue executor exceeded safe iteration limit.");
    }
  }

  return {
    mode: "queue-executor-runtime",
    version: "ash-local-runtime-v0.4-real-executor-gated",
    executionMode,
    success: workingState.failedItems.length === 0 && workingState.blockedItems.length === 0,
    blockedByApproval: false,
    approval,
    results,
    queueState: workingState,
    executedAt: new Date().toISOString()
  };
}

module.exports = {
  executeReadyQueueItems,
  simulateQueueItemExecution,
  realQueueItemExecution,
  isExecutionApproved,
  blockQueueStateForApproval
};
