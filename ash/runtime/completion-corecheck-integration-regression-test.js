"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  getPermanentRegressionChecks,
  runPermanentRegressionChecks,
  runCoreCheck
} = require("./corecheck-runtime");
const {
  runExistingRepairVerification
} = require("./autonomous-development-manager");

const repositoryChecks = getPermanentRegressionChecks();
assert(repositoryChecks.length > 0);
assert(repositoryChecks.every((check) => ["file", "symbol"].includes(check.coverage?.kind)));

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ash-completion-corecheck-"));
try {
  const git = (args) => {
    const result = spawnSync("git", args, { cwd: fixtureRoot, encoding: "utf8", shell: false });
    assert.strictEqual(result.status, 0, result.stderr);
  };
  git(["init"]);
  git(["config", "user.email", "ash-regression@example.invalid"]);
  git(["config", "user.name", "Ash Regression"]);
  fs.writeFileSync(path.join(fixtureRoot, "runtime.js"), "function target() { return 'before'; }\n", "utf8");
  fs.writeFileSync(path.join(fixtureRoot, "pass.js"), "process.exit(0);\n", "utf8");
  git(["add", "."]);
  git(["commit", "-m", "baseline"]);
  fs.writeFileSync(path.join(fixtureRoot, "runtime.js"), "function target() { return 'after'; }\n", "utf8");

  const fixtureCheck = {
    id: "fixture-symbol-regression",
    file: "./pass.js",
    args: [],
    coverage: { kind: "symbol", targetFiles: ["runtime.js"], targetSymbols: ["target"] }
  };
  const permanent = runPermanentRegressionChecks({ projectPath: fixtureRoot, checks: [fixtureCheck] });
  assert.strictEqual(permanent.success, true);
  assert.strictEqual(permanent.results[0].coverage.kind, "symbol");

  const coreCheck = runCoreCheck({
    projectPath: path.resolve(__dirname, "../.."),
    files: ["./ash-dev-verify.js"],
    providerBoundaryRequired: false,
    permanentRegressionChecksRunner: () => permanent
  });
  assert.strictEqual(coreCheck.success, true);
  assert.strictEqual(coreCheck.permanentRegressionChecksOk, true);

  const defaultCoreCheck = runCoreCheck({
    projectPath: path.resolve(__dirname, "../.."),
    providerBoundaryRequired: false,
    permanentRegressionChecksRunner: () => permanent
  });
  assert.strictEqual(defaultCoreCheck.success, true);
  const defaultNodeCheckFiles = defaultCoreCheck.nodeCheck.results.map(
    (result) => result.args?.[1]
  );
  for (const requiredFile of [
    "./ash/runtime/completion-evidence.js",
    "./ash/runtime/completion-coverage-kind-regression-test.js",
    "./ash/runtime/completion-corecheck-integration-regression-test.js",
    "./ash/runtime/openai-provider-enforcement-contract-regression-test.js",
    "./ash/runtime/openai-provider-retry-evidence-integration-regression-test.js"
  ]) {
    assert.ok(
      defaultNodeCheckFiles.includes(requiredFile),
      `Default CoreCheck node-check list omitted ${requiredFile}.`
    );
  }

  const verification = runExistingRepairVerification({
    projectPath: fixtureRoot,
    targetFile: "runtime.js",
    targetSymbol: "target",
    coverageKind: "symbol",
    regressionId: fixtureCheck.id,
    permanentRegressionChecks: [fixtureCheck],
    coreCheckRunner: () => coreCheck
  });
  assert.strictEqual(verification.success, true);
  assert.strictEqual(verification.completionSuccess, true);
  assert.strictEqual(verification.applied, false);
  assert.strictEqual(verification.coreCheck.success, true);

  console.log(JSON.stringify({
    mode: "completion-corecheck-integration-regression-test",
    success: true,
    registryContractVerified: true,
    permanentRunnerVerified: true,
    coreCheckCompositionVerified: true,
    defaultNodeCheckEnforcementVerified: true,
    existingRepairRouteVerified: true
  }, null, 2));
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
