function generatePatch({ instruction }) {
  if (!instruction) {
    return {
      capability: "generate_patch",
      success: false,
      reason: "No edit instruction provided.",
      patch: null
    };
  }

  if (!instruction.targetFile || !instruction.anchorPattern) {
    return {
      capability: "generate_patch",
      success: false,
      instructionId: instruction.instructionId || null,
      reason: "Instruction is missing targetFile or anchorPattern.",
      patch: null
    };
  }

  const insertText = [
    `// Ash autonomous development marker: ${instruction.instructionId}`,
    `// Purpose: ${instruction.purpose || "No purpose provided."}`
  ].join("\n");

  return {
    capability: "generate_patch",
    success: true,
    instructionId: instruction.instructionId,
    targetFile: instruction.targetFile,
    operation: instruction.operation,
    anchorPattern: instruction.anchorPattern,
    generated: true,
    patch: {
      instructionId: instruction.instructionId,
      targetFile: instruction.targetFile,
      operation: instruction.operation || "insert-after",
      anchorPattern: instruction.anchorPattern,
      insertText
    },
    reason: "Patch generated from edit instruction."
  };
}

module.exports = {
  generatePatch
};
