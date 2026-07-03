function buildDevelopmentExecutor({ editInstruction, capabilityRegistry }) {
  const instructions = editInstruction?.instructions || [];

  const executableInstructions = instructions.filter(
    (instruction) => instruction.status === "ready"
  );

  return {
    mode: "development-executor-runtime",
    version: "ash-local-runtime-v0.1",
    instructionCount: instructions.length,
    executableCount: executableInstructions.length,
    executable: executableInstructions.length > 0,
    executionMode: "capability-aware",
    plannedExecutions: executableInstructions.map((instruction) => ({
      instructionId: instruction.instructionId,
      targetFile: instruction.targetFile,
      operation: instruction.operation,
      anchorPattern: instruction.anchorPattern,
      anchorLine: instruction.anchorLine,
      verification: instruction.verification || [],
      capability: capabilityRegistry?.capabilities?.generate_patch || null,
      status: capabilityRegistry?.capabilities?.generate_patch?.implemented
        ? "ready-to-execute"
        : "capability-not-implemented"
    })),
    nextActions:
      executableInstructions.length > 0
        ? ["generate_patch", "apply_safe_patch", "verify_patch"]
        : [],
    reason:
      executableInstructions.length > 0
        ? "Development executor received executable edit instructions."
        : "No executable edit instructions available.",
    preparedAt: new Date().toISOString()
  };
}

module.exports = {
  buildDevelopmentExecutor
};

