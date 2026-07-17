"use strict";

const UNSAFE_REPLACE_ANCHORS = new Set([
  "TODO",
  "FIXME",
  "XXX",
  "stub"
]);

const SAFE_SYMBOL_OPERATIONS = new Set([
  "insert-before",
  "insert-after"
]);

function normalizePath(value = "") {
  return String(value).replace(/\\/g, "/");
}

function normalizeOperation(value = null) {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return SAFE_SYMBOL_OPERATIONS.has(normalized)
    ? normalized
    : null;
}

function findTargetResult({
  targetLocator,
  repositoryTargetFile
} = {}) {
  if (!repositoryTargetFile) {
    return null;
  }

  const normalizedTarget =
    normalizePath(repositoryTargetFile);

  return (targetLocator?.results || []).find(
    (result) => {
      const normalizedResult =
        normalizePath(result?.filePath || "");

      return (
        normalizedResult === normalizedTarget ||
        normalizedResult.endsWith(
          `/${normalizedTarget}`
        ) ||
        normalizedResult.endsWith(
          normalizedTarget
        )
      );
    }
  ) || null;
}

function findAnchor(result, pattern) {
  return (result?.anchors || []).find(
    (anchor) =>
      anchor?.pattern === pattern
  ) || null;
}

function findPreferredSymbolAnchor({
  targetLocator,
  targetSymbol
} = {}) {
  if (
    targetLocator?.symbolLocated !== true ||
    typeof targetSymbol !== "string" ||
    targetSymbol.trim().length === 0
  ) {
    return null;
  }

  const normalizedTargetSymbol =
    targetSymbol.trim();

  const symbolAnchors =
    Array.isArray(targetLocator.symbolAnchors)
      ? targetLocator.symbolAnchors
      : [];

  const declarationAnchor =
    symbolAnchors.find(
      (anchor) =>
        anchor?.pattern ===
        `function ${normalizedTargetSymbol}`
    ) ||
    symbolAnchors.find(
      (anchor) =>
        anchor?.pattern ===
        `class ${normalizedTargetSymbol}`
    );

  if (declarationAnchor) {
    return declarationAnchor;
  }

  return symbolAnchors.find(
    (anchor) =>
      anchor?.pattern ===
      `${normalizedTargetSymbol}(`
  ) || null;
}

function buildChecks() {
  return [
    "node_check",
    "git_diff_check",
    "runtime_corecheck"
  ];
}

function buildSymbolEdit({
  repositoryTargetFile,
  targetLocator,
  patchPlanner
} = {}) {
  const targetSymbol =
    patchPlanner?.targetSymbol || null;

  const symbolAnchor =
    findPreferredSymbolAnchor({
      targetLocator,
      targetSymbol
    });

  if (
    !repositoryTargetFile ||
    !symbolAnchor
  ) {
    return null;
  }

  const rawRequestedOperation =
    typeof patchPlanner?.recommendedOperation === "string"
      ? patchPlanner.recommendedOperation.trim().toLowerCase()
      : null;

  const requestedOperation =
    normalizeOperation(rawRequestedOperation);

  /*
   * Do not silently convert an unsupported requested operation.
   *
   * In particular, replacing a short symbol declaration anchor such as
   * "function buildExample" would not replace the complete function body.
   * Full-symbol replacement requires a verified symbol-range locator.
   */
  if (
    rawRequestedOperation &&
    !requestedOperation
  ) {
    return null;
  }

  const operation =
    requestedOperation || "insert-before";

  return {
    file: repositoryTargetFile,
    operation,
    anchorPattern: symbolAnchor.pattern,
    anchorLine: symbolAnchor.line,
    purpose:
      `Implement concrete work near target symbol ${targetSymbol}.`,
    targetSymbol,
    symbolType:
      patchPlanner?.symbolType || null,
    expectedBehavior:
      Array.isArray(
        patchPlanner?.expectedBehavior
      )
        ? patchPlanner.expectedBehavior
        : [],
    requiredChecks: buildChecks(),
    planningPolicy: {
      structuralAnchorRequired: true,
      unsafeReplaceAnchorsRejected:
        Array.from(
          UNSAFE_REPLACE_ANCHORS
        ),
      selectedAnchorClass:
        "symbol-declaration",
      requestedOperation:
        patchPlanner?.recommendedOperation ||
        null,
      effectiveOperation: operation
    }
  };
}

