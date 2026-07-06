const path = require("path");
const { spawnSync } = require("child_process");
const { resolveProject } = require("./project-context");
const { runAction } = require("../actions/action-runtime");
const { resolveDependencies } = require("./dependency-resolver");
const { applyFailurePolicy } = require("./failure-policy");
const { evaluateRules } = require("./rule-evaluator");
const { runCoreCheck, runGitDiffCheck } = require("./corecheck-runtime");
const { executeRegisteredAction, resolveExecutor } = require("./executor-registry");

function resolveExecutionContext(plan = {}, context = {}) {
  const task =
    context.task ||
    plan.task ||
    plan.intent ||
    plan.name ||
    "ash executor runtime";

  const projectContext =
    context.projectContext ||
    plan.projectContext ||
    resolveProject(task);

  const project = projectContext.project || {};
  const projectPath = project.path || process.cwd();

  return {
    ...context,
    task,
    projectContext,
    project,
    projectPath
  };
}

function resolveScriptPath(step, executionContext) {
  const projectPath = executionContext.projectPath || process.cwd();
  const script = step.script || "";

  if (path.isAbsolute(script)) {
    return script;
  }

  return path.join(projectPath, script);
}

function runPowerShellStep(step, executionContext) {
  const scriptPath = resolveScriptPath(step, executionContext);
  const cwd = step.cwd || executionContext.projectPath || process.cwd();

  const command = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    ...(step.args || []),
  ];

  const result = spawnSync("powershell", command, {
    cwd,
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error(`Step failed: ${step.name || scriptPath}`);
  }

  return {
    step: step.name || scriptPath,
    type: "powershell",
    cwd,
    script: scriptPath,
    status: result.status,
    success: true,
    executedAt: new Date().toISOString()
  };
}

function runActionStep(step, executionContext) {
  const actionName = step.action || step.name;

  if (!actionName) {
    throw new Error("Action step is missing action/name.");
  }

  const actionContext = {
    ...executionContext,
    task: executionContext.task
  };

  const result = resolveExecutor(actionName)
    ? executeRegisteredAction({ ...step, action: actionName }, actionContext)
    : runAction(actionName, actionContext);

  if (!result.success) {
    throw new Error(`Action failed: ${actionName}`);
  }

  return {
    ...result,
    originalAction: actionName,
    stepId: step.stepId || null,
    taskId: step.taskId || null,
    manager: step.manager || null,
    phase: step.phase || null,
    priority: step.priority ?? null,
    required: Boolean(step.required),
    dependencies: step.dependencies || []
  };
}

function normalizeSteps(plan = {}) {
  if (Array.isArray(plan.steps)) {
    return plan.steps;
  }

  if (Array.isArray(plan.executionPlan?.steps)) {
    return plan.executionPlan.steps.map((step) => ({
      type: "action",
      ...step
    }));
  }

  return [];
}

function getStepActionName(step = {}) {
  return String(step.action || step.name || step.type || "").toLowerCase();
}

function classifyCoreRuleRequirement(step = {}, executionRules = {}) {
  const actionName = getStepActionName(step);
  const requiredRules = [];

  if (
    actionName.includes("patch") ||
    actionName.includes("edit") ||
    actionName.includes("apply") ||
    actionName === "development_pipeline"
  ) {
    requiredRules.push("coreCheckBeforePatch");
  }

  if (
    actionName.includes("git") ||
    actionName.includes("commit") ||
    actionName.includes("push")
  ) {
    requiredRules.push("coreCheckBeforeGit");
  }

  if (
    actionName.includes("checkpoint") ||
    actionName.includes("save")
  ) {
    requiredRules.push("coreCheckBeforeCheckpoint");
  }

  if (
    actionName.includes("handover") ||
    actionName.includes("finalization")
  ) {
    requiredRules.push("coreCheckBeforeHandover");
  }

  return requiredRules.filter((ruleName) => executionRules[ruleName]);
}

