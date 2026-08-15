"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { rollbackAppliedPatch } = require("./patch-apply-engine");
const { buildRepairTask } = require("./autonomous-development-manager");
function runRegression() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ash-corecheck-rollback-regression-"));
  try {
    const relativeTarget = "ash/runtime/corecheck-rollback-fixture.js";
    const absoluteTarget = path.join(tempRoot, relativeTarget);
    fs.mkdirSync(path.dirname(absoluteTarget), { recursive: true });
    const original = '"use strict";\nmodule.exports = "original";\n';
    const changed = '"use strict";\nmodule.exports = "changed";\n';
    fs.writeFileSync(absoluteTarget, original, "utf8");
    const backupPath = `${absoluteTarget}.backup.patch-apply-regression`;
    fs.copyFileSync(absoluteTarget, backupPath);
    fs.writeFileSync(absoluteTarget, changed, "utf8");
    assert.notStrictEqual(fs.readFileSync(absoluteTarget, "utf8"), original);
    const rollbackEvidence = rollbackAppliedPatch({ patchApplyEngine: { success: true, applied: true, dryRun: false, results: [{ file: relativeTarget, success: true, dryRun: false, changed: true, backupPath }] }, projectPath: tempRoot });
    assert.strictEqual(rollbackEvidence.success, true, rollbackEvidence.reason);
    assert.strictEqual(fs.readFileSync(absoluteTarget, "utf8"), original);
    const repairTask = buildRepairTask({ failure: { failureStage: "corecheck", errorMessage: "CoreCheck failed.", failedAction: "corecheck", targetFile: relativeTarget, rollbackEvidence }, previousTask: { task: "Regression fixture task", targetFile: relativeTarget, targetSymbol: "fixtureSymbol" }, cycleIndex: 0 });
    assert.deepStrictEqual(repairTask.rollbackEvidence, rollbackEvidence);
    assert.strictEqual(repairTask.failureStage, "corecheck");
    console.log(JSON.stringify({ mode: "corecheck-apply-rollback-regression-test", success: true, restoredExactContent: true, rollbackAttempted: rollbackEvidence.attempted, rollbackSuccess: rollbackEvidence.success, repairFailureStage: repairTask.failureStage, repairTargetFile: repairTask.targetFile }, null, 2));
  } finally { fs.rmSync(tempRoot, { recursive: true, force: true }); }
}
try { runRegression(); } catch (error) { console.error(error?.stack || error?.message || String(error)); process.exitCode = 1; }
