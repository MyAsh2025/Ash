"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  getLatestRuntimeStatePath,
  writeRuntimeState,
  writeAutonomousCompletedTask,
  writeAutonomousRuntimeEvidenceRecord,
  readAutonomousRuntimeEvidence,
  recordAutonomousDevelopmentResult,
  selectVerifiedRuntimeEvidence
} = require("./runtime-state");

function createFixture(prefix) {
  const projectPath = fs.mkdtempSync(
    path.join(os.tmpdir(), prefix)
  );
  const targetFile = "ash/runtime/evidence-target.js";
  const absoluteTarget = path.join(projectPath, targetFile);
  fs.mkdirSync(path.dirname(absoluteTarget), { recursive: true });
  fs.writeFileSync(
    absoluteTarget,
    [
      "function verifiedTarget() { return true; }",
      "function unresolvedTarget() { return true; }",
      "module.exports = { verifiedTarget, unresolvedTarget };",
      ""
    ].join("\n"),
    "utf8"
  );
  const targetFingerprint = crypto
    .createHash("sha256")
    .update(fs.readFileSync(absoluteTarget))
    .digest("hex");
  return { projectPath, targetFile, targetFingerprint };
}

function buildSuccessfulResult({
  targetFile,
  applied = true,
  dryRun = false,
  pipelineSuccess = true,
  coreCheckSuccess = true
}) {
  const runtimeEvidence = {
    targetFile,
    targetSymbol: "verifiedTarget",
    evidenceSignature: "verified-runtime-evidence-signature"
  };
  return {
    success: true,
    ranAt: "2026-08-18T08:00:00.000Z",
    cycles: [{
      selectedTask: {
        task: "Repair verified runtime failure",
        source: "verified-runtime-evidence",
        targetFile,
        targetSymbol: "verifiedTarget",
        work: ["repair", "runtime-evidence"],
        runtimeEvidence
      },
      capabilityLoop: {
        success: true,
        steps: [{
          action: "development_pipeline",
          dispatchResult: {
            result: {
              result: {
                success: pipelineSuccess,
                dryRun,
                effectiveDryRun: dryRun,
                patchApplyEngine: {
                  success: applied,
                  applied
                }
              }
            }
          }
        }]
      },
      coreCheck: { success: coreCheckSuccess }
    }]
  };
}

function evidenceCount(projectPath, kind) {
  return readAutonomousRuntimeEvidence({ projectPath })
    .records.filter((record) => record.recordKind === kind)
    .length;
}

for (const [name, resultFactory] of [
  ["success-only", ({ targetFile }) => ({ success: true, cycles: [], targetFile })],
  ["not-applied", ({ targetFile }) => buildSuccessfulResult({ targetFile, applied: false })],
  ["dry-run", ({ targetFile }) => buildSuccessfulResult({ targetFile, dryRun: true, applied: false })],
  ["pipeline-failed", ({ targetFile }) => buildSuccessfulResult({ targetFile, pipelineSuccess: false })],
  ["corecheck-failed", ({ targetFile }) => buildSuccessfulResult({ targetFile, coreCheckSuccess: false })]
]) {
  const fixture = createFixture(`ash-runtime-evidence-${name}-`);
  const result = resultFactory(fixture);
  const recording = recordAutonomousDevelopmentResult({
    projectPath: fixture.projectPath,
    result
  });
  assert.strictEqual(
    recording.recorded,
    false,
    `${name} must not record successful-apply evidence.`
  );
  assert.strictEqual(
    evidenceCount(fixture.projectPath, "successful-apply"),
    0
  );
}

const nonApplyFixture = createFixture("ash-runtime-evidence-non-apply-suppression-");
const terminalFailure = {
  recordKind: "terminal-failure",
  terminal: true,
  unresolved: true,
  targetFile: nonApplyFixture.targetFile,
  targetSymbol: "verifiedTarget",
  targetSymbolVerified: true,
  targetResolutionStatus: "verified",
  failureStage: "corecheck",
  failureCode: "corecheck_failed",
  evidenceSignature: "verified-runtime-evidence-signature",
  targetFingerprint: nonApplyFixture.targetFingerprint,
  safetyRejectionOnly: false,
  recordedAt: "2026-08-18T07:00:00.000Z"
};
writeAutonomousRuntimeEvidenceRecord({
  projectPath: nonApplyFixture.projectPath,
  record: terminalFailure
});
recordAutonomousDevelopmentResult({
  projectPath: nonApplyFixture.projectPath,
  result: buildSuccessfulResult({
    targetFile: nonApplyFixture.targetFile,
    applied: false
  })
});
assert.strictEqual(
  selectVerifiedRuntimeEvidence({
    projectPath: nonApplyFixture.projectPath,
    records: readAutonomousRuntimeEvidence({
      projectPath: nonApplyFixture.projectPath
    }).records,
    activeCompletionRecords: []
  }).eligible.length,
  1,
  "A non-apply result must not suppress unresolved terminal evidence."
);

const appliedFixture = createFixture("ash-runtime-evidence-real-apply-");
const appliedResult = buildSuccessfulResult({
  targetFile: appliedFixture.targetFile
});
writeAutonomousCompletedTask({
  projectPath: appliedFixture.projectPath,
  task: appliedResult.cycles[0].selectedTask
});
const appliedRecording = recordAutonomousDevelopmentResult({
  projectPath: appliedFixture.projectPath,
  result: appliedResult
});
assert.strictEqual(appliedRecording.success, true);
assert.strictEqual(appliedRecording.recorded, true);
assert.strictEqual(
  evidenceCount(appliedFixture.projectPath, "successful-apply"),
  1
);

