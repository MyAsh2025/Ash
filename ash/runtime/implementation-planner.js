"use strict";

const fs = require("fs");
const path = require("path");

function inferExportedFunctionSymbol({
  targetFile = null,
  root = process.cwd(),
  task = ""
} = {}) {
  const normalizedTargetFile =
    typeof targetFile === "string"
      ? targetFile.trim()
      : "";

  if (
    !normalizedTargetFile ||
    !normalizedTargetFile.toLowerCase().endsWith(".js")
  ) {
    return {
      targetSymbol: null,
      symbolType: null,
      source: null,
      candidates: [],
      reason:
        "Target symbol inference requires a JavaScript target file."
    };
  }

  const absoluteTargetFile =
    path.isAbsolute(normalizedTargetFile)
      ? normalizedTargetFile
      : path.join(root, normalizedTargetFile);

  if (!fs.existsSync(absoluteTargetFile)) {
    return {
      targetSymbol: null,
      symbolType: null,
      source: null,
      candidates: [],
      reason:
        `Target symbol inference file does not exist: ${normalizedTargetFile}`
    };
  }

  const sourceText =
    fs.readFileSync(absoluteTargetFile, "utf8");

  const declaredFunctions =
    new Set(
      Array.from(
        sourceText.matchAll(
          /(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g
        ),
        (match) => match[1]
      )
    );

  const exportedSymbols =
    new Set();

  const moduleExportsMatch =
    sourceText.match(
      /module\.exports\s*=\s*\{([\s\S]*?)\}\s*;?/m
    );

  if (moduleExportsMatch?.[1]) {
    const exportBody =
      moduleExportsMatch[1];

    for (
      const match of exportBody.matchAll(
        /(?:^|,)\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*(?=,|$)/gm
      )
    ) {
      exportedSymbols.add(match[1]);
    }

    for (
      const match of exportBody.matchAll(
        /(?:^|,)\s*[A-Za-z_$][A-Za-z0-9_$]*\s*:\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*(?=,|$)/gm
      )
    ) {
      exportedSymbols.add(match[1]);
    }
  }

  for (
    const match of sourceText.matchAll(
      /(?:module\.)?exports\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=/g
    )
  ) {
    exportedSymbols.add(match[1]);
  }

  const candidates =
    [...exportedSymbols]
      .filter((symbol) =>
        declaredFunctions.has(symbol)
      )
      .sort();

  const normalizedTask =
    String(task || "");

  function taskMentionsSymbol(symbol) {
    let matchIndex =
      normalizedTask.indexOf(symbol);

    while (matchIndex !== -1) {
      const beforeCharacter =
        matchIndex > 0
          ? normalizedTask[matchIndex - 1]
          : "";

      const afterIndex =
        matchIndex + symbol.length;

      const afterCharacter =
        afterIndex < normalizedTask.length
          ? normalizedTask[afterIndex]
          : "";

      const beforeIsIdentifier =
        /[A-Za-z0-9_$]/.test(
          beforeCharacter
        );

      const afterIsIdentifier =
        /[A-Za-z0-9_$]/.test(
          afterCharacter
        );

      if (
        !beforeIsIdentifier &&
        !afterIsIdentifier
      ) {
        return true;
      }

      matchIndex =
        normalizedTask.indexOf(
          symbol,
          matchIndex + symbol.length
        );
    }

    return false;
  }

  const taskMentionedCandidates =
    candidates.filter(
      taskMentionsSymbol
    );

  if (taskMentionedCandidates.length === 1) {
    return {
      targetSymbol:
        taskMentionedCandidates[0],
      symbolType: "function",
      source:
        "task-mentioned-exported-function",
      candidates,
      taskMentionedCandidates,
      reason:
        `Inferred ${taskMentionedCandidates[0]} from the task text and exported functions in ${normalizedTargetFile}.`
    };
  }

  if (taskMentionedCandidates.length > 1) {
    return {
      targetSymbol: null,
      symbolType: null,
      source:
        "ambiguous-task-mentioned-exported-functions",
      candidates,
      taskMentionedCandidates,
      reason:
        `Multiple exported function candidates were mentioned in the task for ${normalizedTargetFile}.`
    };
  }

  if (candidates.length === 1) {
    return {
      targetSymbol: candidates[0],
      symbolType: "function",
      source: "unique-exported-function",
      candidates,
      reason:
        `Inferred ${candidates[0]} as the unique exported function in ${normalizedTargetFile}.`
    };
  }

  function tokenize(value = "") {
    return String(value || "")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .split(/[^a-z0-9_$]+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 3);
  }

  const ignoredTaskTerms =
    new Set([
      "add",
      "build",
      "change",
      "create",
      "fix",
      "improve",
      "make",
      "update"
    ]);

  const aliases = {
    planning: ["plan", "planner"],
    plan: ["planning", "planner"],
    planner: ["plan", "planning"],
    discovery: [
      "discover",
      "locator",
      "locate",
      "resolver",
      "resolution"
    ],
    inference: [
      "infer",
      "inferred"
    ],
    infer: [
      "inference",
      "inferred"
    ],
    implementation: [
      "implement"
    ],
    validation: [
      "validate",
      "validator"
    ],
    generation: [
      "generate",
      "generator"
    ]
  };

  const taskTerms =
    Array.from(
      new Set(
        tokenize(normalizedTask)
          .filter(
            (term) =>
              !ignoredTaskTerms.has(term)
          )
      )
    );

  function expandTerm(term) {
    return Array.from(
      new Set([
        term,
        ...(aliases[term] || [])
      ])
    );
  }

  function scoreCandidate(symbol) {
    const symbolTerms =
      new Set(tokenize(symbol));

    let score = 0;
    const matches = [];

    for (const taskTerm of taskTerms) {
      if (symbolTerms.has(taskTerm)) {
        score += 10;
        matches.push({
          taskTerm,
          matchedTerm: taskTerm,
          type: "symbol-term",
          weight: 10
        });
        continue;
      }

      const aliasMatch =
        expandTerm(taskTerm).find(
          (expandedTerm) =>
            expandedTerm !== taskTerm &&
            symbolTerms.has(expandedTerm)
        );

      if (aliasMatch) {
        score += 7;
        matches.push({
          taskTerm,
          matchedTerm: aliasMatch,
          type: "symbol-alias",
          weight: 7
        });
      }
    }

    return {
      symbol,
      score,
      matches
    };
  }

  const scoredCandidates =
    candidates
      .map(scoreCandidate)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.symbol.localeCompare(right.symbol)
      );

  const bestCandidate =
    scoredCandidates[0] || null;

  const secondCandidate =
    scoredCandidates[1] || null;

  if (
    bestCandidate &&
    bestCandidate.score >= 7 &&
    (
      !secondCandidate ||
      bestCandidate.score -
        secondCandidate.score >= 3
    )
  ) {
    return {
      targetSymbol:
        bestCandidate.symbol,
      symbolType: "function",
      source:
        "task-semantic-exported-function",
      candidates,
      taskMentionedCandidates,
      scoredCandidates,
      reason:
        `Inferred ${bestCandidate.symbol} from task semantics and exported functions in ${normalizedTargetFile}.`
    };
  }

  return {
    targetSymbol: null,
    symbolType: null,
    source:
      candidates.length > 1
        ? "ambiguous-exported-functions"
        : null,
    candidates,
    taskMentionedCandidates,
    scoredCandidates,
    reason:
      candidates.length > 1
        ? `Multiple exported function candidates were found in ${normalizedTargetFile}, and task semantics did not resolve them safely.`
        : `No unique exported function candidate was found in ${normalizedTargetFile}.`
  };
}
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

