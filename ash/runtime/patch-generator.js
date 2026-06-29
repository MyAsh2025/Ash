function buildPatchGenerator(editPlanner) {
  const edits = Array.isArray(editPlanner?.edits)
    ? editPlanner.edits
    : [];

  const operations = edits
    .filter((edit) => edit.file && edit.operation && edit.anchorPattern)
    .map((edit) => ({
      file: edit.file,
      operation: edit.operation,
      anchorPattern: edit.anchorPattern,
      anchorLine: edit.anchorLine || null,
      purpose: edit.purpose || "Generated from Edit Planner.",
      payload: {
        type: "structured-patch",
        sourceRuntime: "edit-planner-runtime",
        generatedCode: "",
        requiredChecks: edit.requiredChecks || []
      }
    }));

  return {
    mode: "patch-generator-runtime",
    version: "ash-local-runtime-v0.1",
    success: operations.length > 0,
    readyForValidation: operations.length > 0,
    operations,
    reason: operations.length > 0
      ? "Structured patch operations generated from Edit Planner."
      : "No valid edit operations available for patch generation.",
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  buildPatchGenerator
};
