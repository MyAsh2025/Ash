function classifyPatchFailure({
  patchResult = null,
  verifyResult = null,
  repairAction = null,
  failureStage = null,
  errorMessage = null,
  issues = [],
  validatedOperations = [],
  previousTask = null,
  originalTask = null
}) {
  if (patchResult && patchResult.success === false) {
    if (patchResult.reason === "Anchor pattern not found.") {
      return {
        type: "anchor_not_found",
        repairAction: "relocate_anchor",
        reason: "Patch anchor was not found in target file."
      };
    }

    if (patchResult.reason === "Target file does not exist.") {
      return {
        type: "target_file_missing",
        repairAction: "resolve_target_file",
        reason: "Patch target file does not exist."
      };
    }

    if (patchResult.reason === "No insertText provided.") {
      return {
        type: "missing_insert_text",
        repairAction: "regenerate_patch_content",
        reason: "Patch does not include insertText."
      };
    }

    return {
      type: "patch_apply_failed",
      repairAction: "inspect_patch",
      reason: patchResult.reason || "Patch apply failed."
    };
  }

  if (verifyResult && verifyResult.success === false) {
    const failedCheck = (verifyResult.checks || []).find((check) => !check.success);

    return {
      type: "verification_failed",
      repairAction: "inspect_verification_error",
      reason: failedCheck?.error || failedCheck?.output || "Patch verification failed.",
      failedCommand: failedCheck?.command || null
    };
  }

  const normalizedIssues =
    Array.isArray(issues)
      ? issues.filter(Boolean)
      : [];

  const normalizedValidatedOperations =
    Array.isArray(validatedOperations)
      ? validatedOperations
      : [];

  const autonomousRepairRequested =
    repairAction === "repair_patch" ||
    Boolean(failureStage) ||
    normalizedIssues.length > 0;

  if (autonomousRepairRequested) {
    return {
      type: "autonomous_repair_required",
      repairAction: "regenerate_implementation",
      reason:
        errorMessage ||
        normalizedIssues[0] ||
        "Autonomous development failure requires implementation regeneration.",
      failureStage: failureStage || null,
      issues: normalizedIssues,
      validatedOperations:
        normalizedValidatedOperations,
      previousTask: previousTask || null,
      originalTask: originalTask || null
    };
  }

  return {
    type: "no_failure",
    repairAction: "none",
    reason: "No patch failure detected."
  };
}

function resolveRepairContext(input = {}) {
  const generatedTask =
    input?.generatedTask?.nextTask || null;

  const selectedTask =
    input?.selectedTask || null;

  const repairTask =
    selectedTask ||
    generatedTask ||
    null;

  if (!repairTask) {
    return input;
  }

  return {
    ...input,
    ...repairTask,
    patchResult:
      input.patchResult ||
      repairTask.patchResult ||
      null,
    verifyResult:
      input.verifyResult ||
      repairTask.verifyResult ||
      null,
    repairAction:
      repairTask.repairAction ||
      input.repairAction ||
      null,
    failureStage:
      repairTask.failureStage ||
      input.failureStage ||
      null,
    errorMessage:
      repairTask.errorMessage ||
      input.errorMessage ||
      null,
    issues:
      Array.isArray(repairTask.issues)
        ? repairTask.issues
        : Array.isArray(input.issues)
          ? input.issues
          : [],
    validatedOperations:
      Array.isArray(
        repairTask.validatedOperations
      )
        ? repairTask.validatedOperations
        : Array.isArray(
            input.validatedOperations
          )
          ? input.validatedOperations
          : [],
    previousTask:
      repairTask.previousTask ||
      input.previousTask ||
      null,
    originalTask:
      repairTask.originalTask ||
      input.originalTask ||
      null
  };
}

function repairPatch(input = {}) {
  const repairContext =
    resolveRepairContext(input);

  const classification =
    classifyPatchFailure(repairContext);

  return {
    capability: "repair_patch",
    success: classification.type === "no_failure",
    classification,
    nextActions:
      classification.type === "no_failure"
        ? []
        : [classification.repairAction, "retry_patch"],
    repaired: false,
    reason:
      classification.type === "no_failure"
        ? "No repair needed."
        : "Repair classification prepared.",
    evaluatedAt: new Date().toISOString()
  };
}

module.exports = {
  repairPatch,
  classifyPatchFailure,
  resolveRepairContext
};
