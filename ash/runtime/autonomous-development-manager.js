"use strict";

const {
  readAutonomousCompletedTasks,
  writeAutonomousCompletedTask
} = require("./runtime-state");

function extractExplicitTargetSymbol(task = "") {
  const text = String(task || "").trim();

  if (!text) {
    return null;
  }

  const labeledMatch = text.match(
    /\btarget\s+symbol\b\s*[:=]\s*([A-Za-z_$][A-Za-z0-9_$]*)\b/i
  );

  if (labeledMatch?.[1]) {
    return labeledMatch[1];
  }

  const actionMatch = text.match(
    /\b(?:improve|implement|repair|fix|update|complete)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/i
  );

  if (actionMatch?.[1]) {
    const candidate = actionMatch[1];

    /*
     * Do not treat ordinary prose such as
     * "complete missing implementation" as a symbol request.
     *
     * Unlabeled symbol inference is limited to identifiers
     * that visibly resemble code. Simple lowercase symbols
     * remain available through the explicit
     * "target symbol: name" syntax.
     */
    const resemblesCodeSymbol =
      /[a-z][A-Z]/.test(candidate) ||
      candidate.includes("_") ||
      candidate.includes("$");

    if (resemblesCodeSymbol) {
      return candidate;
    }
  }

  return null;
}

function extractExplicitTargetFile(task = "") {
  const text = String(task || "");
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();

    const inlineTarget = line.match(/^target(?:\s+file)?\s*:\s*(.+)$/i);
    if (inlineTarget && inlineTarget[1]) {
      const candidate = inlineTarget[1].trim().replace(/^[-*]\s*/, "");
      if (/\.(js|json|md|ps1|txt)$/i.test(candidate)) return candidate;
    }

    if (/^target(?:\s+file)?\s*:?\s*$/i.test(line) && lines[i + 1]) {
      const candidate = lines[i + 1].trim().replace(/^[-*]\s*/, "");
      if (/\.(js|json|md|ps1|txt)$/i.test(candidate)) return candidate;
    }
  }

  const pathMatch = text.match(/\b(ash[\/\\][A-Za-z0-9._\/\\-]+\.(?:js|mjs|json|md|ps1|txt))\b/i);
  return pathMatch ? pathMatch[1].replace(/\\/g, "/") : null;
}
const { observeRepository } = require("./repository-observation-runtime");
const { discoverTaskFromRepository } = require("./task-discovery-runtime");
const { runCapabilityLoop } = require("./capability-loop");
const {
  runCoreCheck,
  getPermanentRegressionChecks
} = require("./corecheck-runtime");
const { rollbackAppliedPatch } = require("./patch-apply-engine");
const {
  evaluateExistingRepairEligibility,
  buildExistingRepairCompletionEvidence
} = require("./completion-evidence");

function extractCapabilityFailure(capabilityLoop = null) {
  const failedStep = [...(capabilityLoop?.steps || [])]
    .reverse()
    .find((step) =>
      step?.classification?.success === false ||
      step?.dispatchResult?.classification?.success === false ||
      step?.dispatchResult?.result?.result?.success === false
    );

  const pipelineResult = failedStep?.dispatchResult?.result?.result || null;
  const classification = failedStep?.classification || failedStep?.dispatchResult?.classification || null;
  const failureStage =
    pipelineResult?.failureStage ||
    pipelineResult?.mode ||
    failedStep?.action ||
    "capability-loop";
  const targetSymbolResolution =
    pipelineResult?.queueTaskAdapter?.targetSymbolResolution || null;

  return {
    failureStage,
    errorMessage:
      pipelineResult?.reason ||
      classification?.reason ||
      capabilityLoop?.stopReason ||
      "Capability loop failed.",
    failedAction: failedStep?.action || null,
    issues: Array.isArray(pipelineResult?.patchValidator?.issues)
      ? pipelineResult.patchValidator.issues
      : [],
    validatedOperations: Array.isArray(
      pipelineResult?.patchValidator?.validatedOperations
    )
      ? pipelineResult.patchValidator.validatedOperations
      : [],
    targetFile:
      pipelineResult?.patchValidator?.validatedOperations?.[0]?.file ||
      pipelineResult?.editPlanner?.edits?.[0]?.file ||
      targetSymbolResolution?.targetFile ||
      null,
    targetSymbol: targetSymbolResolution?.targetSymbol || null,
    targetSymbolResolution,
    targetSymbolInference:
      targetSymbolResolution?.inference || null,
    providerFailure:
      failureStage === "implementation-provider" &&
      pipelineResult?.implementationProvider?.success === false
        ? (
            pipelineResult.implementationProvider.providerResult ||
            {
              reason:
                pipelineResult.implementationProvider.reason ||
                null
            }
          )
        : null
  };
}

