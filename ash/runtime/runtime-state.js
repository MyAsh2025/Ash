const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  locateFullSymbolRange
} = require("./target-locator");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getRuntimeStateDir(
  projectPath = process.cwd()
) {
  return path.join(
    projectPath,
    "ash",
    "runtime-state"
  );
}

function getLatestRuntimeStatePath(
  projectPath = process.cwd()
) {
  return path.join(
    getRuntimeStateDir(
      projectPath
    ),
    "latest-runtime.json"
  );
}

function writeRuntimeState(
  runtimeResult = {},
  { projectPath = process.cwd() } = {}
) {
  const stateDir = getRuntimeStateDir(projectPath);
  ensureDir(stateDir);

  const latestPath = getLatestRuntimeStatePath(projectPath);
  const existingState = fs.existsSync(latestPath)
    ? JSON.parse(fs.readFileSync(latestPath, "utf8"))
    : null;
  const autonomousDevelopment =
    existingState?.autonomousDevelopment &&
    typeof existingState.autonomousDevelopment === "object" &&
    !Array.isArray(existingState.autonomousDevelopment)
      ? existingState.autonomousDevelopment
      : null;

  const state = {
    mode: "persistent-runtime-state",
    version: "ash-local-runtime-v0.1",
    latestRuntime: {
      task: runtimeResult.task || null,
      project: runtimeResult.projectContext?.project?.id || null,
      projectPath:
        runtimeResult.projectContext?.project?.path ||
        runtimeResult.projectContext?.projectPath ||
        null,
      resumeState: runtimeResult.resumeRuntime?.resumeState || null,
      saveCompleted: Boolean(runtimeResult.saveVerification?.saveCompleted),
      shutdownCompleted: Boolean(runtimeResult.shutdownRuntime?.shutdownCompleted),
      completedActions: runtimeResult.queueExecution?.queueState?.completedActions || [],
      executiveRuntime: runtimeResult.executiveRuntime
        ? {
            objective: runtimeResult.executiveRuntime.objective,
            priority: runtimeResult.executiveRuntime.priority,
            domain: runtimeResult.executiveRuntime.domain,
            nextActions: runtimeResult.executiveRuntime.nextActions || [],
            continueExecution: runtimeResult.executiveRuntime.continueExecution,
            requiresHumanReview: runtimeResult.executiveRuntime.requiresHumanReview
          }
        : null,
      repositoryStrategy: runtimeResult.repositoryStrategy
        ? {
            strategy: runtimeResult.repositoryStrategy.strategy,
            strategyActions: runtimeResult.repositoryStrategy.strategyActions || [],
            commitCandidate: runtimeResult.repositoryStrategy.commitCandidate,
            pushCandidate: runtimeResult.repositoryStrategy.pushCandidate,
            requiresHumanReview: runtimeResult.repositoryStrategy.requiresHumanReview,
            allowedToAutoCommit: runtimeResult.repositoryStrategy.allowedToAutoCommit,
            reason: runtimeResult.repositoryStrategy.reason
          }
        : null,
      governor: runtimeResult.runtimeGovernor
        ? {
            nextState: runtimeResult.runtimeGovernor.nextState,
            nextActions: runtimeResult.runtimeGovernor.nextActions || [],
            shouldContinue: runtimeResult.runtimeGovernor.shouldContinue,
            shouldIdle: runtimeResult.runtimeGovernor.shouldIdle,
            shouldReport: runtimeResult.runtimeGovernor.shouldReport,
            reason: runtimeResult.runtimeGovernor.reason
          }
        : null,
      logPath: runtimeResult.logPath || null
    },
    ...(autonomousDevelopment
      ? { autonomousDevelopment }
      : {}),
    savedAt: new Date().toISOString()
  };

  fs.writeFileSync(latestPath, JSON.stringify(state, null, 2), "utf8");

  return {
    mode: "runtime-state-writer",
    version: "ash-local-runtime-v0.1",
    path: latestPath,
    saved: true,
    state
  };
}

function readRuntimeState() {
  const latestPath = getLatestRuntimeStatePath();

  if (!fs.existsSync(latestPath)) {
    return {
      mode: "runtime-state-reader",
      version: "ash-local-runtime-v0.1",
      exists: false,
      path: latestPath,
      state: null
    };
  }

  return {
    mode: "runtime-state-reader",
    version: "ash-local-runtime-v0.1",
    exists: true,
    path: latestPath,
    state: JSON.parse(fs.readFileSync(latestPath, "utf8"))
  };
}


