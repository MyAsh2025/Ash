"use strict";

const { runDevelopmentPipeline } = require("../development-pipeline-runtime");

function runDevelopmentPipelineExecutor(step = {}, context = {}) {
  const generatedTask =
    step.generatedTask ||
    context.generatedTask ||
    {
      nextTask: {
        task: step.task || context.task || "run development pipeline"
      }
    };

  const dryRun = step.dryRun ?? context.dryRun ?? true;

  const pipeline = runDevelopmentPipeline({
    generatedTask,
    context: {
      ...context,
      ...step.context
    },
    dryRun
  });

  return {
    mode: "development-pipeline-executor-runtime",
    version: "ash-local-runtime-v0.1-registered",
    action: step.action || "development_pipeline",
    success: pipeline.success === true,
    dryRun,
    generatedTask,
    pipeline,
    executedAt: new Date().toISOString()
  };
}

module.exports = {
  runDevelopmentPipelineExecutor
};
