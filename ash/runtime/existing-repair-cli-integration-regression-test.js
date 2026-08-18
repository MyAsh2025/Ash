"use strict";

const assert = require("assert");
const path = require("path");
const { spawnSync } = require("child_process");

const projectPath = path.resolve(__dirname, "../..");
const execution = spawnSync(
  process.execPath,
  [
    "./ash-auto-dev.js",
    "--verify-existing-repair",
    "--coverage-kind",
    "symbol",
    "--target-file",
    "ash/runtime/completion-evidence.js",
    "--target-symbol",
    "evaluateExistingRepairEligibility",
    "--regression-id",
    "unregistered-cli-integration-regression",
    "--resolve-evidence-signature",
    "fixture-resolution-signature",
    "--resolve-failure-stage",
    "corecheck",
    "--resolve-failed-check-id",
    "fixture-failed-check",
    "--root-cause-target-file",
    "ash/runtime/fixture-regression-test.js",
    "--root-cause-target-symbol",
    "main"
  ],
  {
    cwd: projectPath,
    encoding: "utf8",
    shell: false
  }
);

assert.strictEqual(execution.status, 1, execution.stderr);
const output = JSON.parse(execution.stdout);
assert.strictEqual(output.route, "existing-repair-verification");
assert.strictEqual(output.success, false);
assert.strictEqual(output.completionEligible, false);
assert.strictEqual(output.completionSuccess, false);
assert.strictEqual(output.effectiveDryRun, true);
assert.strictEqual(output.applied, false);
assert.strictEqual(output.eligibility.coverageEvidence.requestedCoverageKind, "symbol");
assert.strictEqual(output.eligibility.fallbackAllowed, false);
assert.strictEqual(output.resolutionRequested, true);
assert.strictEqual(output.resolutionRecorded, false);

console.log(JSON.stringify({
  mode: "existing-repair-cli-integration-regression-test",
  success: true,
  cliArgumentsParsed: true,
  formalRouteExecuted: true,
  structuredCompletionReturned: true,
  ineligibleRequestRejected: true,
  resolutionArgumentsParsed: true
}, null, 2));
