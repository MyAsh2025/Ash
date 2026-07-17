"use strict";

function getPipelineFailure(stages = []) {
  const failed = stages.find((stage) => stage.failed === true);

  if (!failed) {
    return {
      failureStage: null,
      errorMessage: null
    };
  }

  return {
    failureStage: failed.name,
    errorMessage: failed.reason || "Pipeline stage failed."
  };
}
const { buildExecutionQueue } = require("./execution-queue-runtime");
const { adaptQueueItemForExecution } = require("./queue-task-adapter");
const { buildTargetLocator } = require("./target-locator");
const {
  resolveImplementationProvider
} = require("./implementation-provider");
const { buildEditPlanner } = require("./edit-planner");
const { buildPatchGenerator } = require("./patch-generator");
const { generateCodeForPatch } = require("./code-generator");
const { validatePatchOperations } = require("./patch-validator");
const { applyValidatedPatch } = require("./patch-apply-engine");

function runDevelopmentPipeline({
  generatedTask = null,
  context = {},
  dryRun = true
} = {}) {
  const executionQueue = buildExecutionQueue({
    generatedTask,
    source: "development-pipeline"
  });

  const queueItem =
    executionQueue?.items?.[0] ||
    executionQueue?.queue?.[0] ||
    executionQueue?.tasks?.[0] ||
    null;

  const queueTaskAdapter = queueItem
    ? adaptQueueItemForExecution({
        item: queueItem,
        context
      })
    : {
        mode: "queue-task-adapter-runtime",
        version:
      "ash-local-runtime-v0.2-implementation-provider",
        success: false,
        reason: "No queue item available for adaptation."
      };

  const patchPlanner = queueTaskAdapter.patchPlanner || {
    mode: "patch-planner-runtime",
    success: false,
    planReady: false,
    reason: "No patch planner result available from queue adapter."
  };

  const targetLocator = buildTargetLocator({
    patchPlanner
  });

  const implementationProvider =
    resolveImplementationProvider({
      implementationPlanner:
        queueTaskAdapter.implementationPlanner ||
        null,
      targetLocator,
      provider:
        context.implementationProvider ||
        null
    });

  const resolvedImplementationPlanner =
    implementationProvider.implementationPlanner ||
    queueTaskAdapter.implementationPlanner ||
    null;

  const editPlanner = buildEditPlanner({
    patchPlanner,
    targetLocator
  });

  const patchGenerator = buildPatchGenerator(editPlanner);
  const codeGenerator = generateCodeForPatch(patchGenerator, {
    implementationPlanner:
      resolvedImplementationPlanner,
    selectedTask:
      queueTaskAdapter.item || null,
    patchPlanner
  });
  const patchValidator = validatePatchOperations(codeGenerator);

  const patchApplyEngine = applyValidatedPatch({
    patchValidator,
    codeGenerator,
    dryRun
  });

  const pipelineFailure = getPipelineFailure([
    {
      name: "execution-queue",
      failed: !executionQueue,
      reason: "Execution queue was not created."
    },
    {
      name: "queue-task-adapter",
      failed: queueTaskAdapter.success !== true,
      reason: queueTaskAdapter.reason
    },
    {
      name: "patch-planner",
      failed: patchPlanner.planReady !== true,
      reason: patchPlanner.reason
    },
    {
      name: "target-locator",
      failed: targetLocator.located !== true,
      reason: targetLocator.reason
    },
    {
      name: "implementation-provider",
      failed:
        implementationProvider.success !== true,
      reason:
        implementationProvider.reason
    },
    {
      name: "edit-planner",
      failed: editPlanner.planReady !== true,
      reason: editPlanner.reason
    },
    {
      name: "patch-generator",
      failed: patchGenerator.success !== true,
      reason: patchGenerator.reason
    },
    {
      name: "code-generator",
      failed: codeGenerator.success !== true,
      reason:
        codeGenerator.operations?.find((operation) => operation.payload?.missingReason)?.payload?.missingReason ||
        codeGenerator.reason
    },
    {
      name: "patch-validator",
      failed: patchValidator.success !== true,
      reason: patchValidator.reason
    },
    {
      name: "patch-apply-engine",
      failed: patchApplyEngine.success !== true,
      reason:
        patchApplyEngine.results?.find((result) => result.missingReason)?.missingReason ||
        patchApplyEngine.reason
    }
  ]);

  const success =
    Boolean(executionQueue) &&
    queueTaskAdapter.success === true &&
    patchPlanner.planReady === true &&
    targetLocator.located === true &&
    implementationProvider.success === true &&
    editPlanner.planReady === true &&
    patchGenerator.success === true &&
    codeGenerator.success === true &&
    patchValidator.success === true &&
    patchApplyEngine.success === true;

  return {
    mode: "development-pipeline-runtime",
    version:
      "ash-local-runtime-v0.2-implementation-provider",
    success,
    dryRun,
    executionQueue,
    queueTaskAdapter,
    patchPlanner,
    targetLocator,
    implementationProvider,
    resolvedImplementationPlanner,
    editPlanner,
    patchGenerator,
    codeGenerator,
    patchValidator,
    patchApplyEngine,
    failureStage: pipelineFailure.failureStage,
    errorMessage: pipelineFailure.errorMessage,
    reason: success
      ? "Development pipeline completed through patch apply engine."
      : pipelineFailure.errorMessage || "Development pipeline did not complete successfully.",
    ranAt: new Date().toISOString()
  };
}

module.exports = {
  runDevelopmentPipeline
};
