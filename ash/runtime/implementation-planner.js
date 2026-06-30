"use strict";

function buildImplementationPlanner({
  task = "",
  targetFile = null,
  work = []
} = {}) {
  const normalizedWork = Array.isArray(work) ? work : [];
  const lowerTask = String(task || "").toLowerCase();

  let implementationType = "review";
  let strategy = "inspect_target_before_edit";
  let recommendedOperation = "insert-before";
  let confidence = "low";

  if (normalizedWork.includes("implementation") || lowerTask.includes("implementation")) {
    implementationType = "missing_implementation";
    strategy = "add_minimal_verified_runtime_extension";
    recommendedOperation = "insert-before";
    confidence = "medium";
  } else if (normalizedWork.includes("todo") || lowerTask.includes("todo")) {
    implementationType = "todo_resolution";
    strategy = "replace_or_expand_todo_after_anchor_verification";
    recommendedOperation = "replace";
    confidence = "medium";
  } else if (normalizedWork.includes("execution")) {
    implementationType = "execution_continuation";
    strategy = "extend_existing_execution_flow";
    recommendedOperation = "insert-after";
    confidence = "medium";
  }

  return {
    mode: "implementation-planner-runtime",
    version: "ash-local-runtime-v0.1",
    success: Boolean(targetFile || task),
    task,
    targetFile,
    work: normalizedWork,
    implementationType,
    strategy,
    recommendedOperation,
    confidence,
    requiresTargetLocator: true,
    requiresEditPlanner: true,
    reason: targetFile
      ? `Implementation plan prepared for ${targetFile}.`
      : "Implementation plan prepared from task text.",
    plannedAt: new Date().toISOString()
  };
}

module.exports = {
  buildImplementationPlanner
};
