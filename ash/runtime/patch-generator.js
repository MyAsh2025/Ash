"use strict";

function buildPatchGenerator(editPlanner) {
  const edits = Array.isArray(editPlanner?.edits)
    ? editPlanner.edits
    : [];

  const operations = edits
    .filter(
      (edit) =>
        edit.file &&
        edit.operation &&
        edit.anchorPattern
    )
    .map((edit) => ({
      file: edit.file,
      operation: edit.operation,
      anchorPattern: edit.anchorPattern,
      anchorLine: edit.anchorLine || null,
      purpose:
        edit.purpose ||
        "Generated from Edit Planner.",
      payload: {
        type: "structured-patch",
        sourceRuntime: "edit-planner-runtime",
        generatedCode: "",
        requiredChecks:
          Array.isArray(edit.requiredChecks)
            ? edit.requiredChecks
            : [],
        targetSymbol:
          typeof edit.targetSymbol === "string" &&
          edit.targetSymbol.trim().length > 0
            ? edit.targetSymbol.trim()
            : null,
        symbolType:
          typeof edit.symbolType === "string" &&
          edit.symbolType.trim().length > 0
            ? edit.symbolType.trim()
            : null,
        expectedBehavior:
          Array.isArray(edit.expectedBehavior)
            ? edit.expectedBehavior
            : [],
        planningPolicy:
          edit.planningPolicy &&
          typeof edit.planningPolicy === "object"
            ? edit.planningPolicy
            : null
      }
    }));

  return {
    mode: "patch-generator-runtime",
    version:
      "ash-local-runtime-v0.2-preserve-edit-context",
    success: operations.length > 0,
    readyForValidation: operations.length > 0,
    operations,
    reason:
      operations.length > 0
        ? "Structured patch operations generated with preserved edit context."
        : "No valid edit operations available for patch generation.",
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  buildPatchGenerator
};
