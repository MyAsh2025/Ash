"use strict";

const SUPPORTED_OPERATIONS = new Set([
  "insert-before",
  "insert-after",
  "replace"
]);

function normalizeGenerationContext(context = {}) {
  const implementationPlanner =
    context.implementationPlanner || null;

  const selectedTask =
    context.selectedTask || null;

  return {
    implementationPlanner,
    selectedTask,
    patchPlanner:
      context.patchPlanner || null,
    task:
      selectedTask?.task ||
      implementationPlanner?.task ||
      null,
    targetFile:
      selectedTask?.targetFile ||
      selectedTask?.file ||
      implementationPlanner?.targetFile ||
      null,
    work: Array.isArray(selectedTask?.work)
      ? selectedTask.work
      : Array.isArray(implementationPlanner?.work)
        ? implementationPlanner.work
        : [],
    implementationType:
      implementationPlanner?.implementationType || null,
    strategy:
      implementationPlanner?.strategy || null,
    recommendedOperation:
      implementationPlanner?.recommendedOperation || null,
    confidence:
      implementationPlanner?.confidence || null,
    repairAction:
      selectedTask?.repairAction || null,
    failureStage:
      selectedTask?.failureStage || null,
    issues: Array.isArray(selectedTask?.issues)
      ? selectedTask.issues
      : []
  };
}

function validateOperation(operation) {
  if (!operation) {
    return "No patch operation provided.";
  }

  if (!operation.file) {
    return "Patch operation target file is missing.";
  }

  if (!operation.operation) {
    return "Patch operation type is missing.";
  }

  if (!SUPPORTED_OPERATIONS.has(operation.operation)) {
    return `Unsupported operation ${operation.operation}.`;
  }

  if (!operation.anchorPattern) {
    return "Patch operation anchorPattern is missing.";
  }

  return null;
}

function buildMissingPlanReason({
  operation,
  generationContext
} = {}) {
  const task =
    generationContext.task ||
    "unknown autonomous task";

  const strategy =
    generationContext.strategy ||
    "no implementation strategy";

  const targetFile =
    operation?.file ||
    generationContext.targetFile ||
    "unknown target";

  return [
    `Concrete implementation code is unavailable for ${targetFile}.`,
    `Task: ${task}.`,
    `Strategy: ${strategy}.`,
    "A concrete target symbol, expected behavior, and executable code template are required before patch generation."
  ].join(" ");
}

function buildGeneratedCodeForOperation(
  operation,
  generationContext
) {
  const operationError = validateOperation(operation);

  if (operationError) {
    return {
      generatedCode: "",
      missingReason: operationError,
      generationReady: false
    };
  }

  /*
   * The previous implementation emitted a diagnostic function for every
   * task. That output was syntactically valid but did not implement the
   * requested repository change.
   *
   * Until the implementation planner supplies a concrete target symbol and
   * executable code template, generation must stop here rather than sending
   * placeholder code to the patch validator or apply engine.
   */
  return {
    generatedCode: "",
    missingReason: buildMissingPlanReason({
      operation,
      generationContext
    }),
    generationReady: false
  };
}

function generateCodeForPatch(
  patchGenerator,
  context = {}
) {
  const operations = Array.isArray(
    patchGenerator?.operations
  )
    ? patchGenerator.operations
    : [];

  const generationContext =
    normalizeGenerationContext(context);

  const generatedOperations = operations.map(
    (operation) => {
      const generation =
        buildGeneratedCodeForOperation(
          operation,
          generationContext
        );

      const generatedCode =
        generation.generatedCode || "";

      return {
        ...operation,
        payload: {
          ...(operation.payload || {}),
          generatedCode,
          codeGenerated:
            generation.generationReady === true &&
            generatedCode.length > 0,
          missingReason:
            generation.missingReason || null,
          codeSourceRuntime:
            "code-generator-runtime",
          generationContext
        }
      };
    }
  );

  const success =
    generatedOperations.length > 0 &&
    generatedOperations.every(
      (operation) =>
        operation.payload?.codeGenerated === true
    );

  const firstMissingReason =
    generatedOperations.find(
      (operation) =>
        operation.payload?.missingReason
    )?.payload?.missingReason || null;

  return {
    mode: "code-generator-runtime",
    version:
      "ash-local-runtime-v0.2-concrete-plan-required",
    success,
    readyForValidation: success,
    operations: generatedOperations,
    generationContext,
    generatedCount:
      generatedOperations.filter(
        (operation) =>
          operation.payload?.codeGenerated === true
      ).length,
    reason: success
      ? "Generated executable code from a concrete implementation plan."
      : firstMissingReason ||
        "Concrete implementation planning is required before code generation.",
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  generateCodeForPatch
};
