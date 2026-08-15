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
    "--retry-evidence-integration-self-check"
  ],
  {
    cwd: path.resolve(__dirname, "../.."),
    encoding: "utf8",
    shell: false,
    input: JSON.stringify({
      task: "Exercise the provider retry evidence production path.",
      targetFile: "ash/runtime/retry-regression-fixture.js",
      targetSymbol: "retryRegressionTarget",
      surroundingContext: {
        text: "function retryRegressionTarget() { return true; }"
      },
      currentTargetSource:
        "function retryRegressionTarget() { return true; }",
      completeTargetSource:
        "function retryRegressionTarget() { return true; }",
      requiredOutputShape: "module-fragment",
      recommendedOperation: "replace"
    })
  }
);

assert.strictEqual(
  execution.status,
  0,
  execution.stderr || execution.stdout
);

const result = JSON.parse(execution.stdout);

assert.strictEqual(result.success, false);
assert.strictEqual(result.retryAttempts, 3);
assert.strictEqual(result.retryLimit, 3);
assert.strictEqual(
  typeof result.retryViolation,
  "string"
);
assert.strictEqual(result.retryDiagnostics.length, 4);
assert.deepStrictEqual(
  result.retryDiagnostics.map((entry) => entry.attempt),
  [0, 1, 2, 3]
);
assert.strictEqual(
  result.repeatedGenerationViolation.detected,
  true
);
assert.strictEqual(
  result.repeatedGenerationViolation.occurrenceCount,
  4
);
assert.strictEqual(
  result.repeatedGenerationViolation
    .distinctRejectedImplementationCount,
  4
);
assert.strictEqual(
  result.repeatedGenerationViolation
    .generatedImplementationsChanged,
  true
);
assert.strictEqual(
  result.repeatedGenerationViolation
    .suspectedValidationOrGuidanceDefect,
  true
);
assert.strictEqual(result.requestId, "retry-regression-3");

console.log(JSON.stringify({
  mode: "openai-provider-retry-evidence-integration-regression-test",
  success: true,
  retryAttempts: result.retryAttempts,
  retryLimit: result.retryLimit,
  retryViolation: result.retryViolation,
  retryDiagnosticsCount: result.retryDiagnostics.length,
  repeatedGenerationViolation:
    result.repeatedGenerationViolation,
  requestId: result.requestId
}, null, 2));
