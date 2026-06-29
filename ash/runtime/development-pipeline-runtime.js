"use strict";

const { buildExecutionQueue } = require("./execution-queue-runtime");
const { adaptQueueItemForExecution } = require("./queue-task-adapter");
const { buildTargetLocator } = require("./target-locator");
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
        version: "ash-local-runtime-v0.1",
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

  const editPlanner = buildEditPlanner({
    patchPlanner,
    targetLocator
  });

  const patchGenerator = buildPatchGenerator(editPlanner);
  const codeGenerator = generateCodeForPatch(patchGenerator);
  const patchValidator = validatePatchOperations(codeGenerator);

  const patchApplyEngine = applyValidatedPatch({
    patchValidator,
    codeGenerator,
    dryRun
  });

  const success =
    Boolean(executionQueue) &&
    queueTaskAdapter.success === true &&
    patchPlanner.planReady === true &&
    targetLocator.located === true &&
    editPlanner.planReady === true &&
    patchGenerator.success === true &&
    codeGenerator.success === true &&
    patchValidator.success === true &&
    patchApplyEngine.success === true;

  return {
    mode: "development-pipeline-runtime",
    version: "ash-local-runtime-v0.1",
    success,
    dryRun,
    executionQueue,
    queueTaskAdapter,
    patchPlanner,
    targetLocator,
    editPlanner,
    patchGenerator,
    codeGenerator,
    patchValidator,
    patchApplyEngine,
    reason: success
      ? "Development pipeline completed through patch apply engine."
      : "Development pipeline did not complete successfully.",
    ranAt: new Date().toISOString()
  };
}

module.exports = {
  runDevelopmentPipeline
};