function isUnresolvedTargetSymbolFailure(failure = null) {
  const status = failure?.targetSymbolResolution?.status;

  return (
    failure?.failureStage === "queue-task-adapter" &&
    failure?.targetSymbol == null &&
    (status === "ambiguous" || status === "unresolved") &&
    failure?.targetSymbolInference &&
    typeof failure.targetSymbolInference === "object"
  );
}

function buildRepairTask({
  failure,
  previousTask,
  cycleIndex
} = {}) {
  const issues = Array.isArray(failure?.issues)
    ? failure.issues
    : [];

  const validatedOperations = Array.isArray(failure?.validatedOperations)
    ? failure.validatedOperations
    : [];

  return {
    task: [
      "Repair autonomous development failure",
      failure?.failureStage ? `at ${failure.failureStage}` : null,
      failure?.targetFile ? `for ${failure.targetFile}` : null
    ].filter(Boolean).join(" "),
    priority: "critical",
    source: "autonomous-failure-recovery",
    file: failure?.targetFile || previousTask?.file || null,
    targetFile:
      failure?.targetFile ||
      previousTask?.targetFile ||
      previousTask?.file ||
      null,
    targetSymbol:
      failure?.targetSymbol ||
      previousTask?.targetSymbol ||
      null,
    work: [
      "repair",
      "self-evolution",
      failure?.failureStage || "capability-loop"
    ],
    failureStage: failure?.failureStage || null,
    errorMessage: failure?.errorMessage || null,
    failedAction: failure?.failedAction || null,
    issues,
    validatedOperations,
    providerFailure:
      failure?.providerFailure || null,
    rollbackEvidence:
      failure?.rollbackEvidence || null,
    previousTask: previousTask || null,
    repairAction: "repair_patch",
    cycleIndex,
    reason: [
      failure?.errorMessage || "Autonomous development failed.",
      issues.length > 0 ? `Issues: ${issues.join(" | ")}` : null,
      "Repair this failure and continue autonomous development."
    ].filter(Boolean).join(" ")
  };
}