function findInheritedRepairTargetSymbol(
  task = null
) {
  let currentTask =
    task && typeof task === "object"
      ? task
      : null;

  const visited =
    new Set();

  const taskChain = [];

  while (
    currentTask &&
    !visited.has(currentTask)
  ) {
    visited.add(currentTask);
    taskChain.push(currentTask);

    currentTask =
      currentTask.previousTask &&
      typeof currentTask.previousTask === "object"
        ? currentTask.previousTask
        : null;
  }

  const validatedOperationCandidates =
    taskChain.flatMap(
      (chainTask, taskDepth) => {
        const operations =
          Array.isArray(
            chainTask.validatedOperations
          )
            ? chainTask.validatedOperations
            : [];

        return operations
          .map(
            (
              operation,
              operationIndex
            ) => ({
              operation,
              taskDepth,
              operationIndex
            })
          )
          .filter(
            ({ operation }) =>
              typeof operation?.targetSymbol === "string" &&
              operation.targetSymbol.trim().length > 0
          );
      }
    );

  const destructiveOperation =
    validatedOperationCandidates.find(
      ({ operation }) =>
        operation.destructiveReplaceChecked === true &&
        operation.destructiveReplace === true
    );

  if (destructiveOperation) {
    return {
      targetSymbol:
        destructiveOperation
          .operation
          .targetSymbol
          .trim(),
      source:
        "destructive-validated-operation-target-symbol",
      taskDepth:
        destructiveOperation.taskDepth,
      operationIndex:
        destructiveOperation.operationIndex
    };
  }

  const validatedOperation =
    validatedOperationCandidates[0];

  if (validatedOperation) {
    return {
      targetSymbol:
        validatedOperation
          .operation
          .targetSymbol
          .trim(),
      source:
        "validated-operation-target-symbol",
      taskDepth:
        validatedOperation.taskDepth,
      operationIndex:
        validatedOperation.operationIndex
    };
  }

  for (
    let taskDepth = 0;
    taskDepth < taskChain.length;
    taskDepth += 1
  ) {
    const directTargetSymbol =
      typeof taskChain[taskDepth]
        ?.targetSymbol === "string"
        ? taskChain[taskDepth]
            .targetSymbol
            .trim()
        : "";

    if (directTargetSymbol) {
      return {
        targetSymbol:
          directTargetSymbol,
        source:
          "previous-task-target-symbol",
        taskDepth
      };
    }
  }

  return {
    targetSymbol: null,
    source: null
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
  errorMessage = null,
  issues = [],
  validatedOperations = [],
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

  const previousDestructiveReplace =
    repairing &&
    (() => {
      let currentTask = {
        validatedOperations,
        previousTask
      };

      while (currentTask) {
        const operations =
          Array.isArray(currentTask.validatedOperations)
            ? currentTask.validatedOperations
            : [];

        const destructiveReplaceFound =
          operations.some(
            (operation) =>
              operation?.destructiveReplaceChecked === true &&
              operation?.destructiveReplace === true &&
              (
                operation?.operation === "replace" ||
                operation?.operation == null
              )
          );

        if (destructiveReplaceFound) {
          return true;
        }

        currentTask =
          currentTask.previousTask || null;
      }

      return false;
    })();

  const destructiveRepairStrategy =
    "preserve_existing_target_with_local_augmentation";

  const localRepairIntent =
    previousDestructiveReplace
      ? {
          mode:
            "preserve-existing-target-local-repair",
          preserveExistingTarget:
            true,
          allowTargetRedeclaration:
            false,
          requireVerifiedLocalAnchor:
            false,
          localAnchorPattern:
            null,
          preferredOperation:
            "insert-before",
          integrationGoal:
            "symbol-declaration-augmentation",
          minimizeStructuralChange:
            true,
          safeStopRequired:
            true
        }
      : null;

  const resolvedTargetFile =
    targetFile ||
    originalTask?.targetFile ||
    originalTask?.file ||
    null;

  const inheritedRepairTargetSymbol =
    repairing
      ? findInheritedRepairTargetSymbol({
          validatedOperations:
            Array.isArray(validatedOperations)
              ? validatedOperations
              : [],
          targetSymbol:
            typeof targetSymbol === "string" &&
            targetSymbol.trim().length > 0
              ? targetSymbol.trim()
              : null,
          previousTask:
            previousTask ||
            originalTask ||
            null
        })
      : {
          targetSymbol: null,
          source: null
        };

  const inferredTargetSymbol =
    inferExportedFunctionSymbol({
      targetFile: resolvedTargetFile,
      task: originalTask?.task || task
    });

  const resolvedTargetSymbol =
    repairing &&
    inheritedRepairTargetSymbol.targetSymbol
      ? inheritedRepairTargetSymbol.targetSymbol
      : targetSymbol ||
        originalTask?.targetSymbol ||
        implementationTemplate?.targetSymbol ||
        originalTask?.implementationTemplate?.targetSymbol ||
        inferredTargetSymbol.targetSymbol ||
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

  const baseExpectedBehavior =
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

  const repairExpectedBehavior =
    previousDestructiveReplace
      ? [
          `Preserve the existing implementation of ${resolvedTargetSymbol || "the target symbol"} rather than replacing or redeclaring it.`,
          "Repair the previous destructive replacement by using only a minimal local augmentation when a safe augmentation is possible.",
          `Do not redeclare ${resolvedTargetSymbol || "the existing target symbol"} during insert operations.`,
          "Minimize structural impact and preserve unrelated existing behavior.",
          "If the requested repair cannot be completed safely with a local augmentation, stop instead of generating a destructive replacement."
        ]
      : [];

  const resolvedExpectedBehavior =
    Array.from(
      new Set([
        ...baseExpectedBehavior,
        ...repairExpectedBehavior
      ])
    );

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
    previousDestructiveReplace
      ? destructiveRepairStrategy
      : strategy ||
        originalTask?.strategy ||
        selectedClassification.strategy;

  const requestedRecommendedOperation =
    recommendedOperation ||
    originalTask?.recommendedOperation ||
    (
      inferredTargetSymbol.targetSymbol &&
      resolvedTargetSymbol ===
        inferredTargetSymbol.targetSymbol
        ? "replace"
        : selectedClassification.recommendedOperation
    );

  const resolvedRecommendedOperation =
    previousDestructiveReplace &&
    requestedRecommendedOperation === "replace"
      ? "insert-before"
      : requestedRecommendedOperation;

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
    requestedRecommendedOperation,
    repairOperationAdjusted:
      previousDestructiveReplace &&
      requestedRecommendedOperation === "replace",
    previousDestructiveReplace,
    localRepairIntent,
    confidence:
      resolvedConfidence,
    targetSymbol:
      resolvedTargetSymbol,
    symbolType:
      resolvedSymbolType,
    targetSymbolInference:
      inheritedRepairTargetSymbol.targetSymbol
        ? inheritedRepairTargetSymbol
        : inferredTargetSymbol,
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
        resolvedExpectedBehavior
    },
    concretePlanReady,
    executableTemplateReady,
    readyForCodeGeneration:
      concretePlanReady &&
      executableTemplateReady,
    repairAware: repairing,
    repairAction,
    failureStage,
    errorMessage:
      typeof errorMessage === "string"
        ? errorMessage
        : null,
    issues: normalizeWork(issues),
    validatedOperations:
      Array.isArray(validatedOperations)
        ? validatedOperations
        : [],
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
  buildImplementationPlanner,
  inferExportedFunctionSymbol
};
