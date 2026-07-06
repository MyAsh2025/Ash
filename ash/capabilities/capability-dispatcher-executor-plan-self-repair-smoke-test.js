"use strict";

const { dispatchAction } = require("../runtime/capability-dispatcher");

const result = dispatchAction(
  {
    action: "development_pipeline",
    generatedTask: {
      nextTask: {
        task: "executor self-repair opt-in e2e smoke"
      }
    },
    dryRun: true
  },
  {
    projectPath: process.cwd(),
    dryRun: true,

    useExecutorPlan: true,
    enforceCoreRuleGate: true,

    autoCoreCheck: true,
    autoGitCheck: true,
    autoCheckpoint: true,
    autoAshCoreSave: true,
    autoMemorySave: true,
    autoHandover: true,

    coreCheckFiles: [
      "ash/runtime/executor.js",
      "ash/runtime/capability-dispatcher.js",
      "ash/runtime/executors/plan-executor.js",
      "ash/runtime/executors/development-pipeline-executor.js",
      "ash/capabilities/capability-dispatcher-executor-plan-self-repair-smoke-test.js"
    ],

    bootstrap: {
      ashCore: {
        coreContext: {
          available: true,
          coreCheckRules: {
            beforePatch: true,
            beforeCheckpoint: true,
            beforeGit: true,
            beforeHandover: true
          },
          developmentPrinciples: {
            connectExistingRuntimesFirst: true,
            preferReuseBeforeCreation: true,
            avoidDuplicateRuntimes: true,
            verifiedTargetEditing: true,
            measureAutonomyOverRuntimeCount: true
          }
        }
      }
    }
  }
);

const executorResult = result.result?.result;

const summary = {
  mode: "capability-dispatcher-executor-plan-self-repair-smoke-test",
  success: result.success === true || result.success === false,
  route: result.route,
  dispatcherVersion: result.version,
  planExecutorMode: result.result?.mode || null,
  executorMode: executorResult?.mode || null,
  executorSuccess: executorResult?.success ?? null,
  enforcementEnabled: executorResult?.enforcementPolicy?.enforceCoreRuleGate === true,
  autoCoreCheckAttempts: executorResult?.autoCoreCheckResults?.length ?? 0,
  autoGitCheckAttempts: executorResult?.autoGitCheckResults?.length ?? 0,
  autoCheckpointAttempts: executorResult?.autoCheckpointResults?.length ?? 0,
  autoAshCoreSaveAttempts: executorResult?.autoAshCoreSaveResults?.length ?? 0,
  autoMemorySaveAttempts: executorResult?.autoMemorySaveResults?.length ?? 0,
  autoHandoverAttempts: executorResult?.autoHandoverResults?.length ?? 0,
  enforcementDecisionCount: executorResult?.enforcementDecisions?.length ?? 0,
  blockedCount: executorResult?.blocked?.length ?? 0,
  readyCount: executorResult?.ready?.length ?? 0,
  resultCount: executorResult?.results?.length ?? 0,
  guardedActions: executorResult?.guardedActions || [],
  corePreconditions: executorResult?.corePreconditions || {},
  preconditionDiagnostics: executorResult?.preconditionDiagnostics || {},
  enforcementDecisions: executorResult?.enforcementDecisions || [],
  autoCoreCheckResults: executorResult?.autoCoreCheckResults || []
};

console.log(JSON.stringify(summary, null, 2));

if (summary.route !== "executor-plan") {
  process.exitCode = 1;
}

if (summary.enforcementEnabled !== true) {
  process.exitCode = 1;
}

if (summary.guardedActions.length < 1) {
  process.exitCode = 1;
}

if (summary.autoCoreCheckAttempts < 1) {
  process.exitCode = 1;
}