function buildAutonomousTaskIdentity(
  task = null
) {
  if (
    !task ||
    typeof task !== "object"
  ) {
    return null;
  }

  return JSON.stringify({
    task:
      task.task || null,

    source:
      task.source || null,

    targetFile:
      task.targetFile ||
      task.file ||
      null,

    targetSymbol:
      task.targetSymbol || null,

    work:
      Array.isArray(
        task.work
      )
        ? task.work
        : []
  });
}

function resolveAutonomousTargetFingerprint({
  task = null,
  projectPath = process.cwd()
} = {}) {
  const targetFile =
    task?.targetFile ||
    task?.file ||
    null;

  if (
    typeof targetFile !== "string" ||
    targetFile.trim().length === 0
  ) {
    return null;
  }

  const absolutePath =
    path.resolve(
      projectPath,
      targetFile
    );

  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  const stat =
    fs.statSync(
      absolutePath
    );

  if (!stat.isFile()) {
    return null;
  }

  return crypto
    .createHash("sha256")
    .update(
      fs.readFileSync(
        absolutePath
      )
    )
    .digest("hex");
}

function readAutonomousCompletedTasks({
  projectPath = process.cwd()
} = {}) {
  const latestPath =
    getLatestRuntimeStatePath(
      projectPath
    );

  if (!fs.existsSync(latestPath)) {
    return {
      mode:
        "autonomous-completion-state-reader",
      version:
        "ash-local-runtime-v0.1-fingerprint",
      exists:
        false,
      path:
        latestPath,
      tasks: [],
      records: []
    };
  }

  const state =
    JSON.parse(
      fs.readFileSync(
        latestPath,
        "utf8"
      )
    );

  const records =
    Array.isArray(
      state
        ?.autonomousDevelopment
        ?.completedTasks
    )
      ? state
          .autonomousDevelopment
          .completedTasks
      : [];

  const evaluatedRecords =
    records.map(
      (record) => {
        if (
          !record ||
          typeof record !== "object" ||
          !record.task
        ) {
          return {
            record,
            active: false,
            invalidationReason:
              "invalid-completion-record"
          };
        }

        const currentFingerprint =
          resolveAutonomousTargetFingerprint({
            task:
              record.task,
            projectPath
          });

        const active =
          typeof record.targetFingerprint ===
            "string" &&
          record.targetFingerprint.length > 0 &&
          currentFingerprint ===
            record.targetFingerprint;

        return {
          record,
          active,
          invalidationReason:
            active
              ? null
              : !currentFingerprint
                ? "target-unavailable"
                : typeof record.targetFingerprint !== "string" ||
                    record.targetFingerprint.length === 0
                  ? "target-fingerprint-missing"
                  : "target-fingerprint-mismatch"
        };
      }
    );

  const activeRecords =
    evaluatedRecords
      .filter((entry) => entry.active)
      .map((entry) => entry.record);

  const invalidatedRecords =
    evaluatedRecords
      .filter((entry) => !entry.active)
      .map((entry) => ({
        ...entry.record,
        invalidationReason:
          entry.invalidationReason
      }));

  return {
    mode:
      "autonomous-completion-state-reader",
    version:
      "ash-local-runtime-v0.1-fingerprint",
    exists:
      true,
    path:
      latestPath,
    tasks:
      activeRecords.map(
        (record) =>
          record.task
      ),
    records:
      activeRecords,
    invalidatedRecords
  };
}

function readAutonomousRuntimeEvidence({
  projectPath = process.cwd()
} = {}) {
  const latestPath =
    getLatestRuntimeStatePath(projectPath);

  if (!fs.existsSync(latestPath)) {
    return {
      mode: "autonomous-runtime-evidence-reader",
      version: "ash-local-runtime-v0.1-structured-evidence",
      exists: false,
      path: latestPath,
      records: []
    };
  }

  const state = JSON.parse(
    fs.readFileSync(latestPath, "utf8")
  );

  return {
    mode: "autonomous-runtime-evidence-reader",
    version: "ash-local-runtime-v0.1-structured-evidence",
    exists: true,
    path: latestPath,
    records: Array.isArray(
      state?.autonomousDevelopment?.runtimeEvidence
    )
      ? state.autonomousDevelopment.runtimeEvidence
      : []
  };
}

