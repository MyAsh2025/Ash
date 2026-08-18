"use strict";

const { resolveExecutionAdapter } = require("./execution-adapter");
const { buildPatchPlanner } = require("./patch-planner");
const { buildImplementationPlanner } = require("./implementation-planner");
const {
  resolveRepositoryTargetFromTask
} = require("./target-locator");

function adaptQueueItemForExecution({
  item = null,
  context = {}
} = {}) {
  const bootstrap = context.bootstrap || null;
  if (!item) {
    return {
      mode: "queue-task-adapter-runtime",
      version: "ash-local-runtime-v0.1",
      success: false,
      reason: "No queue item provided."
    };
  }

  const step = {
    action: "prepare_patch_plan",
    queueId: item.id || item.queueId || null,
    task: item.task,
    priority: item.priority || "normal",
    source: item.source || "execution-queue",
    reason: item.reason || null
  };

  const adapter = resolveExecutionAdapter(step);

  const explicitTargetFile =
    item.targetFile ||
    item.file ||
    null;

  const targetResolution =
    explicitTargetFile
      ? {
          targetFile: explicitTargetFile,
          resolved: true,
          ambiguous: false,
          score: null,
          candidates: [],
          reason:
            "Repository target was provided explicitly."
        }
      : resolveRepositoryTargetFromTask({
          task: item.task,
          root:
            context.projectPath ||
            process.cwd()
        });

  const resolvedTargetFile =
    explicitTargetFile ||
    targetResolution.targetFile ||
    null;

  const implementationPlanner = buildImplementationPlanner({
    task: item.task,
    targetFile:
      resolvedTargetFile,
    work: item.work || [],
    implementationType:
      item.implementationType || null,
    strategy:
      item.strategy || null,
    recommendedOperation:
      item.recommendedOperation || null,
    confidence:
      item.confidence || null,
    targetSymbol:
      item.targetSymbol || null,
    symbolType:
      item.symbolType || null,
    expectedBehavior:
      item.expectedBehavior || [],
    implementationTemplate:
      item.implementationTemplate || null,
    repairAction:
      item.repairAction || null,
    failureStage:
      item.failureStage || null,
    errorMessage:
      item.errorMessage || null,
    issues:
      item.issues || [],
    validatedOperations:
      Array.isArray(item.validatedOperations)
        ? item.validatedOperations
        : [],
    previousTask:
      item.previousTask || null,
    coreContext:
      bootstrap?.ashCore?.coreContext ||
      bootstrap?.startupGate?.ashCore?.coreContext ||
      null
  });

  const patchPlanner = buildPatchPlanner({
    task: item.task,
    targetFile:
      resolvedTargetFile ||
      implementationPlanner.targetFile ||
      null,
    work: item.work || [],
    targetSymbol:
      implementationPlanner.targetSymbol ||
      item.targetSymbol ||
      null,
    symbolType:
      implementationPlanner.symbolType ||
      item.symbolType ||
      null,
    expectedBehavior:
      implementationPlanner.expectedBehavior ||
      item.expectedBehavior ||
      [],
    recommendedOperation:
      implementationPlanner.recommendedOperation ||
      item.recommendedOperation ||
      null,
    localRepairIntent:
      implementationPlanner.localRepairIntent ||
      item.localRepairIntent ||
      null,
    executionPolicy: {
      plannedActions: ["prepare_patch_plan"]
    },
    companyPlanner: null,
    bootstrap
  });

  const targetSymbolInference =
    implementationPlanner?.targetSymbolInference &&
    typeof implementationPlanner.targetSymbolInference === "object"
      ? implementationPlanner.targetSymbolInference
      : null;

  const javascriptTargetFile =
    typeof resolvedTargetFile === "string" &&
    /\.m?js$/i.test(resolvedTargetFile.trim());

  const targetSymbolUnresolved =
    patchPlanner.needsPatchPlanning === true &&
    javascriptTargetFile &&
    !implementationPlanner.targetSymbol &&
    targetSymbolInference &&
    !targetSymbolInference.targetSymbol;

  const targetSymbolResolutionStatus =
    patchPlanner.needsPatchPlanning !== true ||
    !javascriptTargetFile
      ? "not-required"
      : targetSymbolUnresolved &&
    typeof targetSymbolInference.source === "string" &&
    targetSymbolInference.source.startsWith("ambiguous-")
        ? "ambiguous"
        : targetSymbolUnresolved
          ? "unresolved"
          : "resolved";

  const targetSymbolResolution = {
    status: targetSymbolResolutionStatus,
    targetFile: resolvedTargetFile,
    targetSymbol:
      implementationPlanner.targetSymbol || null,
    inference: targetSymbolInference
      ? {
          ...targetSymbolInference
        }
      : null
  };

  const success =
    targetSymbolUnresolved !== true;

  const reason =
    targetSymbolUnresolved
      ? `Target symbol resolution is ${targetSymbolResolutionStatus} for ${resolvedTargetFile}; Queue Task Adapter stopped before Provider generation.`
      : "Queue item adapted for patch planning.";

  return {
    mode: "queue-task-adapter-runtime",
    version: "ash-local-runtime-v0.1",
    success,
    item,
    step,
    adapter,
    targetResolution,
    targetSymbolResolution,
    implementationPlanner,
    patchPlanner,
    readyForPatchPlanning:
      success &&
      Boolean(patchPlanner.planReady),
    reason,
    adaptedAt: new Date().toISOString()
  };
}

module.exports = {
  adaptQueueItemForExecution
};
