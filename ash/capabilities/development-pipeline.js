"use strict";

const { runDevelopmentPipeline } = require("../runtime/development-pipeline-runtime");

function runDevelopmentPipelineCapability(input = {}) {
  const generatedTask =
    input.generatedTask ||
    {
      nextTask: {
        task: input.task || "run development pipeline"
      }
    };

  return runDevelopmentPipeline({
    generatedTask,
    context: input,
    dryRun: input.dryRun !== false
  });
}

module.exports = {
  runDevelopmentPipelineCapability
};
