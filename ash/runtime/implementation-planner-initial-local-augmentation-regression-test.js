"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  buildImplementationPlanner
} = require("./implementation-planner");

const tempRoot =
  fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "ash-planner-initial-local-augmentation-"
    )
  );

try {
  const targetFile =
    path.join(
      tempRoot,
      "runtime-fixture.js"
    );

  fs.writeFileSync(
    targetFile,
    [
      '"use strict";',
      "",
      "function verifiedRuntimeTarget() {",
      "  return true;",
      "}",
      "",
      "module.exports = {",
      "  verifiedRuntimeTarget",
      "};",
      ""
    ].join("\n"),
    "utf8"
  );

  const plan =
    buildImplementationPlanner({
      task:
        "Improve verifiedRuntimeTarget with a minimal verified runtime extension.",
      targetFile,
      work: [
        "implementation"
      ],
      implementationType:
        "runtime-improvement",
      strategy:
        "add_minimal_verified_runtime_extension",
      recommendedOperation:
        "insert-before",
      confidence:
        "high",
      targetSymbol:
        "verifiedRuntimeTarget",
      symbolType:
        "function",
      expectedBehavior: [
        "Preserve the existing runtime target.",
        "Add only the verified local extension."
      ]
    });

  assert(
    plan &&
    typeof plan === "object",
    "Expected implementation planner result."
  );

  assert.strictEqual(
    plan.strategy,
    "add_minimal_verified_runtime_extension",
    "Minimal verified runtime extension strategy must be preserved."
  );

  assert.strictEqual(
    plan.targetSymbol,
    "verifiedRuntimeTarget",
    "Explicit verified target symbol must be preserved."
  );

  assert.strictEqual(
    plan.requestedRecommendedOperation,
    "insert-before",
    "Initial minimal extension must not rewrite the requested local operation to replace."
  );

  assert.strictEqual(
    plan.recommendedOperation,
    "insert-before",
    "Initial minimal verified runtime extension must remain a local insert operation."
  );

  assert.notStrictEqual(
    plan.recommendedOperation,
    "replace",
    "Initial minimal verified runtime extension must not become a destructive full-symbol replace."
  );

  console.log(
    JSON.stringify(
      {
        success: true,
        strategy:
          plan.strategy,
        targetSymbol:
          plan.targetSymbol,
        requestedRecommendedOperation:
          plan.requestedRecommendedOperation,
        recommendedOperation:
          plan.recommendedOperation
      },
      null,
      2
    )
  );

  console.log(
    "IMPLEMENTATION_PLANNER_INITIAL_LOCAL_AUGMENTATION_REGRESSION_PASS"
  );
} finally {
  fs.rmSync(
    tempRoot,
    {
      recursive: true,
      force: true
    }
  );
}