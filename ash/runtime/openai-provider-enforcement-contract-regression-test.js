"use strict";

const assert = require("assert");
const path = require("path");
const { spawnSync } = require("child_process");

const execution = spawnSync(
  process.execPath,
  [
    path.resolve(
      __dirname,
      "../providers/openai-implementation-provider.mjs"
    ),
    "--enforcement-contract-self-check"
  ],
  {
    cwd: path.resolve(__dirname, "../.."),
    encoding: "utf8",
    shell: false
  }
);

assert.strictEqual(
  execution.status,
  0,
  execution.stderr || execution.stdout
);

const result = JSON.parse(execution.stdout);

assert.strictEqual(result.success, true);
assert.strictEqual(result.normalizedCompleteTargetSourcePreserved, true);
assert.strictEqual(result.generationGuardAcceptedValidContract, true);
assert.strictEqual(result.generationGuardRejectedMissingIndicators, true);
assert.strictEqual(result.generationGuardRejectedInventedParameters, true);
assert.strictEqual(result.generationGuardRejectedMissingVerifiedInput, true);
assert.strictEqual(result.generationGuardRejectedInventedParameterMembers, true);
assert.strictEqual(result.correctionGuidancePreservesExistingArguments, true);
assert.strictEqual(result.correctionGuidanceRequiresVerifiedInput, true);
assert.strictEqual(result.correctionGuidanceRequiresIndicators, true);

console.log(JSON.stringify({
  mode: "openai-provider-enforcement-contract-regression-test",
  ...result
}, null, 2));
