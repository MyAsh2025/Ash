"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  runAutonomousDevelopmentManager,
  runExistingRepairVerification
} = require("./ash/runtime/autonomous-development-manager");
const { classifyIntent } = require("./ash/runtime/intent-runtime");
const { routeCommand } = require("./ash/runtime/command-router");
const { executeCommandRoute } = require("./ash/runtime/command-route-executor");
const { buildBootstrapContext } = require("./ash/runtime/bootstrap-runtime");
const {
  resolveImplementationProviderFromContext
} = require("./ash/runtime/implementation-provider-registry");
const {
  recordAutonomousDevelopmentResult,
  recordFormalCompletionEvidence
} = require("./ash/runtime/runtime-state");
const {
  acquireRepositoryLock,
  releaseRepositoryLock,
  resolveRepositoryLockPath
} = require("./ash-controller");

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

const maxCycles = Number(getArg("--cycles", "1"));
const requestedTask = getArg("--task", "run fully autonomous Ash development");
const dryRun = process.argv.includes("--dry-run");
const allowApply = process.argv.includes("--apply");
const verifyExistingRepair =
  process.argv.includes("--verify-existing-repair");
const controllerRunId = getArg("--run-id");
let applyLock = null;

function writeAutonomousRunLog(result) {
  const logDir = path.join(process.cwd(), "ash", "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(
    logDir,
    `ash-auto-dev-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.writeFileSync(logPath, JSON.stringify(result, null, 2), "utf8");
  return logPath;
}

function acquireApplyLock({ projectPath = process.cwd() } = {}) {
  if (!allowApply) {
    return { success: true, required: false, reason: "apply_lock_not_required", lock: null };
  }

  const lockPath = resolveRepositoryLockPath(projectPath);
  const lock = acquireRepositoryLock({
    lockPath,
    ownerKind: "ash-auto-dev-apply",
    inheritedOwnerToken: process.env.ASH_AUTONOMOUS_LOCK_TOKEN || null
  });
  if (!lock.success) {
    return { success: false, required: true, reason: lock.reason, lockPath, lock };
  }

  let statusShort;
  try {
    statusShort = execFileSync("git", ["status", "--short"], {
      cwd: projectPath,
      encoding: "utf8"
    });
  } catch (error) {
    if (!lock.inherited) {
      releaseRepositoryLock({ lockPath, ownerToken: lock.record.ownerToken });
    }
    return {
      success: false,
      required: true,
      reason: "repository_status_unavailable",
      errorMessage: error?.message || "Unable to inspect repository state.",
      lockPath,
      lock
    };
  }

  if (statusShort.trim().length > 0) {
    if (!lock.inherited) {
      releaseRepositoryLock({ lockPath, ownerToken: lock.record.ownerToken });
    }
    return {
      success: false,
      required: true,
      reason: "dirty_repository",
      statusShort,
      lockPath,
      lock
    };
  }

  return { success: true, required: true, reason: lock.reason, lockPath, lock };
}

function releaseApplyLock() {
  if (applyLock?.success && applyLock.lock?.inherited !== true) {
    releaseRepositoryLock({
      lockPath: applyLock.lockPath,
      ownerToken: applyLock.lock.record.ownerToken
    });
  }
  applyLock = null;
}

process.once("exit", releaseApplyLock);

if (verifyExistingRepair) {
  const targetFile = getArg("--target-file");
  const targetSymbol = getArg("--target-symbol");
  const coverageKind = getArg("--coverage-kind");
  const regressionId = getArg("--regression-id");
  const resolutionRequest = getArg("--resolve-evidence-signature")
    ? {
        evidenceSignature: getArg("--resolve-evidence-signature"),
        failureStage: getArg("--resolve-failure-stage"),
        failedCheckId: getArg("--resolve-failed-check-id"),
        rootCauseTargetFile: getArg("--root-cause-target-file"),
        rootCauseTargetSymbol: getArg("--root-cause-target-symbol"),
        repairRegressionId: regressionId,
        verificationSet: "canonical-corecheck"
      }
    : null;
  const verification = runExistingRepairVerification({
    projectPath: process.cwd(),
    targetFile,
    targetSymbol,
    coverageKind,
    regressionId
  });

  let formalCompletion = null;
  if (verification.success === true) {
    formalCompletion = recordFormalCompletionEvidence({
      projectPath: process.cwd(),
      targetFile,
      targetSymbol,
      completedAt: verification.ranAt,
      resolution: resolutionRequest,
      coreCheck: verification.coreCheck,
      completionEvidence: verification.completionEvidence
    });
  }
  const resolutionSuccess = !resolutionRequest || formalCompletion?.resolutionRecorded === true;
  const routeSuccess = verification.success === true && resolutionSuccess;

  console.log(JSON.stringify({
    mode: "ash-auto-dev-runner",
    route: "existing-repair-verification",
    success: routeSuccess,
    completionKind: verification.completionKind,
    completionEligible: verification.completionEligible,
    completionSuccess: verification.completionSuccess,
    executionSuccess: verification.executionSuccess ?? false,
    pipelineSuccess: verification.verificationSuccess ?? false,
    effectiveDryRun: verification.effectiveDryRun,
    applied: verification.applied,
    coreCheck: verification.coreCheck?.success ?? false,
    targetFile,
    targetSymbol,
    coverageKind,
    regressionId,
    eligibility: verification.eligibility,
    completionEvidence: verification.completionEvidence || null,
    resolutionRequested: Boolean(resolutionRequest),
    resolutionRecorded: formalCompletion?.resolutionRecorded === true,
    resolutionRecord: formalCompletion?.resolutionRecord || null,
    reason: resolutionSuccess
      ? verification.reason
      : "Existing repair verification succeeded, but the requested runtime evidence resolution was not verified.",
    ranAt: verification.ranAt
  }, null, 2));

  process.exit(routeSuccess ? 0 : 1);
}

const intentResult = classifyIntent(requestedTask);
const commandRoute = routeCommand(intentResult);

const commandRouteExecution = executeCommandRoute({
  requestedTask,
  intentResult,
  commandRoute
});

if (commandRouteExecution.handled) {
  console.log(JSON.stringify(commandRouteExecution.output, null, 2));
  process.exit(commandRouteExecution.exitCode);
}

if (intentResult.intent === "git") {
  const statusShort = execFileSync("git", ["status", "--short"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  const latestCommit = execFileSync("git", ["log", "-1", "--oneline"], {
    cwd: process.cwd(),
    encoding: "utf8"
  }).trim();

  console.log(JSON.stringify({
    mode: "ash-auto-dev-runner",
    route: "git-only",
    commandRoute,
    success: true,
    requestedTask,
    intent: intentResult.intent,
    patchAllowed: false,
    applied: false,
    git: {
      clean: statusShort.trim().length === 0,
      latestCommit,
      statusShort
    },
    note: "Git route completed without patch planning.",
    ranAt: new Date().toISOString()
  }, null, 2));

  process.exit(0);
}

if (intentResult.intent === "corecheck") {
  const { runCoreCheck } = require("./ash/runtime/corecheck-runtime");

  const coreCheck = runCoreCheck({
    files: [
      "./ash-auto-dev.js",
      "./ash/runtime/intent-runtime.js",
      "./ash/runtime/autonomous-development-manager.js",
      "./ash/runtime/development-pipeline-runtime.js",
      "./ash/runtime/capability-loop.js",
      "./ash/capabilities/development-pipeline.js"
    ]
  });

  console.log(JSON.stringify({
    mode: "ash-auto-dev-runner",
    route: commandRoute.route,
    commandRoute,
    success: coreCheck.success,
    requestedTask,
    intent: intentResult.intent,
    patchAllowed: false,
    applied: false,
    coreCheck,
    note: "CoreCheck route completed without patch planning.",
    ranAt: new Date().toISOString()
  }, null, 2));

  process.exit(coreCheck.success ? 0 : 1);
}

if (intentResult.reportOnly && !/repository inventory only/i.test(requestedTask)) {
  console.log(JSON.stringify({
    mode: "ash-auto-dev-runner",
    route: commandRoute.route,
    commandRoute,
    success: true,
    requestedTask,
    intent: intentResult.intent,
    patchAllowed: false,
    applied: false,
    reportOnly: true,
    note: "Intent Runtime stopped before patch planning.",
    ranAt: new Date().toISOString()
  }, null, 2));
  process.exit(0);
}

function classifyRepositoryEntry(line) {
  const file = line.slice(3).trim();
  const status = line.slice(0, 2).trim();

  let classification = "necessary";
  let recommendation = "KEEP";

  if (
    file.includes(".backup") ||
    file.includes(".broken") ||
    file.includes(".sandbox") ||
    file.endsWith(".diff.txt")
  ) {
    classification = "temporary";
    recommendation = "ARCHIVE";
  } else if (
    file.includes("handover-") ||
    file.includes("save-drafts") ||
    file.includes("runtime-state")
  ) {
    classification = "temporary";
    recommendation = "REVIEW";
  } else if (
    file.includes("ash-ui-server.js") ||
    file.includes("ash-window.ps1") ||
    file.includes("repository-manager.js") ||
    file.includes("agent-selector.js") ||
    file.includes("code-generator.js") ||
    file.includes("patch-apply-engine.js") ||
    file.includes("patch-planner.js") ||
    file.includes("task-runtime.js")
  ) {
    classification = "self-evolution";
    recommendation = "REVIEW_FOR_COMMIT";
  }

  return {
    status,
    file,
    classification,
    recommendation
  };
}

if (/repository inventory only/i.test(requestedTask)) {
  const statusShort = execFileSync("git", ["status", "--short"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  const entries = statusShort
    .split(/\r?\n/)
    .filter(Boolean)
    .map(classifyRepositoryEntry);

  const report = {
    mode: "ash-auto-dev-runner",
    route: "repository-inventory-only",
    success: true,
    requestedTask,
    modifiedOrUntrackedCount: entries.length,
    entries,
    note: "Inventory route completed without patch planning or file modification.",
    ranAt: new Date().toISOString()
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

applyLock = acquireApplyLock({ projectPath: process.cwd() });
if (!applyLock.success) {
  const blockedResult = {
    mode: "ash-auto-dev-runner",
    success: false,
    stopReason: applyLock.reason,
    failureStage: "apply-startup-gate",
    errorMessage: `Autonomous apply blocked: ${applyLock.reason}.`,
    requestedTask,
    controllerRunId: controllerRunId || null,
    applied: false,
    startupBlock: {
      reason: applyLock.reason,
      statusShort: applyLock.statusShort || null,
      conflictingLock: applyLock.lock?.record || null
    },
    ranAt: new Date().toISOString()
  };
  const logPath = writeAutonomousRunLog(blockedResult);
  console.error(JSON.stringify({ ...blockedResult, logPath }, null, 2));
  process.exit(1);
}

const bootstrap = buildBootstrapContext({
  task: requestedTask,
  projectContext: {
    projectPath: process.cwd()
  },
  repository: {},
  dryRun: dryRun || !allowApply
});

const implementationProviderRegistry =
  resolveImplementationProviderFromContext({
    context: {
      projectPath: process.cwd(),
      implementationProviderName:
        process.env.ASH_IMPLEMENTATION_PROVIDER ||
        "command",
      implementationProviderCommand:
        process.env
          .ASH_IMPLEMENTATION_PROVIDER_COMMAND ||
        "node",
      implementationProviderArgs:
        process.env
          .ASH_IMPLEMENTATION_PROVIDER_ARGS_JSON ||
        [
          "./ash/providers/openai-implementation-provider.mjs"
        ],
      implementationProviderTimeoutMs:
        process.env
          .ASH_IMPLEMENTATION_PROVIDER_TIMEOUT_MS ||
        180000
    }
  });

if (implementationProviderRegistry.success !== true) {
  const providerResolutionFailure = {
    mode: "ash-auto-dev-provider-resolution",
    success: false,
    stopReason: "implementation_provider_unavailable",
    failureStage: "implementation-provider-resolution",
    providerName:
      implementationProviderRegistry.providerName,
    errorMessage:
      implementationProviderRegistry.reason,
    controllerRunId: controllerRunId || null,
    applied: false,
    ranAt: new Date().toISOString()
  };
  const logPath = writeAutonomousRunLog(providerResolutionFailure);
  releaseApplyLock();
  console.error(JSON.stringify({ ...providerResolutionFailure, logPath }, null, 2));

  process.exit(1);
}

const result = runAutonomousDevelopmentManager({
  task: requestedTask,
  context: {
    projectPath: process.cwd(),
    dryRun: dryRun || !allowApply,
    bootstrap,
    implementationProvider:
      implementationProviderRegistry.provider ||
      null,
    implementationProviderName:
      implementationProviderRegistry.providerName ||
      null
  },
  maxCycles,
  dryRun: dryRun || !allowApply
});

result.controllerRunId = controllerRunId || null;

recordAutonomousDevelopmentResult({
  projectPath: process.cwd(),
  result
});

const logPath = writeAutonomousRunLog(result);
releaseApplyLock();

const finalCycle =
  Array.isArray(result.cycles) &&
  result.cycles.length > 0
    ? result.cycles[result.cycles.length - 1]
    : null;

const finalPipelineCycle =
  Array.isArray(result.cycles)
    ? [...result.cycles]
        .reverse()
        .find(
          (cycle) =>
            cycle?.capabilityLoop?.steps?.some(
              (step) =>
                step.action ===
                "development_pipeline"
            )
        ) || null
    : null;

const pipelineStep =
  finalPipelineCycle
    ?.capabilityLoop
    ?.steps
    ?.find(
      (step) =>
        step.action ===
        "development_pipeline"
    );

const pipeline =
  pipelineStep
    ?.dispatchResult
    ?.result
    ?.result || null;

console.log(JSON.stringify({
  mode: "ash-auto-dev-runner",
  success: result.success,
  stopReason: result.stopReason,
  failureStage: result.failureStage || null,
  errorMessage: result.errorMessage || null,
  failedAction: result.failedAction || null,
  cycles: result.cycles?.length || 0,
  requestedTask,
  selectedTask:
    finalCycle?.selectedTask || null,
  capabilityLoop:
    finalCycle?.capabilityLoop?.success ?? null,
  pipelineSuccess:
    pipeline?.success ?? null,
  applyMode:
    pipeline?.applyMode || null,
  effectiveDryRun:
    pipeline?.effectiveDryRun,
  applied:
    pipeline?.patchApplyEngine?.applied || false,
  coreCheck:
    finalCycle?.coreCheck?.success ?? null,
  checkpointRecommended:
    finalCycle?.coreCheck
      ?.checkpointRecommended || false,
  logPath
}, null, 2));

if (!result.success) {
  process.exit(1);
}

module.exports = {
  acquireApplyLock
};
