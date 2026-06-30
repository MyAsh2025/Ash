function buildEditPlanner({ patchPlanner, targetLocator }) {
  const required = patchPlanner?.needsPatchPlanning === true;
  const repositoryTargetFile = patchPlanner?.repositoryTargetFile || null;

  const repositoryTargetResult = repositoryTargetFile
    ? (targetLocator?.results || [])
        .find((result) =>
          result.filePath &&
          result.filePath.replace(/\\/g, "/").endsWith(repositoryTargetFile.replace(/\\/g, "/"))
        )
    : null;

  const indexResult = (targetLocator?.results || [])
    .find((result) => result.filePath && result.filePath.endsWith("ash\\index.js"));

  const runtimeResult = (targetLocator?.results || [])
    .find((result) => result.filePath && result.filePath.includes("ash\\runtime"));

  const patchPlannerAnchor = (indexResult?.anchors || [])
    .find((anchor) => anchor.pattern === "== Patch Planner ==");

  const runtimeModuleAnchor = (runtimeResult?.anchors || [])
    .find((anchor) => anchor.pattern === "module.exports");

  const edits = [];

  const repositoryAnchor = (repositoryTargetResult?.anchors || [])
    .find((anchor) =>
      anchor.pattern === "FIXME" ||
      anchor.pattern === "throw new Error" ||
      anchor.pattern === "NotImplemented" ||
      anchor.pattern === "stub" ||
      anchor.pattern === "module.exports"
    );

  if (required && repositoryTargetFile && repositoryAnchor) {
    edits.push({
      file: repositoryTargetFile,
      operation: repositoryAnchor.pattern === "module.exports" ? "insert-before" : "replace",
      anchorPattern: repositoryAnchor.pattern,
      anchorLine: repositoryAnchor.line,
      purpose: "Apply repository-discovered implementation work to the observed target file.",
      requiredChecks: [
        "node_check",
        "git_diff_check",
        "runtime_corecheck"
      ]
    });
  }

  if (required && edits.length === 0 && patchPlannerAnchor) {
    edits.push({
      file: "ash/index.js",
      operation: "insert-after",
      anchorPattern: "== Patch Planner ==",
      anchorLine: patchPlannerAnchor.line,
      purpose: "Connect the next autonomous development runtime after Patch Planner output.",
      requiredChecks: [
        "node_check",
        "git_diff_check",
        "runtime_corecheck"
      ]
    });
  }

  if (required && edits.length === 0 && runtimeModuleAnchor) {
    edits.push({
      file: "ash/runtime/patch-planner.js",
      operation: "insert-before",
      anchorPattern: "module.exports",
      anchorLine: runtimeModuleAnchor.line,
      purpose: "Prepare runtime module extension point for repository-discovered implementation work.",
      requiredChecks: [
        "node_check",
        "git_diff_check",
        "runtime_corecheck"
      ]
    });
  }

  return {
    mode: "edit-planner-runtime",
    version: "ash-local-runtime-v0.1",
    required,
    targetLocated: targetLocator?.located === true,
    edits,
    planReady: edits.length > 0,
    nextActions: edits.length > 0
      ? [
          "generate_patch",
          "validate_patch",
          "apply_safe_patch",
          "verify_patch"
        ]
      : [],
    reason: edits.length > 0
      ? "Edit plan prepared from located anchors."
      : "No editable anchor found.",
    plannedAt: new Date().toISOString()
  };
}

module.exports = {
  buildEditPlanner
};



