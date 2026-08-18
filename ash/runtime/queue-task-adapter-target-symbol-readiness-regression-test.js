"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  adaptQueueItemForExecution
} = require("./queue-task-adapter");

const tempRoot = fs.mkdtempSync(
  path.join(
    os.tmpdir(),
    "ash-queue-target-symbol-readiness-"
  )
);

function writeFixture(fileName, lines) {
  const targetFile = path.join(
    tempRoot,
    fileName
  );

  fs.writeFileSync(
    targetFile,
    lines.join("\n"),
    "utf8"
  );

  return targetFile;
}

function adapt(item) {
  return adaptQueueItemForExecution({
    item,
    context: {
      projectPath: process.cwd()
    }
  });
}

try {
  const ambiguousTargetFile = writeFixture(
    "ambiguous-runtime.js",
    [
      '"use strict";',
      "",
      "function resolveAlpha() {",
      "  return true;",
      "}",
      "",
      "function resolveBeta() {",
      "  return true;",
      "}",
      "",
      "module.exports = {",
      "  resolveAlpha,",
      "  resolveBeta",
      "};",
      ""
    ]
  );

  const ambiguous = adapt({
    task:
      "Improve target resolution behavior without selecting an unverified function.",
    priority: "critical",
    source: "user-explicit-task",
    targetFile: ambiguousTargetFile,
    targetSymbol: null,
    work: ["self-evolution", "priority"]
  });

  assert.strictEqual(
    ambiguous.implementationPlanner.targetSymbol,
    null,
    "Ambiguous targetSymbol must remain unresolved."
  );
  assert.strictEqual(
    ambiguous.implementationPlanner.concretePlanReady,
    false,
    "An unresolved target symbol must not produce a concrete implementation plan."
  );
  assert.match(
    ambiguous.implementationPlanner
      .targetSymbolInference.source,
    /^ambiguous-/,
    "The fixture must produce explicit ambiguity evidence."
  );
  assert.ok(
    Array.isArray(
      ambiguous.implementationPlanner
        .targetSymbolInference.candidates
    ) &&
      ambiguous.implementationPlanner
        .targetSymbolInference.candidates.length === 2,
    "The fixture must retain both exported symbol candidates."
  );

  assert.strictEqual(
    ambiguous.success,
    false,
    "Queue Task Adapter must not treat unresolved target-symbol planning as successful."
  );
  assert.strictEqual(
    ambiguous.readyForPatchPlanning,
    false,
    "Queue Task Adapter must not mark an unresolved target symbol patch-ready."
  );
  assert.strictEqual(
    ambiguous.targetSymbolResolution?.targetSymbol,
    null,
    "Queue Task Adapter must not guess a target symbol."
  );
  assert.strictEqual(
    ambiguous.targetSymbolResolution?.status,
    "ambiguous",
    "Queue Task Adapter must classify the unresolved target as ambiguous."
  );
  assert.strictEqual(
    ambiguous.targetSymbolResolution?.inference?.source,
    ambiguous.implementationPlanner
      .targetSymbolInference.source,
    "Queue Task Adapter must preserve targetSymbolInference.source."
  );
  assert.deepStrictEqual(
    ambiguous.targetSymbolResolution?.inference
      ?.candidates,
    ambiguous.implementationPlanner
      .targetSymbolInference.candidates,
    "Queue Task Adapter must preserve inference candidates."
  );
  assert.deepStrictEqual(
    ambiguous.targetSymbolResolution?.inference
      ?.scoredCandidates,
    ambiguous.implementationPlanner
      .targetSymbolInference.scoredCandidates,
    "Queue Task Adapter must preserve available inference scoring evidence."
  );
  assert.match(
    ambiguous.reason,
    /target symbol.*ambiguous/i,
    "Adapter failure must identify target-symbol ambiguity before Provider handling."
  );
  assert.doesNotMatch(
    ambiguous.reason,
    /Implementation provider requires a target symbol/i,
    "The generic Provider target-symbol error must not be the Adapter's primary failure."
  );

  const normalProviderSuccessPath =
    ambiguous.success === true &&
    ambiguous.readyForPatchPlanning === true;

  assert.strictEqual(
    normalProviderSuccessPath,
    false,
    "Ambiguous target resolution must not enter the normal successful Provider path."
  );

  const explicit = adapt({
    task:
      "Improve target resolution behavior for the explicitly selected function.",
    priority: "critical",
    source: "user-explicit-task",
    targetFile: ambiguousTargetFile,
    targetSymbol: "resolveAlpha",
    symbolType: "function",
    expectedBehavior: [
      "Preserve explicit target selection."
    ],
    work: ["self-evolution", "priority"]
  });

  assert.strictEqual(
    explicit.success,
    true,
    "An explicit targetSymbol must remain successful."
  );
  assert.strictEqual(
    explicit.implementationPlanner.targetSymbol,
    "resolveAlpha",
    "An explicit targetSymbol must remain highest priority."
  );
  assert.strictEqual(
    explicit.readyForPatchPlanning,
    true,
    "An explicit targetSymbol must remain patch-ready."
  );

  const uniqueTargetFile = writeFixture(
    "unique-runtime.js",
    [
      '"use strict";',
      "",
      "function resolveOnlyTarget() {",
      "  return true;",
      "}",
      "",
      "module.exports = {",
      "  resolveOnlyTarget",
      "};",
      ""
    ]
  );

  const unique = adapt({
    task:
      "Improve the verified runtime behavior.",
    priority: "critical",
    source: "user-explicit-task",
    targetFile: uniqueTargetFile,
    targetSymbol: null,
    work: ["self-evolution", "priority"]
  });

  assert.strictEqual(
    unique.success,
    true,
    "A unique exported function must remain safely resolvable."
  );
  assert.strictEqual(
    unique.implementationPlanner.targetSymbol,
    "resolveOnlyTarget",
    "The unique exported function must be selected."
  );
  assert.strictEqual(
    unique.implementationPlanner
      .targetSymbolInference.source,
    "unique-exported-function",
    "Unique-export inference evidence must remain available."
  );
  assert.strictEqual(
    unique.readyForPatchPlanning,
    true,
    "A safely inferred unique target must remain patch-ready."
  );

  console.log(
    JSON.stringify(
      {
        mode:
          "queue-task-adapter-target-symbol-readiness-regression-test",
        success: true,
        ambiguous: {
          adapterSuccess: ambiguous.success,
          readyForPatchPlanning:
            ambiguous.readyForPatchPlanning,
          targetSymbol:
            ambiguous.targetSymbolResolution
              .targetSymbol,
          status:
            ambiguous.targetSymbolResolution.status,
          inference:
            ambiguous.targetSymbolResolution
              .inference,
          reason: ambiguous.reason,
          normalProviderSuccessPath
        },
        explicit: {
          adapterSuccess: explicit.success,
          targetSymbol:
            explicit.implementationPlanner
              .targetSymbol
        },
        unique: {
          adapterSuccess: unique.success,
          targetSymbol:
            unique.implementationPlanner
              .targetSymbol,
          inferenceSource:
            unique.implementationPlanner
              .targetSymbolInference.source
        }
      },
      null,
      2
    )
  );
} finally {
  fs.rmSync(tempRoot, {
    recursive: true,
    force: true
  });
}