function runExistingRepairVerification({
  projectPath = process.cwd(),
  targetFile = null,
  targetSymbol = null,
  coverageKind = null,
  regressionId = null,
  previousPipelineResult = null,
  permanentRegressionChecks = null,
  coreCheckRunner = runCoreCheck
} = {}) {
  const eligibility = evaluateExistingRepairEligibility({
    projectPath,
    targetFile,
    targetSymbol,
    coverageKind,
    regressionId,
    permanentRegressionChecks:
      permanentRegressionChecks || getPermanentRegressionChecks(),
    previousPipelineResult
  });

  if (eligibility.eligible !== true) {
    return {
      mode: "autonomous-existing-repair-verification",
      version: "ash-local-runtime-v0.1-repository-evidence",
      success: false,
      completionKind: "existing-repair-verification",
      completionEligible: false,
      completionSuccess: false,
      effectiveDryRun: true,
      applied: false,
      coreCheck: null,
      eligibility,
      reason: eligibility.reason,
      ranAt: new Date().toISOString()
    };
  }

  const coreCheck = coreCheckRunner({
    projectPath
  });
  const completionEvidence =
    buildExistingRepairCompletionEvidence({
      eligibility,
      coreCheck
    });

  return {
    mode: "autonomous-existing-repair-verification",
    version: "ash-local-runtime-v0.1-repository-evidence",
    success: completionEvidence.completionSuccess,
    completionKind: completionEvidence.completionKind,
    completionEligible: completionEvidence.completionEligible,
    completionSuccess: completionEvidence.completionSuccess,
    executionSuccess: completionEvidence.executionSuccess,
    verificationSuccess: completionEvidence.verificationSuccess,
    effectiveDryRun: true,
    applied: false,
    targetFile,
    targetSymbol,
    coverageKind,
    regressionId,
    eligibility,
    completionEvidence,
    coreCheck,
    reason: completionEvidence.reason,
    ranAt: new Date().toISOString()
  };
}
function runAutonomousDevelopmentManager({
  task = "autonomous development",
  context = {},
  maxCycles = 1,
  dryRun = false
} = {}) {
  const cycles = [];
  let pendingRepairTask =
    context.pendingRepairTask &&
    typeof context.pendingRepairTask === "object" &&
    !Array.isArray(context.pendingRepairTask) &&
    typeof context.pendingRepairTask.task === "string" &&
    context.pendingRepairTask.task.trim()
      ? context.pendingRepairTask
      : null;
  let explicitUserTaskConsumed = false;
  const persistedCompletion =
    readAutonomousCompletedTasks({
      projectPath:
        context.projectPath ||
        process.cwd()
    });

  const completedTasks =
    Array.isArray(
      persistedCompletion?.tasks
    )
      ? [
          ...persistedCompletion.tasks
        ]
      : [];

  for (let i = 0; i < maxCycles; i++) {
    const repositoryObservation = observeRepository({
      projectPath: context.projectPath || process.cwd()
    });

    const taskDiscovery = discoverTaskFromRepository({
      observation: repositoryObservation,
      excludedTasks: completedTasks
    });

    const noRepositoryTaskAvailable =
      !taskDiscovery.discovered;

    const hasExplicitUserTask =
      task &&
      task.trim() &&
      task.trim() !== "autonomous development" &&
      task.trim() !== "run fully autonomous Ash development";

    const explicitTargetFile =
      hasExplicitUserTask
        ? extractExplicitTargetFile(task)
        : null;

    const explicitTargetSymbol =
      hasExplicitUserTask
        ? extractExplicitTargetSymbol(task)
        : null;

    const explicitUserTask =
      hasExplicitUserTask
        ? {
            task: task.trim(),
            priority: "critical",
            source: "user-explicit-task",
            file: explicitTargetFile,
            targetFile: explicitTargetFile,
            targetSymbol: explicitTargetSymbol,
            work: ["self-evolution", "priority"],
            reason:
              explicitTargetFile
                ? `Explicit user task targets ${explicitTargetFile}.`
                : "Explicit user task requires autonomous target discovery."
          }
        : null;

    const availableExplicitUserTask =
      explicitUserTask &&
      explicitUserTaskConsumed !== true
        ? explicitUserTask
        : null;

    const discoveredTask =
      pendingRepairTask ||
      availableExplicitUserTask ||
      taskDiscovery.task;
    if (
      !discoveredTask &&
      noRepositoryTaskAvailable
    ) {
      return {
        mode: "autonomous-development-manager-runtime",
        version: "ash-local-runtime-v0.1",
        success: true,
        stopped: true,
        stopReason: "no_repository_task",
        cycles,
        finalObservation: repositoryObservation,
        ranAt: new Date().toISOString()
      };
    }

    if (
      discoveredTask === explicitUserTask
    ) {
      explicitUserTaskConsumed = true;
    }

    pendingRepairTask = null;

    const capabilityLoop = runCapabilityLoop({
      task: discoveredTask.task || task,
      initialAction: "minimal_core_gate",
      initialInput: {
        generatedTask: {
          nextTask: discoveredTask
        },
        dryRun
      },
      context: {
        ...context,
        generatedTask: {
          nextTask: discoveredTask
        },
        dryRun
      },
      maxSteps: 8
    });

    const coreCheck = runCoreCheck({
      files: [
        "./ash/runtime/autonomous-development-manager.js",
        "./ash/runtime/development-pipeline-runtime.js",
        "./ash/runtime/capability-loop.js",
        "./ash/capabilities/development-pipeline.js"
      ]
    });

    cycles.push({
      index: i,
      repositoryObservation,
      taskDiscovery,
      selectedTask: discoveredTask,
      capabilityLoop,
      coreCheck,
      repairTask: null
    });

    if (!capabilityLoop.success || !coreCheck.success) {
      const capabilityFailure = !capabilityLoop.success
        ? extractCapabilityFailure(capabilityLoop)
        : null;

      if (!coreCheck.success) {
        const developmentStep = [...(capabilityLoop?.steps || [])].reverse().find((step) => step?.action === "development_pipeline") || null;
        const pipelineResult = developmentStep?.dispatchResult?.result?.result || null;
        const rollbackEvidence = pipelineResult?.patchApplyEngine?.applied === true
          ? rollbackAppliedPatch({ patchApplyEngine: pipelineResult.patchApplyEngine, projectPath: context.projectPath || process.cwd() })
          : { mode: "patch-apply-rollback", success: true, attempted: false, results: [], reason: "CoreCheck failed without an applied patch requiring rollback.", rolledBackAt: new Date().toISOString() };
        const coreCheckFailure = {
          failureStage: "corecheck",
          errorMessage: coreCheck.reason || "CoreCheck failed.",
          failedAction: "corecheck",
          issues: [],
          validatedOperations: Array.isArray(pipelineResult?.patchValidator?.validatedOperations) ? pipelineResult.patchValidator.validatedOperations : [],
          targetFile: pipelineResult?.patchValidator?.validatedOperations?.[0]?.file || discoveredTask?.targetFile || discoveredTask?.file || null,
          targetSymbol: discoveredTask?.targetSymbol || null,
          providerFailure: pipelineResult?.implementationProvider?.success === false ? (pipelineResult.implementationProvider.providerResult || { reason: pipelineResult.implementationProvider.reason || null }) : null,
          rollbackEvidence
        };
        const repairTask = buildRepairTask({ failure: coreCheckFailure, previousTask: discoveredTask, cycleIndex: i });
        cycles[cycles.length - 1].repairTask = repairTask;
        pendingRepairTask = repairTask;
        if (rollbackEvidence.attempted === true && rollbackEvidence.success !== true) {
          return { mode: "autonomous-development-manager-runtime", version: "ash-local-runtime-v0.4-corecheck-rollback-verification", success: false, stopped: true, stopReason: "corecheck_failed_rollback_failed", failureStage: "corecheck", errorMessage: coreCheckFailure.errorMessage, failedAction: "corecheck", pendingRepairTask: repairTask, rollbackEvidence, cycles, ranAt: new Date().toISOString() };
        }

        const rollbackCoreCheck =
          rollbackEvidence.attempted === true
            ? runCoreCheck({
                files: [
                  "./ash/runtime/autonomous-development-manager.js",
                  "./ash/runtime/development-pipeline-runtime.js",
                  "./ash/runtime/capability-loop.js",
                  "./ash/capabilities/development-pipeline.js"
                ]
              })
            : null;

        cycles[cycles.length - 1].rollbackCoreCheck =
          rollbackCoreCheck;

        if (
          rollbackCoreCheck &&
          rollbackCoreCheck.success !== true
        ) {
          return {
            mode: "autonomous-development-manager-runtime",
            version: "ash-local-runtime-v0.4-corecheck-rollback-verification",
            success: false,
            stopped: true,
            stopReason: "corecheck_failed_post_rollback_verification_failed",
            failureStage: "corecheck",
            errorMessage:
              rollbackCoreCheck.reason ||
              "CoreCheck still failed after rollback.",
            failedAction: "corecheck",
            pendingRepairTask: repairTask,
            rollbackEvidence,
            rollbackCoreCheck,
            cycles,
            ranAt: new Date().toISOString()
          };
        }

        if (i < maxCycles - 1) continue;
        return { mode: "autonomous-development-manager-runtime", version: "ash-local-runtime-v0.4-corecheck-rollback-verification", success: false, stopped: true, stopReason: "max_cycles_reached_with_pending_repair", failureStage: "corecheck", errorMessage: coreCheckFailure.errorMessage, failedAction: "corecheck", pendingRepairTask: repairTask, rollbackEvidence, rollbackCoreCheck, cycles, ranAt: new Date().toISOString() };
      }

      if (isUnresolvedTargetSymbolFailure(capabilityFailure)) {
        return {
          mode: "autonomous-development-manager-runtime",
          version: "ash-local-runtime-v0.3-target-symbol-safe-stop",
          success: false,
          stopped: true,
          stopReason: "target_symbol_resolution_unresolved",
          failureStage: capabilityFailure.failureStage,
          errorMessage: capabilityFailure.errorMessage,
          failedAction: capabilityFailure.failedAction,
          targetSymbolResolution:
            capabilityFailure.targetSymbolResolution,
          targetSymbolInference:
            capabilityFailure.targetSymbolInference,
          pendingRepairTask: null,
          cycles,
          ranAt: new Date().toISOString()
        };
      }

      const repairTask = buildRepairTask({
        failure: capabilityFailure,
        previousTask: discoveredTask,
        cycleIndex: i
      });

      cycles[cycles.length - 1].repairTask = repairTask;
      pendingRepairTask = repairTask;

      if (i < maxCycles - 1) {
        continue;
      }

      return {
        mode: "autonomous-development-manager-runtime",
        version: "ash-local-runtime-v0.2-repair-carryover",
        success: false,
        stopped: true,
        stopReason: "max_cycles_reached_with_pending_repair",
        failureStage: capabilityFailure?.failureStage || null,
        errorMessage: capabilityFailure?.errorMessage || null,
        failedAction: capabilityFailure?.failedAction || null,
        pendingRepairTask: repairTask,
        cycles,
        ranAt: new Date().toISOString()
      };
    }

    const developmentStep =
      [...(capabilityLoop?.steps || [])]
        .reverse()
        .find(
          (step) =>
            step?.action ===
            "development_pipeline"
        ) || null;

    const pipelineResult =
      developmentStep
        ?.dispatchResult
        ?.result
        ?.result ||
      null;

    const completedByRealApply =
      discoveredTask?.reportOnly !== true &&
      dryRun !== true &&
      capabilityLoop.success === true &&
      coreCheck.success === true &&
      pipelineResult?.success === true &&
      pipelineResult?.dryRun === false &&
      pipelineResult?.effectiveDryRun === false &&
      pipelineResult
        ?.patchApplyEngine
        ?.success === true &&
      pipelineResult
        ?.patchApplyEngine
        ?.applied === true;

    if (
      discoveredTask?.reportOnly === true ||
      completedByRealApply
    ) {
      completedTasks.push(
        discoveredTask
      );
    }

    if (completedByRealApply) {
      const completionPersistence =
        writeAutonomousCompletedTask({
          task:
            discoveredTask,
          projectPath:
            context.projectPath ||
            process.cwd()
        });

      if (
        completionPersistence?.saved !==
        true
      ) {
        throw new Error(
          completionPersistence?.reason ||
          "Autonomous completion state was not persisted."
        );
      }
    }
  }

  return {
    mode: "autonomous-development-manager-runtime",
    version: "ash-local-runtime-v0.1",
    success: true,
    stopped: true,
    stopReason: "max_cycles_reached",
    cycles,
    ranAt: new Date().toISOString()
  };
}

module.exports = {
  runAutonomousDevelopmentManager,
  runExistingRepairVerification,
  extractCapabilityFailure,
  buildRepairTask
};
