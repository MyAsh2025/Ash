"use strict";

const UNSAFE_REPLACE_ANCHORS = new Set([
  "TODO",
  "FIXME",
  "XXX",
  "stub"
]);

function normalizePath(value = "") {
  return String(value).replace(/\\/g, "/");
}

function findTargetResult({
  targetLocator,
  repositoryTargetFile
} = {}) {
  if (!repositoryTargetFile) {
    return null;
  }

  const normalizedTarget = normalizePath(repositoryTargetFile);

  return (targetLocator?.results || []).find((result) => {
    const normalizedResult = normalizePath(result?.filePath || "");

    return (
      normalizedResult === normalizedTarget ||
      normalizedResult.endsWith(`/${normalizedTarget}`) ||
      normalizedResult.endsWith(normalizedTarget)
    );
  }) || null;
}

function findAnchor(result, pattern) {
  return (result?.anchors || []).find(
    (anchor) => anchor?.pattern === pattern
  ) || null;
}

function buildChecks() {
  return [
    "node_check",
    "git_diff_check",
    "runtime_corecheck"
  ];
}

function buildRepositoryEdit({
  repositoryTargetFile,
  repositoryTargetResult
} = {}) {
  if (!repositoryTargetFile || !repositoryTargetResult) {
    return null;
  }

  /*
   * Repository-observation markers such as TODO, FIXME, XXX and stub are
   * discovery signals, not safe replacement boundaries. Replacing one of
   * those short markers can overwrite an arbitrary section of source code.
   *
   * Until a structural function-level locator is available, extend a
   * CommonJS runtime only immediately before its module.exports block.
   */
  const moduleExportsAnchor = findAnchor(
    repositoryTargetResult,
    "module.exports"
  );

  if (!moduleExportsAnchor) {
    return null;
  }

  return {
    file: repositoryTargetFile,
    operation: "insert-before",
    anchorPattern: moduleExportsAnchor.pattern,
    anchorLine: moduleExportsAnchor.line,
    purpose:
      "Implement repository-discovered work at the target module's safe export boundary.",
    requiredChecks: buildChecks(),
    planningPolicy: {
      structuralAnchorRequired: true,
      unsafeReplaceAnchorsRejected: Array.from(
        UNSAFE_REPLACE_ANCHORS
      ),
      selectedAnchorClass: "module-export-boundary"
    }
  };
}

function buildPatchPlannerFallback({
  indexResult,
  patchPlannerAnchor
} = {}) {
  if (!indexResult || !patchPlannerAnchor) {
    return null;
  }

  return {
    file: "ash/index.js",
    operation: "insert-after",
    anchorPattern: patchPlannerAnchor.pattern,
    anchorLine: patchPlannerAnchor.line,
    purpose:
      "Connect the next autonomous development runtime after Patch Planner output.",
    requiredChecks: buildChecks(),
    planningPolicy: {
      structuralAnchorRequired: true,
      unsafeReplaceAnchorsRejected: Array.from(
        UNSAFE_REPLACE_ANCHORS
      ),
      selectedAnchorClass: "named-section-boundary"
    }
  };
}

function buildRuntimeFallback({
  runtimeResult,
  runtimeModuleAnchor
} = {}) {
  if (!runtimeResult || !runtimeModuleAnchor) {
    return null;
  }

  return {
    file: "ash/runtime/patch-planner.js",
    operation: "insert-before",
    anchorPattern: runtimeModuleAnchor.pattern,
    anchorLine: runtimeModuleAnchor.line,
    purpose:
      "Prepare a safe runtime module extension point for autonomous development work.",
    requiredChecks: buildChecks(),
    planningPolicy: {
      structuralAnchorRequired: true,
      unsafeReplaceAnchorsRejected: Array.from(
        UNSAFE_REPLACE_ANCHORS
      ),
      selectedAnchorClass: "module-export-boundary"
    }
  };
}

function buildEditPlanner({
  patchPlanner,
  targetLocator
} = {}) {
  const required = patchPlanner?.needsPatchPlanning === true;
  const repositoryTargetFile =
    patchPlanner?.repositoryTargetFile || null;

  const repositoryTargetResult = findTargetResult({
    targetLocator,
    repositoryTargetFile
  });

  const indexResult = (targetLocator?.results || []).find(
    (result) =>
      normalizePath(result?.filePath || "").endsWith(
        "ash/index.js"
      )
  ) || null;

  const runtimeResult = (targetLocator?.results || []).find(
    (result) =>
      normalizePath(result?.filePath || "").includes(
        "ash/runtime/"
      )
  ) || null;

  const patchPlannerAnchor = findAnchor(
    indexResult,
    "== Patch Planner =="
  );

  const runtimeModuleAnchor = findAnchor(
    runtimeResult,
    "module.exports"
  );

  const edits = [];

  if (required) {
    const repositoryEdit = buildRepositoryEdit({
      repositoryTargetFile,
      repositoryTargetResult
    });

    if (repositoryEdit) {
      edits.push(repositoryEdit);
    }
  }

  if (required && edits.length === 0) {
    const patchPlannerFallback = buildPatchPlannerFallback({
      indexResult,
      patchPlannerAnchor
    });

    if (patchPlannerFallback) {
      edits.push(patchPlannerFallback);
    }
  }

  if (required && edits.length === 0) {
    const runtimeFallback = buildRuntimeFallback({
      runtimeResult,
      runtimeModuleAnchor
    });

    if (runtimeFallback) {
      edits.push(runtimeFallback);
    }
  }

  return {
    mode: "edit-planner-runtime",
    version: "ash-local-runtime-v0.2-safe-structural-anchors",
    required,
    targetLocated: targetLocator?.located === true,
    repositoryTargetLocated: Boolean(repositoryTargetResult),
    edits,
    planReady: edits.length > 0,
    rejectedReplaceAnchors: Array.from(
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
      edits.length > 0
        ? "Edit plan prepared from a safe structural anchor."
        : repositoryTargetFile && repositoryTargetResult
          ? "Target file was located, but no safe structural edit anchor was found."
          : "No editable structural anchor was found.",
    plannedAt: new Date().toISOString()
  };
}

module.exports = {
  buildEditPlanner
};
