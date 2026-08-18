"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  selectVerifiedRuntimeEvidence,
  readAutonomousCompletedTasks,
  readAutonomousRuntimeEvidence,
  recordAutonomousDevelopmentResult,
  recordFormalCompletionEvidence
} = require("./runtime-state");
const {
  observeRepository
} = require("./repository-observation-runtime");
const {
  discoverTaskFromRepository
} = require("./task-discovery-runtime");

const fixtureRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "ash-verified-runtime-evidence-")
);
const targetFile = "ash/runtime/fixture-target.js";
const absoluteTarget = path.join(fixtureRoot, targetFile);
fs.mkdirSync(path.dirname(absoluteTarget), { recursive: true });
fs.writeFileSync(
  absoluteTarget,
  "function verifiedTarget() { return true; }\nmodule.exports = { verifiedTarget };\n",
  "utf8"
);
const targetFingerprint = crypto
  .createHash("sha256")
  .update(fs.readFileSync(absoluteTarget))
  .digest("hex");
const baseFailure = {
  recordKind: "terminal-failure",
  terminal: true,
  unresolved: true,
  targetFile,
  targetSymbol: "verifiedTarget",
  targetSymbolVerified: true,
  failureStage: "corecheck",
  evidenceSignature: "corecheck|ash/runtime/fixture-target.js|verifiedTarget|fixture-contract",
  targetFingerprint,
  safetyRejectionOnly: false,
  recordedAt: "2026-08-18T01:00:00.000Z"
};

const eligible = selectVerifiedRuntimeEvidence({
  projectPath: fixtureRoot,
  records: [baseFailure],
  activeCompletionRecords: []
});
assert.strictEqual(eligible.eligible.length, 1);
assert.strictEqual(eligible.eligible[0].targetFile, targetFile);
assert.strictEqual(eligible.eligible[0].targetSymbol, "verifiedTarget");
assert.strictEqual(eligible.eligible[0].failureStage, "corecheck");
assert.strictEqual(
  eligible.eligible[0].evidenceSignature,
  baseFailure.evidenceSignature
);

const observation = observeRepository({
  projectPath: fixtureRoot,
  scanTargets: [],
  runtimeEvidenceRecords: [baseFailure],
  activeCompletionRecords: []
});
assert.strictEqual(observation.sourceFindings.length, 0);
assert.strictEqual(observation.runtimeEvidenceFindings.length, 1);
assert.strictEqual(observation.nextTask.type, "runtime-evidence");
assert.strictEqual(observation.nextTask.source, "verified-runtime-evidence");

const discovered = discoverTaskFromRepository({ observation });
assert.strictEqual(discovered.discovered, true);
assert.strictEqual(discovered.task.source, "verified-runtime-evidence");
assert.strictEqual(discovered.task.targetFile, targetFile);
assert.strictEqual(discovered.task.targetSymbol, "verifiedTarget");
assert.strictEqual(discovered.task.failureStage, "corecheck");
assert.strictEqual(
  discovered.task.evidenceSignature,
  baseFailure.evidenceSignature
);

const newerSuccess = {
  recordKind: "successful-apply",
  targetFile,
  targetSymbol: "verifiedTarget",
  evidenceSignature: baseFailure.evidenceSignature,
  targetFingerprint,
  recordedAt: "2026-08-18T02:00:00.000Z"
};
const resolvedByApply = selectVerifiedRuntimeEvidence({
  projectPath: fixtureRoot,
  records: [baseFailure, newerSuccess],
  activeCompletionRecords: []
});
assert.strictEqual(resolvedByApply.eligible.length, 0);

const formalCompletion = {
  recordKind: "formal-completion",
  targetFile,
  targetSymbol: "verifiedTarget",
  evidenceSignature: baseFailure.evidenceSignature,
  targetFingerprint,
  recordedAt: "2026-08-18T03:00:00.000Z"
};
assert.strictEqual(
  selectVerifiedRuntimeEvidence({
    projectPath: fixtureRoot,
    records: [baseFailure, formalCompletion],
    activeCompletionRecords: []
  }).eligible.length,
  0
);

const activeCompletion = {
  task: { targetFile, targetSymbol: "verifiedTarget" },
  targetFingerprint
};
assert.strictEqual(
  selectVerifiedRuntimeEvidence({
    projectPath: fixtureRoot,
    records: [baseFailure],
    activeCompletionRecords: [activeCompletion]
  }).eligible.length,
  0
);

const unsafeCases = [
  { ...baseFailure, targetSymbol: null },
  { ...baseFailure, targetSymbolVerified: false },
  { ...baseFailure, targetResolutionStatus: "ambiguous" },
  { ...baseFailure, safetyRejectionOnly: true },
  { ...baseFailure, targetFingerprint: "stale-fingerprint" },
  {
    recordKind: "unstructured-log-text",
    errorMessage: "Please repair verifiedTarget in the target file.",
    task: "Old free-form development task",
    recordedAt: "2026-08-18T04:00:00.000Z"
  }
];
for (const unsafe of unsafeCases) {
  assert.strictEqual(
    selectVerifiedRuntimeEvidence({
      projectPath: fixtureRoot,
      records: [unsafe],
      activeCompletionRecords: []
    }).eligible.length,
    0
  );
}

const duplicate = {
  ...baseFailure,
  recordedAt: "2026-08-18T01:30:00.000Z"
};
assert.strictEqual(
  selectVerifiedRuntimeEvidence({
    projectPath: fixtureRoot,
    records: [baseFailure, duplicate],
    activeCompletionRecords: []
  }).eligible.length,
  1
);
const unrelatedNewerSuccess = {
  ...newerSuccess,
  evidenceSignature: "different-signature",
  recordedAt: "2026-08-18T05:00:00.000Z"
};
assert.strictEqual(
  selectVerifiedRuntimeEvidence({
    projectPath: fixtureRoot,
    records: [baseFailure, unrelatedNewerSuccess],
    activeCompletionRecords: []
  }).eligible.length,
  1
);

