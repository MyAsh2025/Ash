"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  recordAutonomousDevelopmentResult,
  recordFormalCompletionEvidence,
  readAutonomousRuntimeEvidence,
  selectVerifiedRuntimeEvidence
} = require("./runtime-state");
const { observeRepository } = require("./repository-observation-runtime");
const { discoverTaskFromRepository } = require("./task-discovery-runtime");

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ash-root-cause-resolution-"));
const surfacedTargetFile = "ash/runtime/autonomous-development-manager.js";
const surfacedTargetSymbol = "runAutonomousDevelopmentManager";
const rootCauseTargetFile = "ash/runtime/controller-lifecycle-regression-test.js";
const rootCauseTargetSymbol = "main";
for (const [file, source] of [
  [surfacedTargetFile, "function runAutonomousDevelopmentManager() { return true; }\nmodule.exports = { runAutonomousDevelopmentManager };\n"],
  [rootCauseTargetFile, "async function main() { return true; }\nmodule.exports = { main };\n"]
]) {
  const absolute = path.join(fixtureRoot, file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, source, "utf8");
}

const failureResult = {
  success: false,
  stopped: true,
  stopReason: "corecheck_failed_post_rollback_verification_failed",
  failureStage: "corecheck",
  ranAt: "2026-08-18T12:41:22.540Z",
  pendingRepairTask: {
    targetFile: surfacedTargetFile,
    targetSymbol: surfacedTargetSymbol,
    failureStage: "corecheck",
    validatedOperations: [{
      file: surfacedTargetFile,
      targetSymbol: surfacedTargetSymbol,
      observedSymbolRange: { verified: true }
    }]
  },
  rollbackCoreCheck: {
    success: false,
    permanentRegressionChecks: {
      success: false,
      results: [{
        id: "controller-lifecycle",
        file: `./${rootCauseTargetFile}`,
        success: false,
        status: 1
      }]
    }
  }
};

const recordedFailure = recordAutonomousDevelopmentResult({
  projectPath: fixtureRoot,
  result: failureResult
});
assert.strictEqual(recordedFailure.recorded, true);
let records = readAutonomousRuntimeEvidence({ projectPath: fixtureRoot }).records;
const terminal = records.find((record) => record.recordKind === "terminal-failure");
assert.ok(terminal);
assert.deepStrictEqual(terminal.failedCheckIds, ["controller-lifecycle"]);
assert.strictEqual(
  selectVerifiedRuntimeEvidence({ projectPath: fixtureRoot, records }).eligible.length,
  1,
  "The post-rollback failure must remain eligible before verified root-cause resolution."
);

const successfulCoreCheck = {
  success: true,
  permanentRegressionChecks: {
    success: true,
    results: [
      { id: "controller-lifecycle", file: `./${rootCauseTargetFile}`, success: true },
      { id: "runtime-evidence-root-cause-resolution", success: true }
    ]
  }
};
const completionEvidence = {
  completionKind: "existing-repair-verification",
  completionEligible: true,
  completionSuccess: true,
  verificationSuccess: true,
  coreCheckSuccess: true,
  applied: false
};
const resolution = {
  evidenceSignature: terminal.evidenceSignature,
  failureStage: "corecheck",
  failedCheckId: "controller-lifecycle",
  rootCauseTargetFile,
  rootCauseTargetSymbol,
  repairRegressionId: "runtime-evidence-root-cause-resolution",
  verificationSet: "canonical-corecheck"
};

function selectionWith(extraRecords) {
  return selectVerifiedRuntimeEvidence({
    projectPath: fixtureRoot,
    records: [...records, ...extraRecords],
    activeCompletionRecords: []
  });
}

assert.strictEqual(selectionWith([{
  recordKind: "verified-resolution",
  evidenceSignature: terminal.evidenceSignature,
  failureStage: "corecheck",
  recordedAt: "2026-08-18T13:00:00.000Z"
}]).eligible.length, 1, "A newer timestamp alone must not resolve evidence.");

function createFailureFixture(prefix) {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  for (const file of [surfacedTargetFile, rootCauseTargetFile]) {
    const source = fs.readFileSync(path.join(fixtureRoot, file), "utf8");
    const absolute = path.join(projectPath, file);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, source, "utf8");
  }
  recordAutonomousDevelopmentResult({ projectPath, result: failureResult });
  return projectPath;
}

