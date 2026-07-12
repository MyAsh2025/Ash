"use strict";

function normalizeWork(work = []) {
  return Array.isArray(work)
    ? work.filter(Boolean)
    : [];
}

function findOriginalTask(task = null) {
  let current = task;
  let depth = 0;

  while (
    current?.previousTask &&
    depth < 20
  ) {
    current = current.previousTask;
    depth += 1;
  }

  return current || task || null;
}

function classifyImplementation({
  task = "",
  work = []
} = {}) {
  const normalizedWork = normalizeWork(work);
  const lowerTask = String(task || "").toLowerCase();

  if (
    normalizedWork.includes("implementation") ||
    lowerTask.includes("implementation")
  ) {
    return {
      implementationType:
        "missing_implementation",
      strategy:
        "add_minimal_verified_runtime_extension",
      recommendedOperation:
        "insert-before",
      confidence:
        "medium"
    };
  }

  if (
    normalizedWork.includes("todo") ||
    lowerTask.includes("todo")
  ) {
    return {
      implementationType:
        "todo_resolution",
      strategy:
        "replace_or_expand_todo_after_anchor_verification",
      recommendedOperation:
        "replace",
      confidence:
        "medium"
    };
  }

  if (normalizedWork.includes("execution")) {
    return {
      implementationType:
        "execution_continuation",
      strategy:
        "extend_existing_execution_flow",
      recommendedOperation:
        "insert-after",
      confidence:
        "medium"
    };
  }

  return {
    implementationType: "review",
    strategy: "inspect_target_before_edit",
    recommendedOperation: "insert-before",
    confidence: "low"
  };
}

function buildImplementationPlanner({
  task = "",
  targetFile = null,
  work = [],
  repairAction = null,
  failureStage = null,
  issues = [],
  previousTask = null
} = {}) {
  const normalizedWork = normalizeWork(work);
  const originalTask = findOriginalTask(
    previousTask || {
      task,
      targetFile,
      work: normalizedWork
    }
  );

  const originalClassification =
    classifyImplementation({
      task: originalTask?.task || task,
      work: originalTask?.work || normalizedWork
    });

  const currentClassification =
    classifyImplementation({
      task,
      work: normalizedWork
    });

  const repairing =
    repairAction === "repair_patch" ||
    Boolean(failureStage) ||
    Boolean(previousTask);

  const selectedClassification =
    repairing &&
    originalClassification.implementationType !==
      "review"
      ? originalClassification
      : currentClassification;

  const resolvedTargetFile =
    targetFile ||
    originalTask?.targetFile ||
    originalTask?.file ||
    null;

  return {
    mode: "implementation-planner-runtime",
    version:
      "ash-local-runtime-v0.2-repair-strategy-carryover",
    success: Boolean(resolvedTargetFile || task),
    task,
    targetFile: resolvedTargetFile,
    work: normalizedWork,
    implementationType:
      selectedClassification.implementationType,
    strategy:
      selectedClassification.strategy,
    recommendedOperation:
      selectedClassification.recommendedOperation,
    confidence:
      selectedClassification.confidence,
    repairAware: repairing,
    repairAction,
    failureStage,
    issues: normalizeWork(issues),
    originalTask: originalTask || null,
    inheritedFromPreviousTask:
      repairing &&
      originalClassification.implementationType !==
        "review",
    requiresTargetLocator: true,
    requiresEditPlanner: true,
    reason: repairing
      ? `Repair implementation plan preserved for ${
          resolvedTargetFile || "the selected task"
        }.`
      : resolvedTargetFile
        ? `Implementation plan prepared for ${resolvedTargetFile}.`
        : "Implementation plan prepared from task text.",
    plannedAt: new Date().toISOString()
  };
}

module.exports = {
  buildImplementationPlanner
};