function buildCoreRuleGate(steps = [], executionRules = {}) {
  const guardedActions = steps
    .map((step) => {
      const requiredRules = classifyCoreRuleRequirement(step, executionRules);

      return {
        stepId: step.stepId || null,
        action: step.action || step.name || step.type || null,
        requiredRules
      };
    })
    .filter((entry) => entry.requiredRules.length > 0);

  const missingPreconditions = guardedActions.map((entry) => ({
    ...entry,
    status: "diagnostic-only",
    enforced: false,
    missing: entry.requiredRules
  }));

  return {
    mode: "executor-core-rule-gate",
    version: "executor-core-rule-gate-v0.1-diagnostic",
    diagnosticOnly: true,
    enforced: false,
    guardedActions,
    missingPreconditions
  };
}
function resolveCorePreconditions(context = {}) {
  const explicitPreconditions = context.corePreconditions || {};
  const coreCheckResult = context.coreCheckResult || context.coreCheck || null;
  const gitDiffCheckResult =
    context.gitDiffCheckResult ||
    context.gitDiffCheck ||
    coreCheckResult?.gitDiffCheck ||
    null;
  const checkpointResult = context.checkpointResult || context.checkpoint || null;
  const saveVerificationResult =
    context.saveVerificationResult ||
    context.saveVerification ||
    null;
  const handoverResult = context.handoverResult || context.handover || null;

  return {
    coreCheckCompleted:
      explicitPreconditions.coreCheckCompleted === true ||
      coreCheckResult?.success === true,
    gitClean:
      explicitPreconditions.gitClean ??
      coreCheckResult?.repositoryClean ??
      gitDiffCheckResult?.clean ??
      "unknown",
    checkpointExists:
      explicitPreconditions.checkpointExists ??
      checkpointResult?.success ??
      checkpointResult?.checkpointExists ??
      saveVerificationResult?.verification?.checkpointAttempted ??
      "unknown",
    ashCoreSavePrepared:
      explicitPreconditions.ashCoreSavePrepared === true ||
      saveVerificationResult?.verification?.ashCoreSavePrepared === true,
    memorySavePrepared:
      explicitPreconditions.memorySavePrepared === true ||
      saveVerificationResult?.verification?.memorySavePrepared === true,
    handoverPrepared:
      explicitPreconditions.handoverPrepared === true ||
      handoverResult?.prepared === true ||
      saveVerificationResult?.verification?.handoverPrepared === true
  };
}

function resolveRulePrecondition(ruleName, corePreconditions = {}) {
  const ruleMap = {
    coreCheckBeforePatch: [
      {
        precondition: "coreCheckCompleted",
        satisfied: corePreconditions.coreCheckCompleted === true
      }
    ],
    coreCheckBeforeGit: [
      {
        precondition: "coreCheckCompleted",
        satisfied: corePreconditions.coreCheckCompleted === true
      },
      {
        precondition: "gitClean",
        satisfied: corePreconditions.gitClean === true
      }
    ],
    coreCheckBeforeCheckpoint: [
      {
        precondition: "coreCheckCompleted",
        satisfied: corePreconditions.coreCheckCompleted === true
      },
      {
        precondition: "checkpointExists",
        satisfied: corePreconditions.checkpointExists === true
      }
    ],
    coreCheckBeforeHandover: [
      {
        precondition: "coreCheckCompleted",
        satisfied: corePreconditions.coreCheckCompleted === true
      },
      {
        precondition: "ashCoreSavePrepared",
        satisfied: corePreconditions.ashCoreSavePrepared === true
      },
      {
        precondition: "memorySavePrepared",
        satisfied: corePreconditions.memorySavePrepared === true
      },
      {
        precondition: "handoverPrepared",
        satisfied: corePreconditions.handoverPrepared === true
      }
    ]
  };

  return ruleMap[ruleName] || [
    {
      precondition: "unknown",
      satisfied: false
    }
  ];
}