function buildRepositoryFallbackEdit({
  repositoryTargetFile,
  repositoryTargetResult
} = {}) {
  if (
    !repositoryTargetFile ||
    !repositoryTargetResult
  ) {
    return null;
  }

  /*
   * Repository-observation markers such as TODO,
   * FIXME, XXX and stub are discovery signals,
   * not safe replacement boundaries.
   *
   * When a concrete symbol cannot be located,
   * extend a CommonJS runtime only immediately
   * before its module.exports block.
   */
  const moduleExportsAnchor =
    findAnchor(
      repositoryTargetResult,
      "module.exports"
    );

  if (!moduleExportsAnchor) {
    return null;
  }

  return {
    file: repositoryTargetFile,
    operation: "insert-before",
    anchorPattern:
      moduleExportsAnchor.pattern,
    anchorLine:
      moduleExportsAnchor.line,
    purpose:
      "Implement repository-discovered work at the target module's safe export boundary.",
    requiredChecks: buildChecks(),
    planningPolicy: {
      structuralAnchorRequired: true,
      unsafeReplaceAnchorsRejected:
        Array.from(
          UNSAFE_REPLACE_ANCHORS
        ),
      selectedAnchorClass:
        "module-export-boundary"
    }
  };
}

function buildPatchPlannerFallback({
  indexResult,
  patchPlannerAnchor
} = {}) {
  if (
    !indexResult ||
    !patchPlannerAnchor
  ) {
    return null;
  }

  return {
    file: "ash/index.js",
    operation: "insert-after",
    anchorPattern:
      patchPlannerAnchor.pattern,
    anchorLine:
      patchPlannerAnchor.line,
    purpose:
      "Connect the next autonomous development runtime after Patch Planner output.",
    requiredChecks: buildChecks(),
    planningPolicy: {
      structuralAnchorRequired: true,
      unsafeReplaceAnchorsRejected:
        Array.from(
          UNSAFE_REPLACE_ANCHORS
        ),
      selectedAnchorClass:
        "named-section-boundary"
    }
  };
}

function buildRuntimeFallback({
  runtimeResult,
  runtimeModuleAnchor
} = {}) {
  if (
    !runtimeResult ||
    !runtimeModuleAnchor
  ) {
    return null;
  }

  return {
    file:
      "ash/runtime/patch-planner.js",
    operation: "insert-before",
    anchorPattern:
      runtimeModuleAnchor.pattern,
    anchorLine:
      runtimeModuleAnchor.line,
    purpose:
      "Prepare a safe runtime module extension point for autonomous development work.",
    requiredChecks: buildChecks(),
    planningPolicy: {
      structuralAnchorRequired: true,
      unsafeReplaceAnchorsRejected:
        Array.from(
          UNSAFE_REPLACE_ANCHORS
        ),
      selectedAnchorClass:
        "module-export-boundary"
    }
  };
}

