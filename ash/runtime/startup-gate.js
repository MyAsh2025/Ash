"use strict";

const fs = require("fs");
const path = require("path");

const {
  loadAshCore
} = require("./ash-core-connector");

const {
  evaluateRules
} = require("./rule-evaluator");

function listRecentLogs(logDir, limit = 5) {
  if (!fs.existsSync(logDir)) {
    return [];
  }

  return fs.readdirSync(logDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .slice(-limit);
}

function classifyRepositoryState(repository = {}) {
  if (repository.clean === true) {
    return "completed";
  }

  const changedFiles = repository.changedFiles || [];

  if (changedFiles.length > 0) {
    return "implemented-but-uncommitted";
  }

  return "unverified";
}

function buildCoreRepairActions(violations = []) {
  const actions = [];

  if (
    violations.includes("core-context-unavailable") ||
    violations.includes("required-core-incomplete")
  ) {
    actions.push("repair_core_runtime");
  }

  if (
    violations.includes("active-runtime-stack-incomplete")
  ) {
    actions.push("verify_runtime_stack");
  }

  if (
    violations.includes("core-loading-rule-unavailable") ||
    violations.includes(
      "runtime-enforcement-rule-unavailable"
    )
  ) {
    actions.push("restore_runtime_enforcement");
  }

  return [...new Set(actions)];
}

function runStartupGate({
  task = "",
  projectContext = null,
  repository = {},
  dryRun = true,
  ashCorePath = null
} = {}) {
  const normalizedTask =
    String(task || "").toLowerCase();

  const projectPath =
    projectContext?.projectPath ||
    process.cwd();

  const logDir = path.join(
    projectPath,
    "ash",
    "logs"
  );

  const recentLogs =
    listRecentLogs(logDir);

  const repositoryState =
    classifyRepositoryState(repository);

  const ashCore = loadAshCore(
    ashCorePath
      ? { ashCorePath }
      : {}
  );

  const ruleEvaluation = evaluateRules({
    bootstrap: {
      mode: "startup-gate-rule-bootstrap",
      ashCore
    },
    workflow: {
      autoExecutable: false
    },
    taskRuntime: null
  });

  const runtimeExecutionAllowed =
    ruleEvaluation.runtimeExecutionAllowed === true;

  const violations = Array.isArray(
    ruleEvaluation.violations
  )
    ? ruleEvaluation.violations
    : [];

  const stopBeforeDevelopmentPipeline =
    runtimeExecutionAllowed !== true;

  const coreCheckRequired =
    repositoryState !== "completed" ||
    Boolean(
      repository.risk &&
      repository.risk !== "low"
    ) ||
    normalizedTask.includes("runtime") ||
    normalizedTask.includes("architecture") ||
    normalizedTask.includes("corecheck") ||
    normalizedTask.includes("gate") ||
    !runtimeExecutionAllowed;

  const saveVerificationRequired =
    repositoryState ===
    "implemented-but-uncommitted";

  const handoverReviewRequired =
    recentLogs.length >= 5 ||
    normalizedTask.includes("handover") ||
    normalizedTask.includes("resume");

  const coreRepairActions =
    buildCoreRepairActions(violations);

  return {
    mode: "startup-gate-runtime",
    version:
      "ash-local-runtime-v0.2-core-enforcement",
    task,
    dryRun,
    projectPath,
    ashCore,
    ruleEvaluation,
    repositoryState,
    runtimeExecutionAllowed,
    stopBeforeDevelopmentPipeline,
    violations,
    stateClassification: {
      completed:
        repositoryState === "completed",
      implementedButUncommitted:
        repositoryState ===
        "implemented-but-uncommitted",
      unverified:
        repositoryState === "unverified",
      unimplemented: false
    },
    gates: {
      coreCheckRequired,
      repositoryVerificationRequired: true,
      saveVerificationRequired,
      handoverReviewRequired,
      resumeRequired: true,
      runtimeExecutionAllowed,
      coreRuntimeBlocked:
        !runtimeExecutionAllowed
    },
    recommendedActions: [
      "inspect_repository",
      ...(coreCheckRequired
        ? ["runtime_corecheck"]
        : []),
      ...(saveVerificationRequired
        ? ["git_diff_check"]
        : []),
      ...coreRepairActions
    ],
    recentLogs,
    evaluatedAt: new Date().toISOString()
  };
}

module.exports = {
  runStartupGate,
  classifyRepositoryState,
  buildCoreRepairActions
};