for (const [name, overrides] of [
  ["failed-canonical", { coreCheck: { ...successfulCoreCheck, success: false } }],
  ["dry-run", { completionEvidence: { ...completionEvidence, completionSuccess: false } }],
  ["ambiguous-root-cause", { resolution: { ...resolution, rootCauseTargetFile: null } }],
  ["wrong-failed-check", { resolution: { ...resolution, failedCheckId: "unrelated-check" } }]
]) {
  const isolatedRoot = createFailureFixture(`ash-resolution-${name}-`);
  const result = recordFormalCompletionEvidence({
    projectPath: isolatedRoot,
    targetFile: rootCauseTargetFile,
    targetSymbol: rootCauseTargetSymbol,
    completedAt: "2026-08-18T13:00:00.000Z",
    resolution: overrides.resolution || resolution,
    coreCheck: Object.prototype.hasOwnProperty.call(overrides, "coreCheck") ? overrides.coreCheck : successfulCoreCheck,
    completionEvidence: Object.prototype.hasOwnProperty.call(overrides, "completionEvidence") ? overrides.completionEvidence : completionEvidence
  });
  assert.strictEqual(result.resolutionRecorded, false, `${name} must not record a verified resolution.`);
}

const unrelatedApply = {
  recordKind: "successful-apply",
  targetFile: rootCauseTargetFile,
  targetSymbol: rootCauseTargetSymbol,
  evidenceSignature: "unrelated-signature",
  targetFingerprint: crypto.createHash("sha256").update("unrelated").digest("hex"),
  recordedAt: "2026-08-18T13:01:00.000Z"
};
assert.strictEqual(selectionWith([unrelatedApply]).eligible.length, 1);

const recordedResolution = recordFormalCompletionEvidence({
  projectPath: fixtureRoot,
  targetFile: rootCauseTargetFile,
  targetSymbol: rootCauseTargetSymbol,
  completedAt: "2026-08-18T13:02:00.000Z",
  resolution,
  coreCheck: successfulCoreCheck,
  completionEvidence
});
assert.strictEqual(recordedResolution.success, true);
assert.strictEqual(recordedResolution.resolutionRecorded, true);
records = readAutonomousRuntimeEvidence({ projectPath: fixtureRoot }).records;
assert.strictEqual(
  selectVerifiedRuntimeEvidence({ projectPath: fixtureRoot, records }).eligible.length,
  0,
  "Verified cross-target root-cause completion must suppress the exact stale failure."
);
fs.writeFileSync(
  path.join(fixtureRoot, rootCauseTargetFile),
  "async function main() { return false; }\nmodule.exports = { main };\n",
  "utf8"
);
assert.strictEqual(
  selectVerifiedRuntimeEvidence({ projectPath: fixtureRoot, records }).eligible.length,
  1,
  "A fingerprint-invalidated root-cause completion must not resolve evidence."
);
fs.writeFileSync(
  path.join(fixtureRoot, rootCauseTargetFile),
  "async function main() { return true; }\nmodule.exports = { main };\n",
  "utf8"
);
const observation = observeRepository({
  projectPath: fixtureRoot,
  scanTargets: [],
  runtimeEvidenceRecords: records,
  activeCompletionRecords: []
});
assert.strictEqual(observation.runtimeEvidenceFindings.length, 0);
assert.strictEqual(discoverTaskFromRepository({ observation }).discovered, false);

const restartedRecords = JSON.parse(JSON.stringify(
  readAutonomousRuntimeEvidence({ projectPath: fixtureRoot }).records
));
assert.strictEqual(
  selectVerifiedRuntimeEvidence({ projectPath: fixtureRoot, records: restartedRecords }).eligible.length,
  0,
  "Persisted verified resolution must survive process restart."
);

const unresolvedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ash-unresolved-evidence-"));
for (const file of [surfacedTargetFile, rootCauseTargetFile]) {
  const source = fs.readFileSync(path.join(fixtureRoot, file), "utf8");
  const absolute = path.join(unresolvedRoot, file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, source, "utf8");
}
recordAutonomousDevelopmentResult({ projectPath: unresolvedRoot, result: failureResult });
const unresolvedObservation = observeRepository({ projectPath: unresolvedRoot, scanTargets: [] });
assert.strictEqual(discoverTaskFromRepository({ observation: unresolvedObservation }).task.source, "verified-runtime-evidence");

console.log(JSON.stringify({
  mode: "runtime-evidence-root-cause-resolution-regression-test",
  success: true,
  postRollbackFailurePersisted: true,
  crossTargetResolutionVerified: true,
  falseResolutionRejected: true,
  staleRepairTaskSuppressed: true,
  unresolvedRepairTaskPreserved: true,
  restartPersistenceVerified: true
}, null, 2));
