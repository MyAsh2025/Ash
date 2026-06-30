"use strict";

const { runDevelopmentPipeline } = require("../runtime/development-pipeline-runtime");
const { applyApprovalRuntime } = require("../runtime/approval-runtime");

function runDevelopmentPipelineCapability(input = {}) {
  const generatedTask =
    input.generatedTask ||
    {
      nextTask: {
        task: input.task || "run development pipeline"
      }
    };

  const requestedDryRun = input.dryRun !== false;

  const approval = applyApprovalRuntime({
    task: input.task || generatedTask?.nextTask?.task || "run development pipeline",
    repository: input.repository || null,
    startupGate: input.startupGate || null,
    governance: input.governance || null,
    workflow: input.workflow || null,
    dryRun: requestedDryRun
  });

  const effectiveDryRun =
    requestedDryRun ||
    approval.executionAllowed !== true;

  const pipeline = runDevelopmentPipeline({
    generatedTask,
    context: {
      ...input,
      approval
    },
    dryRun: effectiveDryRun
  });

  return {
    ...pipeline,
    approval,
    requestedDryRun,
    effectiveDryRun,
    executionAllowed: approval.executionAllowed === true,
    applyMode: effectiveDryRun ? "dryRun" : "apply"
  };
}

module.exports = {
  runDevelopmentPipelineCapability
};