function writeAutonomousRuntimeEvidenceRecord({
  projectPath = process.cwd(),
  record = null
} = {}) {
  if (!record || typeof record !== "object") {
    return {
      mode: "autonomous-runtime-evidence-writer",
      success: false,
      reason: "A structured runtime evidence record is required."
    };
  }

  const stateDir = getRuntimeStateDir(projectPath);
  ensureDir(stateDir);
  const latestPath = getLatestRuntimeStatePath(projectPath);
  const state = fs.existsSync(latestPath)
    ? JSON.parse(fs.readFileSync(latestPath, "utf8"))
    : {
        mode: "persistent-runtime-state",
        version: "ash-local-runtime-v0.1",
        latestRuntime: null
      };
  const autonomousDevelopment =
    state.autonomousDevelopment &&
    typeof state.autonomousDevelopment === "object"
      ? state.autonomousDevelopment
      : {};
  const records = Array.isArray(
    autonomousDevelopment.runtimeEvidence
  )
    ? autonomousDevelopment.runtimeEvidence
    : [];

  state.autonomousDevelopment = {
    ...autonomousDevelopment,
    mode: "autonomous-development-completion-state",
    version: "ash-local-runtime-v0.2-structured-evidence",
    completedTasks: Array.isArray(
      autonomousDevelopment.completedTasks
    )
      ? autonomousDevelopment.completedTasks
      : [],
    runtimeEvidence: [...records, record]
  };
  state.savedAt = new Date().toISOString();
  fs.writeFileSync(
    latestPath,
    JSON.stringify(state, null, 2),
    "utf8"
  );

  return {
    mode: "autonomous-runtime-evidence-writer",
    version: "ash-local-runtime-v0.1-structured-evidence",
    success: true,
    path: latestPath,
    record
  };
}

function buildAutonomousRuntimeEvidenceSignature({
  targetFile = null,
  targetSymbol = null,
  failureStage = null,
  failureCode = null
} = {}) {
  if (
    typeof targetFile !== "string" ||
    !targetFile ||
    typeof targetSymbol !== "string" ||
    !targetSymbol ||
    typeof failureStage !== "string" ||
    !failureStage ||
    typeof failureCode !== "string" ||
    !failureCode
  ) {
    return null;
  }

  return crypto
    .createHash("sha256")
    .update(JSON.stringify({
      targetFile,
      targetSymbol,
      failureStage,
      failureCode
    }))
    .digest("hex");
}

function collectFailedPermanentCheckIds(result = null) {
  const coreChecks = [
    result?.rollbackCoreCheck,
    ...(Array.isArray(result?.cycles)
      ? result.cycles.flatMap((cycle) => [cycle?.rollbackCoreCheck, cycle?.coreCheck])
      : [])
  ].filter(Boolean);
  return [...new Set(coreChecks.flatMap((coreCheck) =>
    Array.isArray(coreCheck?.permanentRegressionChecks?.results)
      ? coreCheck.permanentRegressionChecks.results
          .filter((check) => check?.success !== true && typeof check?.id === "string" && check.id)
          .map((check) => check.id)
      : []
  ))];
}

