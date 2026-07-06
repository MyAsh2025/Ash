"use strict";

const { executeRegisteredAction } = require("../runtime/executor-registry");

const result = executeRegisteredAction(
  {
    action: "execute_plan",
    plan: {
      task: "executor development pipeline e2e smoke",
      steps: [
        {
          stepId: "dev-pipeline-001",
          action: "development_pipeline",
          generatedTask: {
            nextTask: {
              task: "executor development pipeline e2e smoke"
            }
          },
          dryRun: true
        }
      ]
    }
  },
  {
    projectPath: process.cwd(),
    dryRun: true,
    enforceCoreRuleGate: false,
    autoCoreCheck: false,
    autoGitCheck: false,
    autoCheckpoint: false,
    autoAshCoreSave: false,
    autoMemorySave: false,
    autoHandover: false
  }
);

const executorResult = result.result || null;
const pipelineStep = executorResult?.results?.find(
  (entry) => entry.action === "development_pipeline"
);
const pipelineResult = pipelineStep || null;

const summary = {
  mode: "executor-development-pipeline-smoke-test",
  success: result.success === true,
  adapterMode: result.mode,
  executorMode: executorResult?.mode || null,
  executorSuccess: executorResult?.success === true,
  pipelineStepSuccess: pipelineStep?.success === true,
  pipelineExecutorMode: pipelineResult?.mode || null,
  pipelineRuntimeMode: pipelineResult?.pipeline?.mode || null,
  dryRun: pipelineResult?.dryRun ?? null
};

console.log(JSON.stringify(summary, null, 2));

if (
  summary.success !== true ||
  summary.adapterMode !== "plan-executor-runtime" ||
  summary.executorMode !== "executor-runtime" ||
  summary.executorSuccess !== true ||
  summary.pipelineStepSuccess !== true ||
  summary.pipelineExecutorMode !== "development-pipeline-executor-runtime" ||
  summary.pipelineRuntimeMode !== "development-pipeline-runtime" ||
  summary.dryRun !== true
) {
  process.exit(1);
}