function attachPreconditionDiagnostics(coreRuleGate = {}, corePreconditions = {}) {
  const diagnostics = (coreRuleGate.guardedActions || []).map((entry) => {
    const checks = entry.requiredRules.flatMap((ruleName) =>
      resolveRulePrecondition(ruleName, corePreconditions).map((check) => ({
        ruleName,
        ...check
      }))
    );

    return {
      ...entry,
      status: checks.every((check) => check.satisfied)
        ? "preconditions-satisfied"
        : "preconditions-missing",
      diagnosticOnly: true,
      enforced: false,
      checks,
      missing: checks
        .filter((check) => !check.satisfied)
        .map((check) => check.precondition)
    };
  });

  return {
    mode: "executor-precondition-resolver",
    version: "executor-precondition-resolver-v0.1-diagnostic",
    diagnosticOnly: true,
    enforced: false,
    diagnostics
  };
}
function resolveEnforcementPolicy(context = {}) {
  return {
    mode: "executor-enforcement-policy",
    version: "executor-enforcement-policy-v0.1-guarded",
    enforceCoreRuleGate: context.enforceCoreRuleGate === true,
    diagnosticOnly: context.enforceCoreRuleGate !== true
  };
}

function findStepPreconditionDiagnostic(step = {}, preconditionDiagnostics = {}) {
  const action = step.action || step.name || step.type || null;
  const stepId = step.stepId || null;

  return (preconditionDiagnostics.diagnostics || []).find((diagnostic) => {
    if (stepId && diagnostic.stepId === stepId) {
      return true;
    }

    return action && diagnostic.action === action;
  }) || null;
}

function shouldBlockStepForPreconditions(
  step = {},
  preconditionDiagnostics = {},
  enforcementPolicy = {}
) {
  const diagnostic = findStepPreconditionDiagnostic(step, preconditionDiagnostics);
  const shouldBlock =
    enforcementPolicy.enforceCoreRuleGate === true &&
    diagnostic?.status === "preconditions-missing";

  return {
    mode: "executor-enforcement-decision",
    version: "executor-enforcement-decision-v0.1-guarded",
    action: step.action || step.name || step.type || null,
    stepId: step.stepId || null,
    enforced: enforcementPolicy.enforceCoreRuleGate === true,
    shouldBlock,
    diagnostic
  };
}
function shouldAttemptAutoCoreCheck(enforcementDecision = {}, context = {}) {
  return (
    context.autoCoreCheck === true &&
    enforcementDecision.shouldBlock === true &&
    (enforcementDecision.diagnostic?.missing || []).includes("coreCheckCompleted")
  );
}

function runAutoCoreCheck(context = {}) {
  const coreCheckResult = runCoreCheck({
    developmentPipeline: context.developmentPipeline || null,
    files: context.coreCheckFiles || []
  });

  return {
    mode: "executor-auto-corecheck",
    version: "executor-auto-corecheck-v0.1-guarded",
    attempted: true,
    success: coreCheckResult.success === true,
    coreCheckResult,
    checkedAt: new Date().toISOString()
  };
}

function rebuildPreconditionStateAfterCoreCheck(
  context = {},
  coreRuleGate = {},
  autoCoreCheckResult = null
) {
  const nextContext = {
    ...context,
    coreCheckResult: autoCoreCheckResult?.coreCheckResult || context.coreCheckResult || null
  };

  const corePreconditions = resolveCorePreconditions(nextContext);
  const preconditionDiagnostics = attachPreconditionDiagnostics(
    coreRuleGate,
    corePreconditions
  );

  return {
    corePreconditions,
    preconditionDiagnostics
  };
}
function shouldAttemptAutoGitCheck(enforcementDecision = {}, context = {}) {
  return (
    context.autoGitCheck === true &&
    enforcementDecision.shouldBlock === true &&
    (enforcementDecision.diagnostic?.missing || []).includes("gitClean")
  );
}

function runAutoGitCheck() {
  const gitDiffCheckResult = runGitDiffCheck();

  return {
    mode: "executor-auto-git-check",
    version: "executor-auto-git-check-v0.1-guarded",
    attempted: true,
    success: gitDiffCheckResult.success === true,
    gitDiffCheckResult,
    checkedAt: new Date().toISOString()
  };
}