function recordAutonomousDevelopmentResult({
  projectPath = process.cwd(),
  result = null
} = {}) {
  if (!result || typeof result !== "object") {
    return { success: false, recorded: false };
  }

  if (result.success !== true) {
    const repairTask = result.pendingRepairTask;
    const targetFile = repairTask?.targetFile || null;
    const targetSymbol = repairTask?.targetSymbol || null;
    const failureStage = result.failureStage ||
      repairTask?.failureStage || null;
    const failureCode = result.stopReason || null;
    const signature =
      buildAutonomousRuntimeEvidenceSignature({
        targetFile,
        targetSymbol,
        failureStage,
        failureCode
      });
    const verifiedOperation = Array.isArray(
      repairTask?.validatedOperations
    )
      ? repairTask.validatedOperations.find(
          (operation) =>
            operation?.file === targetFile &&
            operation?.targetSymbol === targetSymbol &&
            operation?.observedSymbolRange?.verified === true
        )
      : null;
    const providerFailure = repairTask?.providerFailure;
    const repeatedGuidanceDefect =
      providerFailure?.repeatedGenerationViolation
        ?.suspectedValidationOrGuidanceDefect === true;
    const safetyRejectionOnly =
      failureStage === "patch-validator" ||
      (
        failureStage === "implementation-provider" &&
        !repeatedGuidanceDefect
      );
    const record = {
      recordKind: "terminal-failure",
      terminal: result.stopped === true,
      unresolved: true,
      targetFile,
      targetSymbol,
      targetSymbolVerified:
        Boolean(verifiedOperation),
      targetResolutionStatus:
        verifiedOperation ? "verified" : "unresolved",
      failureStage,
      failureCode,
      evidenceSignature: signature,
      failedCheckIds:
        collectFailedPermanentCheckIds(result),
      targetFingerprint:
        resolveAutonomousTargetFingerprint({
          task: { targetFile },
          projectPath
        }),
      safetyRejectionOnly,
      recordedAt:
        result.ranAt ||
        new Date().toISOString()
    };

    return signature
      ? {
          ...writeAutonomousRuntimeEvidenceRecord({
            projectPath,
            record
          }),
          recorded: true
        }
      : { success: true, recorded: false };
  }

  const cycles = Array.isArray(result.cycles)
    ? result.cycles
    : [];
  const completedCycle = [...cycles].reverse().find(
    (cycle) => {
      const selectedTask = cycle?.selectedTask;
      if (
        !selectedTask?.runtimeEvidence ||
        selectedTask.reportOnly === true ||
        cycle?.capabilityLoop?.success !== true ||
        cycle?.coreCheck?.success !== true
      ) {
        return false;
      }

      const developmentStep = [
        ...(cycle.capabilityLoop.steps || [])
      ].reverse().find(
        (step) => step?.action === "development_pipeline"
      );
      const pipelineResult =
        developmentStep?.dispatchResult?.result?.result;
      const persistedCompletion =
        readAutonomousCompletedTasks({ projectPath });
      const completionActive =
        persistedCompletion.records.some(
          (record) =>
            buildAutonomousTaskIdentity(record?.task) ===
              buildAutonomousTaskIdentity(selectedTask)
        );

      return (
        pipelineResult?.success === true &&
        pipelineResult?.dryRun === false &&
        pipelineResult?.effectiveDryRun === false &&
        pipelineResult?.patchApplyEngine?.success === true &&
        pipelineResult?.patchApplyEngine?.applied === true &&
        completionActive
      );
    }
  );
  const evidence =
    completedCycle?.selectedTask?.runtimeEvidence;

  if (!evidence) {
    return { success: true, recorded: false };
  }

  return {
    ...writeAutonomousRuntimeEvidenceRecord({
      projectPath,
      record: {
        recordKind: "successful-apply",
        targetFile: evidence.targetFile,
        targetSymbol: evidence.targetSymbol,
        evidenceSignature:
          evidence.evidenceSignature,
        targetFingerprint:
          resolveAutonomousTargetFingerprint({
            task: {
              targetFile: evidence.targetFile
            },
            projectPath
          }),
        recordedAt:
          result.ranAt ||
          new Date().toISOString()
      }
    }),
    recorded: true
  };
}

