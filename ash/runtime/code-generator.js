"use strict";

const SUPPORTED_OPERATIONS = new Set([
  "insert-before",
  "insert-after",
  "replace"
]);

function normalizeExpectedBehavior(value) {
  return Array.isArray(value)
    ? value
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function normalizeExecutableCodeTemplate(
  implementationPlanner
) {
  const implementationTemplate =
    implementationPlanner?.implementationTemplate || null;

  const executableCodeTemplate =
    implementationTemplate?.executableCodeTemplate;

  return typeof executableCodeTemplate === "string"
    ? executableCodeTemplate.trim()
    : "";
}

function normalizeGenerationContext(context = {}) {
  const implementationPlanner =
    context.implementationPlanner || null;

  const selectedTask =
    context.selectedTask || null;

  const targetSymbol =
    implementationPlanner?.targetSymbol ||
    selectedTask?.targetSymbol ||
    null;

  const symbolType =
    implementationPlanner?.symbolType ||
    selectedTask?.symbolType ||
    null;

  const expectedBehavior =
    normalizeExpectedBehavior(
      implementationPlanner?.expectedBehavior ||
      selectedTask?.expectedBehavior
    );

  const executableCodeTemplate =
    normalizeExecutableCodeTemplate(
      implementationPlanner
    );

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
    targetSymbol,
    symbolType,
    expectedBehavior,
    implementationTemplate:
      implementationPlanner?.implementationTemplate || null,
    executableCodeTemplate,
    concretePlanReady:
      implementationPlanner?.concretePlanReady === true,
    executableTemplateReady:
      implementationPlanner?.executableTemplateReady === true,
    readyForCodeGeneration:
      implementationPlanner?.readyForCodeGeneration === true,
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

function validateConcreteGenerationPlan({
  operation,
  generationContext
} = {}) {
  if (!generationContext.implementationPlanner) {
    return "Implementation planner result is missing.";
  }

  if (generationContext.concretePlanReady !== true) {
    return "Concrete implementation plan is not ready.";
  }

  if (generationContext.executableTemplateReady !== true) {
    return "Executable code template is not ready.";
  }

  if (generationContext.readyForCodeGeneration !== true) {
    return "Implementation planner has not approved code generation.";
  }

  if (!generationContext.targetSymbol) {
    return "Concrete target symbol is missing.";
  }

  if (generationContext.expectedBehavior.length === 0) {
    return "Expected implementation behavior is missing.";
  }

  if (!generationContext.executableCodeTemplate) {
    return "Executable code template is empty.";
  }

  if (
    generationContext.recommendedOperation &&
    generationContext.recommendedOperation !==
      operation.operation
  ) {
    return [
      "Patch operation does not match the concrete implementation plan.",
      `Planned: ${generationContext.recommendedOperation}.`,
      `Received: ${operation.operation}.`
    ].join(" ");
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

  const planError =
    validateConcreteGenerationPlan({
      operation,
      generationContext
    });

  if (planError) {
    return {
      generatedCode: "",
      missingReason: [
        planError,
        buildMissingPlanReason({
          operation,
          generationContext
        })
      ].join(" "),
      generationReady: false
    };
  }

  return {
    generatedCode:
      generationContext.executableCodeTemplate,
    missingReason: null,
    generationReady: true
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
      "ash-local-runtime-v0.3-executable-template",
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
      ? "Generated executable code from a verified concrete implementation template."
      : firstMissingReason ||
        "Concrete implementation planning is required before code generation.",
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  generateCodeForPatch
};