function rebuildPreconditionStateAfterGitCheck(
  context = {},
  coreRuleGate = {},
  autoGitCheckResult = null
) {
  const nextContext = {
    ...context,
    gitDiffCheckResult:
      autoGitCheckResult?.gitDiffCheckResult ||
      context.gitDiffCheckResult ||
      null
  };

  const corePreconditions = resolveCorePreconditions(nextContext);
  const preconditionDiagnostics = attachPreconditionDiagnostics(
    coreRuleGate,
    corePreconditions
  );

  return {
    corePreconditions,
    preconditionDiagnostics
  };
}
function shouldAttemptAutoCheckpoint(enforcementDecision = {}, context = {}) {
  return (
    context.autoCheckpoint === true &&
    enforcementDecision.shouldBlock === true &&
    (enforcementDecision.diagnostic?.missing || []).includes("checkpointExists") &&
    Boolean(context.commitMessage || context.checkpoint?.commitMessage) &&
    Boolean(context.expectedAuditKey || context.checkpoint?.expectedAuditKey)
  );
}

function runAutoCheckpoint(context = {}) {
  const checkpointResult = runAction("run_checkpoint_when_needed", context);

  return {
    mode: "executor-auto-checkpoint",
    version: "executor-auto-checkpoint-v0.1-guarded",
    attempted: true,
    success: checkpointResult.success === true && checkpointResult.skipped !== true,
    checkpointResult,
    checkedAt: new Date().toISOString()
  };
}

function rebuildPreconditionStateAfterCheckpoint(
  context = {},
  coreRuleGate = {},
  autoCheckpointResult = null
) {
  const nextContext = {
    ...context,
    checkpointResult:
      autoCheckpointResult?.success === true
        ? {
            success: true,
            checkpointExists: true,
            result: autoCheckpointResult.checkpointResult
          }
        : autoCheckpointResult?.checkpointResult || context.checkpointResult || null
  };

  const corePreconditions = resolveCorePreconditions(nextContext);
  const preconditionDiagnostics = attachPreconditionDiagnostics(
    coreRuleGate,
    corePreconditions
  );

  return {
    corePreconditions,
    preconditionDiagnostics
  };
}
function shouldAttemptAutoAshCoreSave(enforcementDecision = {}, context = {}) {
  return (
    context.autoAshCoreSave === true &&
    enforcementDecision.shouldBlock === true &&
    (enforcementDecision.diagnostic?.missing || []).includes("ashCoreSavePrepared")
  );
}

function runAutoAshCoreSave(context = {}) {
  const ashCoreSaveResult = executeRegisteredAction(
    { action: "prepare_ash_core_save" },
    context
  );

  return {
    mode: "executor-auto-ash-core-save",
    version: "executor-auto-ash-core-save-v0.1-guarded",
    attempted: true,
    success: ashCoreSaveResult.success === true && ashCoreSaveResult.prepared === true,
    ashCoreSaveResult,
    checkedAt: new Date().toISOString()
  };
}

function rebuildPreconditionStateAfterAshCoreSave(
  context = {},
  coreRuleGate = {},
  autoAshCoreSaveResult = null
) {
  const nextContext = {
    ...context,
    corePreconditions: {
      ...(context.corePreconditions || {}),
      ashCoreSavePrepared:
        autoAshCoreSaveResult?.success === true ||
        context.corePreconditions?.ashCoreSavePrepared === true
    }
  };

  const corePreconditions = resolveCorePreconditions(nextContext);
  const preconditionDiagnostics = attachPreconditionDiagnostics(
    coreRuleGate,
    corePreconditions
  );

  return {
    corePreconditions,
    preconditionDiagnostics
  };
}
function shouldAttemptAutoMemorySave(enforcementDecision = {}, context = {}) {
  return (
    context.autoMemorySave === true &&
    enforcementDecision.shouldBlock === true &&
    (enforcementDecision.diagnostic?.missing || []).includes("memorySavePrepared")
  );
}

function runAutoMemorySave(context = {}) {
  const memorySaveResult = executeRegisteredAction(
    { action: "prepare_memory_save" },
    context
  );

  return {
    mode: "executor-auto-memory-save",
    version: "executor-auto-memory-save-v0.1-guarded",
    attempted: true,
    success: memorySaveResult.success === true && memorySaveResult.prepared === true,
    memorySaveResult,
    checkedAt: new Date().toISOString()
  };
}

