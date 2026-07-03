function classifyPatchFailure({ patchResult = null, verifyResult = null }) {
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

  return {
    type: "no_failure",
    repairAction: "none",
    reason: "No patch failure detected."
  };
}

function repairPatch({ patchResult = null, verifyResult = null }) {
  const classification = classifyPatchFailure({ patchResult, verifyResult });

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
  classifyPatchFailure
};
