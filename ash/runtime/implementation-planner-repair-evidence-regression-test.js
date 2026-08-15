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
      "ash-planner-repair-evidence-"
    )
  );

try {
  const targetFile =
    path.join(
      tempRoot,
      "validator-fixture.js"
    );

  fs.writeFileSync(
    targetFile,
    [
      '"use strict";',
      "",
      "function validateAlpha() {",
      "  return true;",
      "}",
      "",
      "function validateRepairContract() {",
      "  return true;",
      "}",
      "",
      "function validateOmega() {",
      "  return true;",
      "}",
      "",
      "module.exports = {",
      "  validateAlpha,",
      "  validateRepairContract,",
      "  validateOmega",
      "};",
      ""
    ].join("\n"),
    "utf8"
  );

  const resolved =
    buildImplementationPlanner({
      task:
        "Repair the rejected validator improvement using preserved failure evidence.",
      targetFile,
      repairAction:
        "repair_patch",
      failureStage:
        "patch-validator",
      errorMessage:
        "Generated repair for validateRepairContract failed validation.",
      issues: [
        {
          message:
            "Preserve validateRepairContract behavior."
        }
      ],
      previousTask: {
        task:
          "Repair validator behavior without replacing unrelated exports.",
        targetFile
      }
    });

  assert.strictEqual(
    resolved.targetSymbol,
    "validateRepairContract",
    "Unique repair evidence should resolve the exported function."
  );

  const ambiguous =
    buildImplementationPlanner({
      task:
        "Repair validator behavior.",
      targetFile,
      repairAction:
        "repair_patch",
      failureStage:
        "patch-validator",
      errorMessage:
        "validateAlpha and validateOmega both require repair.",
      previousTask: {
        task:
          "Repair validator behavior.",
        targetFile
      }
    });

  assert.strictEqual(
    ambiguous.targetSymbol,
    null,
    "Ambiguous repair evidence must remain unresolved."
  );

  const explicit =
    buildImplementationPlanner({
      task:
        "Repair validateRepairContract.",
      targetFile,
      targetSymbol:
        "validateAlpha",
      repairAction:
        "repair_patch",
      failureStage:
        "patch-validator",
      errorMessage:
        "validateRepairContract failed."
    });

  assert.strictEqual(
    explicit.targetSymbol,
    "validateAlpha",
    "Explicit targetSymbol must remain higher priority."
  );

  console.log(
    JSON.stringify(
      {
        success: true,
        checks: {
          uniqueRepairEvidenceResolved:
            resolved.targetSymbol ===
            "validateRepairContract",
          ambiguousRepairEvidenceRejected:
            ambiguous.targetSymbol === null,
          explicitTargetPreserved:
            explicit.targetSymbol ===
            "validateAlpha"
        }
      },
      null,
      2
    )
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