const stateFixture = createFixture("ash-runtime-state-ownership-");
const completedTask = {
  task: "Completed fixture task",
  source: "verified-runtime-evidence",
  targetFile: stateFixture.targetFile,
  targetSymbol: "verifiedTarget",
  work: ["repair"]
};
const unresolvedEvidence = {
  ...terminalFailure,
  targetFile: stateFixture.targetFile,
  targetSymbol: "unresolvedTarget",
  evidenceSignature: "unresolved-signature",
  targetFingerprint: stateFixture.targetFingerprint,
  recordedAt: "2026-08-18T05:00:00.000Z"
};
const resolvedFailure = {
  ...terminalFailure,
  targetFile: stateFixture.targetFile,
  targetFingerprint: stateFixture.targetFingerprint,
  evidenceSignature: "resolved-signature",
  recordedAt: "2026-08-18T04:00:00.000Z"
};
const formalCompletion = {
  recordKind: "formal-completion",
  targetFile: stateFixture.targetFile,
  targetSymbol: "verifiedTarget",
  evidenceSignature: null,
  targetFingerprint: stateFixture.targetFingerprint,
  recordedAt: "2026-08-18T06:00:00.000Z"
};
writeAutonomousCompletedTask({
  projectPath: stateFixture.projectPath,
  task: completedTask
});
writeAutonomousRuntimeEvidenceRecord({
  projectPath: stateFixture.projectPath,
  record: unresolvedEvidence
});
writeAutonomousRuntimeEvidenceRecord({
  projectPath: stateFixture.projectPath,
  record: resolvedFailure
});
writeAutonomousRuntimeEvidenceRecord({
  projectPath: stateFixture.projectPath,
  record: formalCompletion
});

const statePath = getLatestRuntimeStatePath(stateFixture.projectPath);
const beforeState = JSON.parse(fs.readFileSync(statePath, "utf8"));
beforeState.obsoleteTopLevelState = { mustNotSurvive: true };
fs.writeFileSync(statePath, JSON.stringify(beforeState, null, 2), "utf8");
const eligibilityBefore = selectVerifiedRuntimeEvidence({
  projectPath: stateFixture.projectPath,
  records: beforeState.autonomousDevelopment.runtimeEvidence,
  activeCompletionRecords: beforeState.autonomousDevelopment.completedTasks
});

writeRuntimeState({
  task: "Updated ordinary runtime",
  projectContext: {
    project: { id: "fixture-project", path: stateFixture.projectPath }
  },
  saveVerification: { saveCompleted: true },
  shutdownRuntime: { shutdownCompleted: true }
}, {
  projectPath: stateFixture.projectPath
});

const afterState = JSON.parse(fs.readFileSync(statePath, "utf8"));
assert.deepStrictEqual(
  afterState.autonomousDevelopment.completedTasks,
  beforeState.autonomousDevelopment.completedTasks
);
assert.deepStrictEqual(
  afterState.autonomousDevelopment.runtimeEvidence,
  beforeState.autonomousDevelopment.runtimeEvidence
);
assert.strictEqual(
  afterState.autonomousDevelopment.runtimeEvidence.some(
    (record) => record.recordKind === "formal-completion"
  ),
  true
);
assert.strictEqual(
  afterState.autonomousDevelopment.runtimeEvidence.some(
    (record) => record.recordKind === "terminal-failure" && record.unresolved === true
  ),
  true
);
assert.strictEqual(afterState.latestRuntime.task, "Updated ordinary runtime");
assert.strictEqual(afterState.latestRuntime.project, "fixture-project");
assert.strictEqual(afterState.latestRuntime.saveCompleted, true);
assert.strictEqual(afterState.latestRuntime.shutdownCompleted, true);
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(afterState, "obsoleteTopLevelState"),
  false,
  "Ordinary runtime state must be replaced rather than shallow-merged."
);
const eligibilityAfter = selectVerifiedRuntimeEvidence({
  projectPath: stateFixture.projectPath,
  records: afterState.autonomousDevelopment.runtimeEvidence,
  activeCompletionRecords: afterState.autonomousDevelopment.completedTasks
});
assert.deepStrictEqual(
  eligibilityAfter.eligible.map((record) => record.evidenceSignature),
  eligibilityBefore.eligible.map((record) => record.evidenceSignature)
);

const malformedFixture = createFixture("ash-runtime-state-malformed-");
const malformedPath = getLatestRuntimeStatePath(malformedFixture.projectPath);
fs.mkdirSync(path.dirname(malformedPath), { recursive: true });
const malformed = "{ malformed runtime evidence state";
fs.writeFileSync(malformedPath, malformed, "utf8");
assert.throws(
  () => writeRuntimeState(
    { task: "Must not overwrite malformed state" },
    { projectPath: malformedFixture.projectPath }
  ),
  /JSON/
);
assert.strictEqual(fs.readFileSync(malformedPath, "utf8"), malformed);

console.log(JSON.stringify({
  mode: "runtime-evidence-integrity-regression-test",
  success: true,
  nonApplySuccessRejected: true,
  realApplyRecorded: true,
  ordinaryRuntimeUpdated: true,
  autonomousEvidencePreserved: true,
  eligibilityMeaningPreserved: true,
  malformedStatePreserved: true
}, null, 2));