function rebuildPreconditionStateAfterMemorySave(
  context = {},
  coreRuleGate = {},
  autoMemorySaveResult = null
) {
  const nextContext = {
    ...context,
    corePreconditions: {
      ...(context.corePreconditions || {}),
      memorySavePrepared:
        autoMemorySaveResult?.success === true ||
        context.corePreconditions?.memorySavePrepared === true
    }
  };

  const corePreconditions = resolveCorePreconditions(nextContext);
  const preconditionDiagnostics = attachPreconditionDiagnostics(
    coreRuleGate,
    corePreconditions
  );

  return {
    corePreconditions,
    preconditionDiagnostics
  };
}

function shouldAttemptAutoHandover(enforcementDecision = {}, context = {}) {
  return (
    context.autoHandover === true &&
    enforcementDecision.shouldBlock === true &&
    (enforcementDecision.diagnostic?.missing || []).includes("handoverPrepared")
  );
}

function runAutoHandover(context = {}) {
  const handoverResult = executeRegisteredAction(
    { action: "prepare_handover" },
    context
  );

  return {
    mode: "executor-auto-handover",
    version: "executor-auto-handover-v0.1-guarded",
    success: handoverResult?.success === true,
    action: "prepare_handover",
    handoverResult
  };
}

function rebuildPreconditionStateAfterHandover(
  context = {},
  coreRuleGate = {},
  autoHandoverResult = null
) {
  const nextContext = {
    ...context,
    corePreconditions: {
      ...(context.corePreconditions || {}),
      handoverPrepared:
        autoHandoverResult?.success === true ||
        context.corePreconditions?.handoverPrepared === true
    },
    handoverResult: {
      ...(context.handoverResult || {}),
      prepared:
        autoHandoverResult?.success === true ||
        context.handoverResult?.prepared === true
    },
    saveVerificationResult: {
      ...(context.saveVerificationResult || {}),
      verification: {
        ...(context.saveVerificationResult?.verification || {}),
        handoverPrepared:
          autoHandoverResult?.success === true ||
          context.saveVerificationResult?.verification?.handoverPrepared === true
      }
    }
  };

  const corePreconditions = resolveCorePreconditions(nextContext);
  const preconditionDiagnostics = attachPreconditionDiagnostics(
    coreRuleGate,
    corePreconditions
  );

  return {
    context: nextContext,
    corePreconditions,
    preconditionDiagnostics
  };
}

