"use strict";

function normalizeWork(work = []) {
  return Array.isArray(work)
    ? work.filter(Boolean)
    : [];
}

function normalizeExpectedBehavior(value = []) {
  return Array.isArray(value)
    ? value.filter(Boolean)
    : [];
}

function inferSymbolType({
  targetSymbol = null,
  task = ""
} = {}) {
  const normalizedSymbol =
    typeof targetSymbol === "string"
      ? targetSymbol.trim()
      : "";

  const normalizedTask =
    String(task || "").toLowerCase();

  if (!normalizedSymbol) {
    return null;
  }

  if (
    normalizedSymbol.startsWith("build") ||
    normalizedSymbol.startsWith("create") ||
    normalizedSymbol.startsWith("resolve") ||
    normalizedSymbol.startsWith("normalize") ||
    normalizedSymbol.startsWith("validate") ||
    normalizedSymbol.startsWith("apply") ||
    normalizedSymbol.startsWith("generate") ||
    normalizedSymbol.startsWith("plan") ||
    normalizedSymbol.startsWith("discover") ||
    normalizedSymbol.startsWith("find") ||
    normalizedSymbol.startsWith("classify") ||
    normalizedTask.includes(`function ${normalizedSymbol.toLowerCase()}`)
  ) {
    return "function";
  }

  return "symbol";
}

function inferExpectedBehavior({
  task = "",
  targetSymbol = null,
  targetFile = null,
  strategy = null
} = {}) {
  const normalizedTask = String(task || "").trim();
  const normalizedSymbol =
    typeof targetSymbol === "string"
      ? targetSymbol.trim()
      : "";

  const behaviors = [];

  if (normalizedSymbol) {
    behaviors.push(
      `Preserve the concrete target symbol ${normalizedSymbol} through implementation planning.`
    );
  }

  if (targetFile) {
    behaviors.push(
      `Limit the implementation plan to ${targetFile}.`
    );
  }

  if (
    normalizedTask.toLowerCase().includes("expected behavior")
  ) {
    behaviors.push(
      "Provide concrete expected behavior for downstream code generation."
    );
  }

  if (
    normalizedTask.toLowerCase().includes("implementation template")
  ) {
    behaviors.push(
      "Propagate the implementation template into structured patch generation."
    );
  }

  if (
    normalizedTask.toLowerCase().includes("executable")
  ) {
    behaviors.push(
      "Require an executable code template before declaring code generation ready."
    );
  }

  if (
    strategy === "add_minimal_verified_runtime_extension"
  ) {
    behaviors.push(
      "Preserve existing runtime behavior while adding only the minimum verified extension."
    );
  }

  return [...new Set(behaviors)];
}

function normalizeImplementationTemplate(value = null) {
  if (!value || typeof value !== "object") {
    return {
      targetSymbol: null,
      symbolType: null,
      expectedBehavior: [],
      implementationTemplate: null,
      executableCodeTemplate: null
    };
  }

  return {
    targetSymbol:
      value.targetSymbol || null,
    symbolType:
      value.symbolType || null,
    expectedBehavior:
      normalizeExpectedBehavior(value.expectedBehavior),
    implementationTemplate:
      value.implementationTemplate || null,
    executableCodeTemplate:
      value.executableCodeTemplate || null
  };
}

function findOriginalTask(task = null) {
  let current = task;
  let depth = 0;

  while (
    current?.previousTask &&
    depth < 20
  ) {
    current = current.previousTask;
    depth += 1;
  }

  return current || task || null;
}

function classifyImplementation({
  task = "",
  work = []
} = {}) {
  const normalizedWork = normalizeWork(work);
  const lowerTask = String(task || "").toLowerCase();

  if (
    normalizedWork.includes("implementation") ||
    lowerTask.includes("implementation")
  ) {
    return {
      implementationType:
        "missing_implementation",
      strategy:
        "add_minimal_verified_runtime_extension",
      recommendedOperation:
        "insert-before",
      confidence:
        "medium"
    };
  }

  if (
    normalizedWork.includes("todo") ||
    lowerTask.includes("todo")
  ) {
    return {
      implementationType:
        "todo_resolution",
      strategy:
        "replace_or_expand_todo_after_anchor_verification",
      recommendedOperation:
        "replace",
      confidence:
        "medium"
    };
  }

  if (normalizedWork.includes("execution")) {
    return {
      implementationType:
        "execution_continuation",
      strategy:
        "extend_existing_execution_flow",
      recommendedOperation:
        "insert-after",
      confidence:
        "medium"
    };
  }

  return {
    implementationType: "review",
    strategy: "inspect_target_before_edit",
    recommendedOperation: "insert-before",
    confidence: "low"
  };
}