function buildEditPlanner({
  patchPlanner,
  targetLocator
} = {}) {
  const required =
    patchPlanner?.needsPatchPlanning === true;

  const repositoryTargetFile =
    patchPlanner?.repositoryTargetFile ||
    null;

  const repositoryTargetResult =
    findTargetResult({
      targetLocator,
      repositoryTargetFile
    });

  const symbolRequested =
    typeof patchPlanner?.targetSymbol === "string" &&
    patchPlanner.targetSymbol.trim().length > 0;

  const symbolLocated =
    targetLocator?.symbolLocated === true;

  const requestedOperation =
    typeof patchPlanner?.recommendedOperation === "string"
      ? patchPlanner.recommendedOperation.trim().toLowerCase()
      : null;

  const supportedSymbolOperation =
    !requestedOperation ||
    normalizeOperation(requestedOperation) !== null;

  const indexResult =
    (targetLocator?.results || []).find(
      (result) =>
        normalizePath(
          result?.filePath || ""
        ).endsWith(
          "ash/index.js"
        )
    ) || null;

  const runtimeResult =
    (targetLocator?.results || []).find(
      (result) =>
        result?.role ===
        "runtime-fallback"
    ) ||
    (targetLocator?.results || []).find(
      (result) =>
        normalizePath(
          result?.filePath || ""
        ).endsWith(
          "ash/runtime/patch-planner.js"
        )
    ) ||
    null;

  const patchPlannerAnchor =
    findAnchor(
      indexResult,
      "== Patch Planner =="
    );

  const runtimeModuleAnchor =
    findAnchor(
      runtimeResult,
      "module.exports"
    );

  const edits = [];

  if (required) {
    const symbolEdit =
      buildSymbolEdit({
        repositoryTargetFile,
        targetLocator,
        patchPlanner
      });

    if (symbolEdit) {
      edits.push(symbolEdit);
    }
  }

  if (
    required &&
    edits.length === 0 &&
    !symbolRequested
  ) {
    const repositoryFallbackEdit =
      buildRepositoryFallbackEdit({
        repositoryTargetFile,
        repositoryTargetResult
      });

    if (repositoryFallbackEdit) {
      edits.push(
        repositoryFallbackEdit
      );
    }
  }

  if (
    required &&
    edits.length === 0 &&
    !symbolRequested
  ) {
    const patchPlannerFallback =
      buildPatchPlannerFallback({
        indexResult,
        patchPlannerAnchor
      });

    if (patchPlannerFallback) {
      edits.push(
        patchPlannerFallback
      );
    }
  }

  if (
    required &&
    edits.length === 0 &&
    !symbolRequested
  ) {
    const runtimeFallback =
      buildRuntimeFallback({
        runtimeResult,
        runtimeModuleAnchor
      });

    if (runtimeFallback) {
      edits.push(runtimeFallback);
    }
  }

  const selectedEdit =
    edits[0] || null;

  return {
    mode: "edit-planner-runtime",
    version:
      "ash-local-runtime-v0.3-symbol-aware-structural-anchors",
    required,
    targetLocated:
      targetLocator?.located === true,
    repositoryTargetLocated:
      Boolean(repositoryTargetResult),
    symbolRequested,
    symbolLocated,
    requestedOperation,
    supportedSymbolOperation,
    targetSymbol:
      patchPlanner?.targetSymbol ||
      null,
    selectedAnchorClass:
      selectedEdit?.planningPolicy
        ?.selectedAnchorClass ||
      null,
    edits,
    planReady:
      edits.length > 0,
    rejectedReplaceAnchors:
      Array.from(
        UNSAFE_REPLACE_ANCHORS
      ),
    nextActions:
      edits.length > 0
        ? [
            "generate_patch",
            "validate_patch",
            "apply_safe_patch",
            "verify_patch"
          ]
        : [],
    reason:
      symbolRequested &&
      !supportedSymbolOperation
        ? `Requested symbol operation ${requestedOperation} requires verified full-symbol range replacement.`
        : symbolRequested &&
            !symbolLocated
          ? `Target symbol ${patchPlanner?.targetSymbol} was not located; unsafe fallback editing was blocked.`
          : selectedEdit?.planningPolicy
              ?.selectedAnchorClass ===
              "symbol-declaration"
            ? "Edit plan prepared from the concrete target symbol."
            : edits.length > 0
              ? "Edit plan prepared from a safe structural fallback anchor."
              : repositoryTargetFile &&
                  repositoryTargetResult
                ? "Target file was located, but no safe structural edit anchor was found."
                : "No editable structural anchor was found.",
    plannedAt:
      new Date().toISOString()
  };
}

module.exports = {
  buildEditPlanner,
  findPreferredSymbolAnchor,
  normalizeOperation
};
