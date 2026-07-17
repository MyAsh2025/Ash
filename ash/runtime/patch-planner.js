"use strict";

const { evaluateRules } = require("./rule-evaluator");

function normalizeExpectedBehavior(value = []) {
  return Array.isArray(value)
    ? value
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function buildPatchPlanner({
  task,
  targetFile = null,
  work = [],
  executionPolicy,
  companyPlanner,
  bootstrap = null,
  targetSymbol = null,
  symbolType = null,
  expectedBehavior = [],
  recommendedOperation = null
} = {}) {
  const evaluatedRules = evaluateRules({ bootstrap });
  const planningRules = evaluatedRules.planning || {};

  const plannedActions =
    executionPolicy?.plannedActions ||
    companyPlanner?.plannedActions ||
    [];

  const repositoryTargetFile = targetFile || null;
  const repositoryWork = Array.isArray(work) ? work : [];

  const normalizedTargetSymbol =
    typeof targetSymbol === "string" &&
    targetSymbol.trim().length > 0
      ? targetSymbol.trim()
      : null;

  const normalizedSymbolType =
    typeof symbolType === "string" &&
    symbolType.trim().length > 0
      ? symbolType.trim()
      : null;

  const normalizedExpectedBehavior =
    normalizeExpectedBehavior(expectedBehavior);

  const normalizedRecommendedOperation =
    typeof recommendedOperation === "string" &&
    recommendedOperation.trim().length > 0
      ? recommendedOperation.trim()
      : null;

  const needsPatchPlanning =
    plannedActions.includes("prepare_patch_plan") ||
    String(task || "").toLowerCase().includes("develop") ||
    String(task || "").includes("自律開発") ||
    String(task || "").includes("自立開発");

  return {
    mode: "patch-planner-runtime",
    version:
      "ash-local-runtime-v0.2-concrete-symbol-routing",
    task,
    ruleEvaluatorAware: true,
    coreContextAware: evaluatedRules.coreContextAware,
    planningRules,
    targetProject: "ash",
    targetFiles: needsPatchPlanning
      ? [
          ...(repositoryTargetFile
            ? [repositoryTargetFile]
            : []),
          "ash/index.js",
          "ash/runtime"
        ]
      : [],
    repositoryTargetFile,
    repositoryWork,
    targetSymbol: normalizedTargetSymbol,
    symbolType: normalizedSymbolType,
    expectedBehavior: normalizedExpectedBehavior,
    recommendedOperation:
      normalizedRecommendedOperation,
    concreteTargetReady:
      Boolean(repositoryTargetFile) &&
      Boolean(normalizedTargetSymbol),
    requiredCapabilities: needsPatchPlanning
      ? [
          "target_location",
          "patch_generation",
          "safe_patch",
          "node_check",
          "git_diff_check",
          "runtime_corecheck"
        ]
      : [],
    nextActions: needsPatchPlanning
      ? [
          "locate_target",
          "prepare_edit_plan",
          "generate_patch",
          "validate_patch",
          "apply_safe_patch",
          "verify_patch"
        ]
      : [],
    needsPatchPlanning,
    planReady: needsPatchPlanning,
    reason: needsPatchPlanning
      ? normalizedTargetSymbol
        ? `Patch planning requested for symbol ${normalizedTargetSymbol}.`
        : "Patch planning requested; a concrete target symbol is not yet available."
      : "Patch planning is not required.",
    plannedAt: new Date().toISOString()
  };
}

module.exports = {
  buildPatchPlanner
};