function executePlan(plan, context = {}) {
  const ruleEvaluation = evaluateRules({ bootstrap: context.bootstrap || null });
  const executionRules = ruleEvaluation.execution || {};
  const planningRules = ruleEvaluation.planning || {};
  const executionContext = resolveExecutionContext(plan, context);
  const normalizedSteps = normalizeSteps(plan);
  const coreRuleGate = buildCoreRuleGate(normalizedSteps, executionRules);
  let corePreconditions = resolveCorePreconditions(context);
  let preconditionDiagnostics = attachPreconditionDiagnostics(
    coreRuleGate,
    corePreconditions
  );
  const enforcementPolicy = resolveEnforcementPolicy(context);
  let dependencyResolution = resolveDependencies(
    { steps: normalizedSteps },
    context.executionResults || []
  );
  const steps = dependencyResolution.readySteps;

  console.log("== Ash Executor Runtime ==");
  console.log(`Project: ${executionContext.project.id || "unknown"}`);
  console.log(`Project path: ${executionContext.projectPath}`);
  console.log(`Plan steps: ${normalizedSteps.length}`);
  console.log(`Ready steps: ${steps.length}`);
  console.log(`Blocked steps: ${dependencyResolution.blockedSteps.length}`);

  const results = [...(context.executionResults || [])];
  const executedStepIds = new Set(results.map((result) => result.stepId).filter(Boolean));
  const loopHistory = [];
  const failureDecisions = [];
  const enforcementDecisions = [];
  const autoCoreCheckResults = [];
  const autoGitCheckResults = [];
  const autoCheckpointResults = [];
  const autoAshCoreSaveResults = [];
  const autoMemorySaveResults = [];
  const autoHandoverResults = [];
  let stoppedByFailure = false;
  let iteration = 0;

  while (true) {
    iteration += 1;

    const currentResolution = resolveDependencies(
      { steps: normalizedSteps.filter((step) => !executedStepIds.has(step.stepId)) },
      results
    );

    const readySteps = currentResolution.readySteps.filter(
      (step) => !executedStepIds.has(step.stepId)
    );

    loopHistory.push({
      iteration,
      ready: readySteps.map((step) => step.action),
      blocked: currentResolution.blockedSteps.map((step) => step.action),
      completed: results
        .filter((result) => result.success)
        .map((result) => result.originalAction || result.action),
      evaluatedAt: new Date().toISOString()
    });

    if (readySteps.length === 0) {
      dependencyResolution = currentResolution;
      break;
    }

    for (const step of readySteps) {
      console.log(`== Execute: ${step.name || step.action || step.type} ==`);

      let enforcementDecision = shouldBlockStepForPreconditions(
        step,
        preconditionDiagnostics,
        enforcementPolicy
      );

      if (shouldAttemptAutoCoreCheck(enforcementDecision, context)) {
        const autoCoreCheckResult = runAutoCoreCheck(context);
        autoCoreCheckResults.push(autoCoreCheckResult);

        const rebuiltPreconditionState = rebuildPreconditionStateAfterCoreCheck(
          context,
          coreRuleGate,
          autoCoreCheckResult
        );

        corePreconditions = rebuiltPreconditionState.corePreconditions;
        preconditionDiagnostics = rebuiltPreconditionState.preconditionDiagnostics;

        enforcementDecision = shouldBlockStepForPreconditions(
          step,
          preconditionDiagnostics,
          enforcementPolicy
        );
      }

      if (shouldAttemptAutoGitCheck(enforcementDecision, context)) {
        const autoGitCheckResult = runAutoGitCheck();
        autoGitCheckResults.push(autoGitCheckResult);

        const rebuiltPreconditionState = rebuildPreconditionStateAfterGitCheck(
          context,
          coreRuleGate,
          autoGitCheckResult
        );

        corePreconditions = rebuiltPreconditionState.corePreconditions;
        preconditionDiagnostics = rebuiltPreconditionState.preconditionDiagnostics;

        enforcementDecision = shouldBlockStepForPreconditions(
          step,
          preconditionDiagnostics,
          enforcementPolicy
        );
      }

      if (shouldAttemptAutoCheckpoint(enforcementDecision, context)) {
        const autoCheckpointResult = runAutoCheckpoint({
          ...executionContext,
          ...context
        });
        autoCheckpointResults.push(autoCheckpointResult);

        const rebuiltPreconditionState = rebuildPreconditionStateAfterCheckpoint(
          context,
          coreRuleGate,
          autoCheckpointResult
        );

        corePreconditions = rebuiltPreconditionState.corePreconditions;
        preconditionDiagnostics = rebuiltPreconditionState.preconditionDiagnostics;

        enforcementDecision = shouldBlockStepForPreconditions(
          step,
          preconditionDiagnostics,
          enforcementPolicy
        );
      }

      if (shouldAttemptAutoAshCoreSave(enforcementDecision, context)) {
        const autoAshCoreSaveResult = runAutoAshCoreSave({
          ...executionContext,
          ...context
        });
        autoAshCoreSaveResults.push(autoAshCoreSaveResult);

        const rebuiltPreconditionState = rebuildPreconditionStateAfterAshCoreSave(
          context,
          coreRuleGate,
          autoAshCoreSaveResult
        );

        corePreconditions = rebuiltPreconditionState.corePreconditions;
        preconditionDiagnostics = rebuiltPreconditionState.preconditionDiagnostics;

        enforcementDecision = shouldBlockStepForPreconditions(
          step,
          preconditionDiagnostics,
          enforcementPolicy
        );
      }

      if (shouldAttemptAutoMemorySave(enforcementDecision, context)) {
        const autoMemorySaveResult = runAutoMemorySave({
          ...executionContext,
          ...context
        });
        autoMemorySaveResults.push(autoMemorySaveResult);

        const rebuiltPreconditionState = rebuildPreconditionStateAfterMemorySave(
          context,
          coreRuleGate,
          autoMemorySaveResult
        );

        corePreconditions = rebuiltPreconditionState.corePreconditions;
        preconditionDiagnostics = rebuiltPreconditionState.preconditionDiagnostics;

        enforcementDecision = shouldBlockStepForPreconditions(
          step,
          preconditionDiagnostics,
          enforcementPolicy
        );
      }

      if (shouldAttemptAutoHandover(enforcementDecision, context)) {
        const autoHandoverResult = runAutoHandover({
          ...executionContext,
          ...context
        });
        autoHandoverResults.push(autoHandoverResult);

        const rebuiltPreconditionState = rebuildPreconditionStateAfterHandover(
          context,
          coreRuleGate,
          autoHandoverResult
        );

        context = rebuiltPreconditionState.context;
        corePreconditions = rebuiltPreconditionState.corePreconditions;
        preconditionDiagnostics = rebuiltPreconditionState.preconditionDiagnostics;

        enforcementDecision = shouldBlockStepForPreconditions(
          step,
          preconditionDiagnostics,
          enforcementPolicy
        );
      }

      enforcementDecisions.push(enforcementDecision);

      if (enforcementDecision.shouldBlock) {
        const blockedResult = {
          action: step.action || step.name || step.type || null,
          originalAction: step.action || step.name || step.type || null,
          stepId: step.stepId || null,
          success: false,
          blocked: true,
          reason: "Executor core rule gate blocked step because preconditions are missing.",
          enforcementDecision
        };

        results.push(blockedResult);
        stoppedByFailure = true;
        dependencyResolution = currentResolution;
        break;
      }

      let result = null;

      if (step.type === "powershell") {
        result = runPowerShellStep(step, executionContext);
      } else if (step.type === "action" || step.action) {
        result = runActionStep(step, executionContext);
      } else {
        throw new Error(`Unknown step type: ${step.type}`);
      }

      results.push(result);
      if (result.stepId) executedStepIds.add(result.stepId);

      const failureDecision = applyFailurePolicy({ result, step });
      failureDecisions.push(failureDecision);

      if (failureDecision.policy === "stop") {
        stoppedByFailure = true;
        dependencyResolution = currentResolution;
        break;
      }

      continue;
    }

    if (stoppedByFailure) {
      break;
    }

    if (iteration > normalizedSteps.length + 1) {
      throw new Error("Execution loop exceeded safe iteration limit.");
    }
  }

  console.log("== Ash Executor Runtime complete ==");

  return {
    mode: "executor-runtime",
    version: "ash-local-runtime-v0.7-failure-policy",
    success: !stoppedByFailure && dependencyResolution.blockedSteps.length === 0,
    stoppedByFailure,
    ruleEvaluatorAware: true,
    coreContextAware: ruleEvaluation.coreContextAware,
    executionRules,
    planningRules,
    coreRuleGate,
    guardedActions: coreRuleGate.guardedActions,
    missingPreconditions: coreRuleGate.missingPreconditions,
    corePreconditions,
    preconditionDiagnostics,
    enforcementPolicy,
    enforcementDecisions,
    autoCoreCheckResults,
    autoGitCheckResults,
    autoCheckpointResults,
    autoAshCoreSaveResults,
    autoMemorySaveResults,
    autoHandoverResults,
    task: executionContext.task,
    projectContext: executionContext.projectContext,
    dependencyResolution,
    loopHistory,
    failureDecisions,
    results,
    executedAt: new Date().toISOString()
  };
}

module.exports = {
  executePlan,
  resolveExecutionContext,
  normalizeSteps,
  buildCoreRuleGate,
  classifyCoreRuleRequirement,
  resolveCorePreconditions,
  attachPreconditionDiagnostics,
  resolveEnforcementPolicy,
  shouldBlockStepForPreconditions,
  shouldAttemptAutoCoreCheck,
  runAutoCoreCheck,
  rebuildPreconditionStateAfterCoreCheck,
  shouldAttemptAutoGitCheck,
  runAutoGitCheck,
  rebuildPreconditionStateAfterGitCheck,
  shouldAttemptAutoCheckpoint,
  runAutoCheckpoint,
  rebuildPreconditionStateAfterCheckpoint,
  shouldAttemptAutoAshCoreSave,
  runAutoAshCoreSave,
  rebuildPreconditionStateAfterAshCoreSave,
  shouldAttemptAutoMemorySave,
  runAutoMemorySave,
  rebuildPreconditionStateAfterMemorySave,
  shouldAttemptAutoHandover,
  runAutoHandover,
  rebuildPreconditionStateAfterHandover
};