function buildImplementationPlanner({
  task = "",
  targetFile = null,
  work = [],
  implementationType = null,
  strategy = null,
  recommendedOperation = null,
  confidence = null,
  targetSymbol = null,
  symbolType = null,
  expectedBehavior = [],
  implementationTemplate = null,
  repairAction = null,
  failureStage = null,
  issues = [],
  previousTask = null
} = {}) {
  const normalizedWork = normalizeWork(work);

  const originalTask = findOriginalTask(
    previousTask || {
      task,
      targetFile,
      work: normalizedWork,
      implementationType,
      strategy,
      recommendedOperation,
      confidence,
      targetSymbol,
      symbolType,
      expectedBehavior,
      implementationTemplate
    }
  );

  const originalClassification =
    classifyImplementation({
      task: originalTask?.task || task,
      work: originalTask?.work || normalizedWork
    });

  const currentClassification =
    classifyImplementation({
      task,
      work: normalizedWork
    });

  const repairing =
    repairAction === "repair_patch" ||
    Boolean(failureStage) ||
    Boolean(previousTask);

  const selectedClassification =
    repairing &&
    originalClassification.implementationType !== "review"
      ? originalClassification
      : currentClassification;

  const resolvedTargetFile =
    targetFile ||
    originalTask?.targetFile ||
    originalTask?.file ||
    null;

  const resolvedTargetSymbol =
    targetSymbol ||
    originalTask?.targetSymbol ||
    implementationTemplate?.targetSymbol ||
    originalTask?.implementationTemplate?.targetSymbol ||
    null;

  const resolvedSymbolType =
    symbolType ||
    originalTask?.symbolType ||
    implementationTemplate?.symbolType ||
    originalTask?.implementationTemplate?.symbolType ||
    inferSymbolType({
      targetSymbol: resolvedTargetSymbol,
      task: originalTask?.task || task
    }) ||
    null;

  const inheritedExpectedBehavior =
    normalizeExpectedBehavior(
      expectedBehavior.length > 0
        ? expectedBehavior
        : originalTask?.expectedBehavior ||
          implementationTemplate?.expectedBehavior ||
          originalTask?.implementationTemplate?.expectedBehavior ||
          []
    );

  const resolvedExpectedBehavior =
    inheritedExpectedBehavior.length > 0
      ? inheritedExpectedBehavior
      : inferExpectedBehavior({
          task: originalTask?.task || task,
          targetSymbol: resolvedTargetSymbol,
          targetFile: resolvedTargetFile,
          strategy:
            strategy ||
            originalTask?.strategy ||
            selectedClassification.strategy
        });

  const normalizedTemplate =
    normalizeImplementationTemplate(
      implementationTemplate ||
      originalTask?.implementationTemplate ||
      null
    );

  const resolvedImplementationType =
    implementationType ||
    originalTask?.implementationType ||
    selectedClassification.implementationType;

  const resolvedStrategy =
    strategy ||
    originalTask?.strategy ||
    selectedClassification.strategy;

  const resolvedRecommendedOperation =
    recommendedOperation ||
    originalTask?.recommendedOperation ||
    selectedClassification.recommendedOperation;

  const resolvedConfidence =
    confidence ||
    originalTask?.confidence ||
    selectedClassification.confidence;

  const concretePlanReady =
    Boolean(resolvedTargetSymbol) &&
    Boolean(resolvedSymbolType) &&
    resolvedExpectedBehavior.length > 0;

  const executableTemplateReady =
    typeof normalizedTemplate.executableCodeTemplate === "string" &&
    normalizedTemplate.executableCodeTemplate.trim().length > 0;

  return {
    mode: "implementation-planner-runtime",
    version:
      "ash-local-runtime-v0.4-concrete-plan-inference",
    success: Boolean(resolvedTargetFile || task),
    task,
    targetFile: resolvedTargetFile,
    work: normalizedWork,
    implementationType:
      resolvedImplementationType,
    strategy:
      resolvedStrategy,
    recommendedOperation:
      resolvedRecommendedOperation,
    confidence:
      resolvedConfidence,
    targetSymbol:
      resolvedTargetSymbol,
    symbolType:
      resolvedSymbolType,
    expectedBehavior:
      resolvedExpectedBehavior,
    implementationTemplate: {
      ...normalizedTemplate,
      targetSymbol:
        normalizedTemplate.targetSymbol ||
        resolvedTargetSymbol,
      symbolType:
        normalizedTemplate.symbolType ||
        resolvedSymbolType,
      expectedBehavior:
        normalizedTemplate.expectedBehavior.length > 0
          ? normalizedTemplate.expectedBehavior
          : resolvedExpectedBehavior
    },
    concretePlanReady,
    executableTemplateReady,
    readyForCodeGeneration:
      concretePlanReady &&
      executableTemplateReady,
    repairAware: repairing,
    repairAction,
    failureStage,
    issues: normalizeWork(issues),
    originalTask: originalTask || null,
    inheritedFromPreviousTask:
      repairing &&
      originalClassification.implementationType !== "review",
    requiresTargetLocator: true,
    requiresEditPlanner: true,
    reason:
      concretePlanReady && executableTemplateReady
        ? "Concrete implementation plan and executable template are ready."
        : concretePlanReady
          ? "Concrete implementation target is resolved; executable code template is still required."
          : repairing
            ? `Repair implementation plan preserved for ${
                resolvedTargetFile || "the selected task"
              }.`
            : resolvedTargetFile
              ? `Implementation plan prepared for ${resolvedTargetFile}.`
              : "Implementation plan prepared from task text.",
    plannedAt: new Date().toISOString()
  };
}

module.exports = {
  buildImplementationPlanner
};