function recordFormalCompletionEvidence({
  projectPath = process.cwd(),
  targetFile = null,
  targetSymbol = null,
  completedAt = null,
  resolution = null,
  coreCheck = null,
  completionEvidence = null
} = {}) {
  if (!targetFile || !targetSymbol) {
    return { success: false, recorded: false };
  }

  const completion = writeAutonomousRuntimeEvidenceRecord({
      projectPath,
      record: {
        recordKind: "formal-completion",
        targetFile,
        targetSymbol,
        evidenceSignature: null,
        targetFingerprint:
          resolveAutonomousTargetFingerprint({
            task: { targetFile },
            projectPath
          }),
        recordedAt:
          completedAt ||
          new Date().toISOString()
      }
    });
  let resolutionRecorded = false;
  let resolutionRecord = null;
  const records = readAutonomousRuntimeEvidence({ projectPath }).records;
  const candidate = [...records].reverse().find((record) =>
    record?.recordKind === "terminal-failure" &&
    record.evidenceSignature === resolution?.evidenceSignature &&
    record.failureStage === resolution?.failureStage
  );
  const checkResults = Array.isArray(coreCheck?.permanentRegressionChecks?.results)
    ? coreCheck.permanentRegressionChecks.results
    : [];
  const checkPassed = (id) =>
    typeof id === "string" && id.length > 0 &&
    checkResults.some((check) => check?.id === id && check?.success === true);
  const normalizedRootCauseFile = String(resolution?.rootCauseTargetFile || "").trim();
  const normalizedRootCauseSymbol = String(resolution?.rootCauseTargetSymbol || "").trim();
  const rootCausePath = normalizedRootCauseFile
    ? path.resolve(projectPath, normalizedRootCauseFile)
    : null;
  const rootCauseRange = rootCausePath && normalizedRootCauseSymbol
    ? locateFullSymbolRange({
        filePath: rootCausePath,
        targetSymbol: normalizedRootCauseSymbol,
        root: projectPath
      })
    : null;
  const repairFingerprint = resolveAutonomousTargetFingerprint({
    task: { targetFile },
    projectPath
  });
  const rootCauseFingerprint = resolveAutonomousTargetFingerprint({
    task: { targetFile: normalizedRootCauseFile },
    projectPath
  });
  const candidateFailedCheckIds = Array.isArray(candidate?.failedCheckIds)
    ? candidate.failedCheckIds
    : [];
  const failureAttributionMatches =
    candidateFailedCheckIds.length === 0 ||
    candidateFailedCheckIds.includes(resolution?.failedCheckId);
  const failedCheckResult = checkResults.find(
    (check) => check?.id === resolution?.failedCheckId && check?.success === true
  );
  const failedCheckFileMatches =
    String(failedCheckResult?.file || "")
      .replace(/\\/g, "/")
      .replace(/^\.\//, "") ===
    normalizedRootCauseFile.replace(/\\/g, "/").replace(/^\.\//, "");
  const validResolution = Boolean(
    resolution &&
    candidate &&
    candidate.terminal === true &&
    candidate.unresolved === true &&
    typeof resolution.evidenceSignature === "string" &&
    resolution.evidenceSignature.length > 0 &&
    typeof resolution.failureStage === "string" &&
    resolution.failureStage.length > 0 &&
    typeof resolution.failedCheckId === "string" &&
    resolution.failedCheckId.length > 0 &&
    normalizedRootCauseFile &&
    normalizedRootCauseSymbol &&
    rootCauseRange?.verified === true &&
    typeof resolution.repairRegressionId === "string" &&
    resolution.repairRegressionId.length > 0 &&
    resolution.verificationSet === "canonical-corecheck" &&
    failureAttributionMatches &&
    failedCheckFileMatches &&
    checkPassed(resolution.failedCheckId) &&
    checkPassed(resolution.repairRegressionId) &&
    coreCheck?.success === true &&
    completionEvidence?.completionKind === "existing-repair-verification" &&
    completionEvidence?.completionEligible === true &&
    completionEvidence?.completionSuccess === true &&
    completionEvidence?.verificationSuccess === true &&
    completionEvidence?.coreCheckSuccess === true &&
    completionEvidence?.applied === false &&
    repairFingerprint &&
    rootCauseFingerprint
  );
  if (validResolution) {
    resolutionRecord = {
      recordKind: "verified-resolution",
      evidenceSignature: resolution.evidenceSignature,
      failureStage: resolution.failureStage,
      failedCheckId: resolution.failedCheckId,
      rootCauseTargetFile: normalizedRootCauseFile,
      rootCauseTargetSymbol: normalizedRootCauseSymbol,
      rootCauseTargetFingerprint: rootCauseFingerprint,
      repairTargetFile: targetFile,
      repairTargetSymbol: targetSymbol,
      repairTargetFingerprint: repairFingerprint,
      repairRegressionId: resolution.repairRegressionId,
      verificationSet: resolution.verificationSet,
      verificationSuccess: true,
      completionKind: completionEvidence.completionKind,
      recordedAt: completedAt || new Date().toISOString()
    };
    writeAutonomousRuntimeEvidenceRecord({ projectPath, record: resolutionRecord });
    resolutionRecorded = true;
  }

  return {
    ...completion,
    recorded: true,
    resolutionRecorded,
    resolutionRecord
  };
}

function selectVerifiedRuntimeEvidence({
  projectPath = process.cwd(),
  records = [],
  activeCompletionRecords = []
} = {}) {
  const structuredRecords = Array.isArray(records)
    ? records.filter(
        (record) => record && typeof record === "object"
      )
    : [];
  const timestamp = (record) => {
    const value = Date.parse(record?.recordedAt || "");
    return Number.isFinite(value) ? value : 0;
  };
  const sameTarget = (left, right) =>
    left?.targetFile === right?.targetFile &&
    left?.targetSymbol === right?.targetSymbol;
  const resolutions = structuredRecords.filter(
    (record) =>
      record.recordKind === "successful-apply" ||
      record.recordKind === "formal-completion" ||
      record.recordKind === "verified-resolution"
  );
  const candidates = structuredRecords.filter(
    (record) => record.recordKind === "terminal-failure"
  );
  const newestBySignature = new Map();

  for (const candidate of candidates) {
    if (
      typeof candidate.evidenceSignature !== "string" ||
      candidate.evidenceSignature.length === 0
    ) {
      continue;
    }
    const previous = newestBySignature.get(
      candidate.evidenceSignature
    );
    if (!previous || timestamp(candidate) > timestamp(previous)) {
      newestBySignature.set(candidate.evidenceSignature, candidate);
    }
  }

  const rejected = [];
  const eligible = [];

  for (const candidate of newestBySignature.values()) {
    const absoluteTarget = path.resolve(
      projectPath,
      candidate.targetFile || ""
    );
    const currentFingerprint =
      resolveAutonomousTargetFingerprint({
        task: {
          targetFile: candidate.targetFile
        },
        projectPath
      });
    const symbolRange =
      typeof candidate.targetSymbol === "string" &&
      candidate.targetSymbol.length > 0
        ? locateFullSymbolRange({
            filePath: absoluteTarget,
            targetSymbol: candidate.targetSymbol,
            root: projectPath
          })
        : null;
    const activeCompletion =
      (Array.isArray(activeCompletionRecords)
        ? activeCompletionRecords
        : []
      ).some((record) =>
        sameTarget(candidate, record?.task) &&
        record.targetFingerprint === currentFingerprint
      );
    const newerResolution = resolutions.some((record) => {
      if (timestamp(record) <= timestamp(candidate)) return false;
      if (record.recordKind !== "verified-resolution") {
        return sameTarget(candidate, record) && (
          record.recordKind === "formal-completion" ||
          record.evidenceSignature === candidate.evidenceSignature
        );
      }
      const rootCauseFingerprint = resolveAutonomousTargetFingerprint({
        task: { targetFile: record.rootCauseTargetFile },
        projectPath
      });
      const repairFingerprint = resolveAutonomousTargetFingerprint({
        task: { targetFile: record.repairTargetFile },
        projectPath
      });
      const rootCauseRange =
        typeof record.rootCauseTargetFile === "string" &&
        record.rootCauseTargetFile.length > 0 &&
        typeof record.rootCauseTargetSymbol === "string" &&
        record.rootCauseTargetSymbol.length > 0
          ? locateFullSymbolRange({
              filePath: path.resolve(projectPath, record.rootCauseTargetFile),
              targetSymbol: record.rootCauseTargetSymbol,
              root: projectPath
            })
          : null;
      const repairRange =
        typeof record.repairTargetFile === "string" &&
        record.repairTargetFile.length > 0 &&
        typeof record.repairTargetSymbol === "string" &&
        record.repairTargetSymbol.length > 0
          ? locateFullSymbolRange({
              filePath: path.resolve(projectPath, record.repairTargetFile),
              targetSymbol: record.repairTargetSymbol,
              root: projectPath
            })
          : null;
      const candidateFailedCheckIds = Array.isArray(candidate.failedCheckIds)
        ? candidate.failedCheckIds
        : [];
      return (
        record.evidenceSignature === candidate.evidenceSignature &&
        record.failureStage === candidate.failureStage &&
        typeof record.failedCheckId === "string" &&
        record.failedCheckId.length > 0 &&
        typeof record.rootCauseTargetFile === "string" &&
        record.rootCauseTargetFile.length > 0 &&
        typeof record.rootCauseTargetSymbol === "string" &&
        record.rootCauseTargetSymbol.length > 0 &&
        record.verificationSet === "canonical-corecheck" &&
        record.verificationSuccess === true &&
        record.completionKind === "existing-repair-verification" &&
        (candidateFailedCheckIds.length === 0 ||
          candidateFailedCheckIds.includes(record.failedCheckId)) &&
        rootCauseRange?.verified === true &&
        repairRange?.verified === true &&
        rootCauseFingerprint === record.rootCauseTargetFingerprint &&
        repairFingerprint === record.repairTargetFingerprint
      );
    });
    const valid =
      candidate.terminal === true &&
      candidate.unresolved === true &&
      candidate.safetyRejectionOnly !== true &&
      candidate.targetSymbolVerified === true &&
      candidate.targetResolutionStatus !== "ambiguous" &&
      candidate.targetResolutionStatus !== "unresolved" &&
      typeof candidate.targetFile === "string" &&
      candidate.targetFile.length > 0 &&
      typeof candidate.targetSymbol === "string" &&
      candidate.targetSymbol.length > 0 &&
      typeof candidate.failureStage === "string" &&
      candidate.failureStage.length > 0 &&
      fs.existsSync(absoluteTarget) &&
      currentFingerprint === candidate.targetFingerprint &&
      symbolRange?.verified === true &&
      !activeCompletion &&
      !newerResolution;

    if (valid) {
      eligible.push(candidate);
    } else {
      rejected.push(candidate);
    }
  }

  eligible.sort((left, right) =>
    timestamp(right) - timestamp(left)
  );

  return {
    mode: "verified-runtime-evidence-selection",
    version: "ash-local-runtime-v0.1-structured-evidence",
    success: true,
    eligible,
    rejected
  };
}

function writeAutonomousCompletedTask({
  task = null,
  projectPath = process.cwd()
} = {}) {
  const identity =
    buildAutonomousTaskIdentity(
      task
    );

  const targetFingerprint =
    resolveAutonomousTargetFingerprint({
      task,
      projectPath
    });

  if (
    !identity ||
    !targetFingerprint
  ) {
    return {
      mode:
        "autonomous-completion-state-writer",
      version:
        "ash-local-runtime-v0.1-fingerprint",
      saved:
        false,
      reason:
        "A concrete task identity and target-file fingerprint are required."
    };
  }

  const stateDir =
    getRuntimeStateDir(
      projectPath
    );

  ensureDir(
    stateDir
  );

  const latestPath =
    getLatestRuntimeStatePath(
      projectPath
    );

  let state = {
    mode:
      "persistent-runtime-state",
    version:
      "ash-local-runtime-v0.1",
    latestRuntime:
      null
  };

  if (fs.existsSync(latestPath)) {
    state =
      JSON.parse(
        fs.readFileSync(
          latestPath,
          "utf8"
        )
      );
  }

  const existingRecords =
    Array.isArray(
      state
        ?.autonomousDevelopment
        ?.completedTasks
    )
      ? state
          .autonomousDevelopment
          .completedTasks
      : [];

  const retainedRecords =
    existingRecords.filter(
      (record) =>
        buildAutonomousTaskIdentity(
          record?.task
        ) !== identity
    );

  const record = {
    identity,
    task,
    targetFingerprint,
    completedAt:
      new Date().toISOString()
  };

  state.autonomousDevelopment = {
    ...(
      state.autonomousDevelopment &&
      typeof state.autonomousDevelopment === "object"
        ? state.autonomousDevelopment
        : {}
    ),
    mode:
      "autonomous-development-completion-state",
    version:
      "ash-local-runtime-v0.2-structured-evidence",
    completedTasks: [
      ...retainedRecords,
      record
    ],
    runtimeEvidence:
      Array.isArray(
        state
          ?.autonomousDevelopment
          ?.runtimeEvidence
      )
        ? state.autonomousDevelopment.runtimeEvidence
        : []
  };

  state.savedAt =
    new Date().toISOString();

  fs.writeFileSync(
    latestPath,
    JSON.stringify(
      state,
      null,
      2
    ),
    "utf8"
  );

  return {
    mode:
      "autonomous-completion-state-writer",
    version:
      "ash-local-runtime-v0.1-fingerprint",
    saved:
      true,
    path:
      latestPath,
    record
  };
}

module.exports = {
  writeRuntimeState,
  readRuntimeState,
  getRuntimeStateDir,
  getLatestRuntimeStatePath,
  readAutonomousCompletedTasks,
  writeAutonomousCompletedTask,
  readAutonomousRuntimeEvidence,
  writeAutonomousRuntimeEvidenceRecord,
  buildAutonomousRuntimeEvidenceSignature,
  recordAutonomousDevelopmentResult,
  recordFormalCompletionEvidence,
  selectVerifiedRuntimeEvidence,
  resolveAutonomousTargetFingerprint
};