const stateDir = path.join(fixtureRoot, "ash", "runtime-state");
fs.mkdirSync(stateDir, { recursive: true });
fs.writeFileSync(
  path.join(stateDir, "latest-runtime.json"),
  JSON.stringify({
    autonomousDevelopment: {
      completedTasks: [{
        task: { targetFile, targetSymbol: "verifiedTarget" },
        targetFingerprint: "stale-completion-fingerprint"
      }]
    }
  }),
  "utf8"
);
const completionState = readAutonomousCompletedTasks({
  projectPath: fixtureRoot
});
assert.strictEqual(completionState.records.length, 0);
assert.strictEqual(completionState.invalidatedRecords.length, 1);
assert.strictEqual(
  completionState.invalidatedRecords[0].invalidationReason,
  "target-fingerprint-mismatch"
);
assert.strictEqual(
  selectVerifiedRuntimeEvidence({
    projectPath: fixtureRoot,
    records: completionState.invalidatedRecords,
    activeCompletionRecords: []
  }).eligible.length,
  0
);

const recordedFailure = recordAutonomousDevelopmentResult({
  projectPath: fixtureRoot,
  result: {
    success: false,
    stopped: true,
    stopReason: "fixture_terminal_failure",
    failureStage: "corecheck",
    ranAt: "2026-08-18T06:00:00.000Z",
    pendingRepairTask: {
      targetFile,
      targetSymbol: "verifiedTarget",
      failureStage: "corecheck",
      validatedOperations: [{
        file: targetFile,
        targetSymbol: "verifiedTarget",
        observedSymbolRange: { verified: true }
      }]
    }
  }
});
assert.strictEqual(recordedFailure.success, true);
assert.strictEqual(recordedFailure.recorded, true);
const persistedEvidence = readAutonomousRuntimeEvidence({
  projectPath: fixtureRoot
});
assert.strictEqual(persistedEvidence.records.length, 1);
assert.strictEqual(
  persistedEvidence.records[0].recordKind,
  "terminal-failure"
);
assert.strictEqual(
  selectVerifiedRuntimeEvidence({
    projectPath: fixtureRoot,
    records: persistedEvidence.records,
    activeCompletionRecords: []
  }).eligible.length,
  1
);
const persistedObservation = observeRepository({
  projectPath: fixtureRoot,
  scanTargets: []
});
assert.strictEqual(
  persistedObservation.runtimeEvidenceFindings.length,
  1
);
assert.strictEqual(
  discoverTaskFromRepository({
    observation: persistedObservation
  }).task.source,
  "verified-runtime-evidence"
);

const recordedCompletion = recordFormalCompletionEvidence({
  projectPath: fixtureRoot,
  targetFile,
  targetSymbol: "verifiedTarget",
  completedAt: "2026-08-18T07:00:00.000Z"
});
assert.strictEqual(recordedCompletion.success, true);
assert.strictEqual(
  selectVerifiedRuntimeEvidence({
    projectPath: fixtureRoot,
    records: readAutonomousRuntimeEvidence({
      projectPath: fixtureRoot
    }).records,
    activeCompletionRecords: []
  }).eligible.length,
  0
);

for (let index = 0; index < 20; index += 1) {
  fs.writeFileSync(
    path.join(
      path.dirname(absoluteTarget),
      `cleanup.js.backup.${index}`
    ),
    "fixture",
    "utf8"
  );
}
const cleanupOnlyObservation = observeRepository({
  projectPath: fixtureRoot,
  scanTargets: ["ash/runtime"],
  runtimeEvidenceRecords: [],
  activeCompletionRecords: []
});
const cleanupOnlyDiscovery = discoverTaskFromRepository({
  observation: cleanupOnlyObservation
});
assert.strictEqual(cleanupOnlyDiscovery.discovered, true);
assert.strictEqual(cleanupOnlyDiscovery.task.reportOnly, true);
assert.strictEqual(
  cleanupOnlyDiscovery.task.automaticDeletionAllowed,
  false
);

const evidenceWithCleanup = observeRepository({
  projectPath: fixtureRoot,
  scanTargets: ["ash/runtime"],
  runtimeEvidenceRecords: [baseFailure],
  activeCompletionRecords: []
});
const evidenceWithCleanupTask = discoverTaskFromRepository({
  observation: evidenceWithCleanup
});
assert.strictEqual(
  evidenceWithCleanupTask.task.source,
  "verified-runtime-evidence"
);
assert.strictEqual(
  evidenceWithCleanupTask.task.reportOnly,
  undefined
);

const cleanupObservation = observeRepository({
  projectPath: fixtureRoot,
  scanTargets: [],
  runtimeEvidenceRecords: [],
  activeCompletionRecords: []
});
const noEvidenceDiscovery = discoverTaskFromRepository({
  observation: cleanupObservation
});
assert.strictEqual(noEvidenceDiscovery.discovered, false);
assert.strictEqual(noEvidenceDiscovery.task, null);

console.log(JSON.stringify({
  mode: "verified-runtime-evidence-discovery-integration-regression-test",
  success: true,
  unresolvedEvidenceDiscovered: true,
  resolvedEvidenceSuppressed: true,
  unsafeEvidenceSuppressed: true,
  duplicateEvidenceDeduplicated: true,
  staleCompletionIsNotDefectEvidence: true,
  structuredEvidencePersisted: true,
  formalCompletionPersisted: true,
  cleanupRemainsReportOnly: true,
  noEvidenceStopsSafely: true
}, null, 2));
