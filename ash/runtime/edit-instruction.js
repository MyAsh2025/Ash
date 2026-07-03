function buildEditInstruction({ editPlanner }) {
  const edits = editPlanner?.edits || [];

  const instructions = edits.map((edit, index) => ({
    instructionId: `edit-${String(index + 1).padStart(4, "0")}`,
    targetFile: edit.file,
    operation: edit.operation,
    anchorPattern: edit.anchorPattern,
    anchorLine: edit.anchorLine,
    purpose: edit.purpose,
    generator: "patch-generator-runtime",
    validator: "patch-validator-runtime",
    applier: "safe-patch-runtime",
    verification: edit.requiredChecks || [],
    status: "ready"
  }));

  return {
    mode: "edit-instruction-runtime",
    version: "ash-local-runtime-v0.1",
    required: editPlanner?.required === true,
    instructionCount: instructions.length,
    instructions,
    ready: instructions.length > 0,
    nextActions:
      instructions.length > 0
        ? ["generate_patch", "validate_patch", "apply_safe_patch", "verify_patch"]
        : [],
    reason:
      instructions.length > 0
        ? "Edit instructions prepared for autonomous patch generation."
        : "No edit instructions prepared.",
    preparedAt: new Date().toISOString()
  };
}

module.exports = {
  buildEditInstruction
};
