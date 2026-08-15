"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  normalizeRepositoryPath,
  parseChangedLineRanges,
  findRegressionRegistration,
  evaluateExistingRepairEligibility
} = require("./completion-evidence");

assert.strictEqual(normalizeRepositoryPath(".\\runtime.js"), "runtime.js");
assert.deepStrictEqual(
  parseChangedLineRanges("@@ -1,2 +4,3 @@\n"),
  [{ start: 4, end: 6 }]
);

function git(projectPath, args) {
  const result = spawnSync("git", args, {
    cwd: projectPath,
    encoding: "utf8",
    shell: false
  });
  assert.strictEqual(result.status, 0, result.stderr);
}

const projectPath = fs.mkdtempSync(
  path.join(os.tmpdir(), "ash-completion-coverage-kind-")
);

try {
  git(projectPath, ["init"]);
  git(projectPath, ["config", "user.email", "ash-regression@example.invalid"]);
  git(projectPath, ["config", "user.name", "Ash Regression"]);

  fs.writeFileSync(path.join(projectPath, "CONTRACT.md"), "# Contract\nBefore\n", "utf8");
  fs.writeFileSync(path.join(projectPath, "UNRELATED.md"), "# Unrelated\nBefore\n", "utf8");
  fs.writeFileSync(path.join(projectPath, "runtime.js"), "function target() { return 'before'; }\n", "utf8");
  git(projectPath, ["add", "."]);
  git(projectPath, ["commit", "-m", "baseline"]);

  fs.writeFileSync(path.join(projectPath, "CONTRACT.md"), "# Contract\nAfter\n", "utf8");
  fs.writeFileSync(path.join(projectPath, "UNRELATED.md"), "# Unrelated\nAfter\n", "utf8");
  fs.writeFileSync(path.join(projectPath, "runtime.js"), "function target() { return 'after'; }\n", "utf8");

  const checks = [
    {
      id: "contract-file-regression",
      success: true,
      coverage: {
        kind: "file",
        targetFiles: ["CONTRACT.md"]
      }
    },
    {
      id: "runtime-symbol-regression",
      success: true,
      coverage: {
        kind: "symbol",
        targetFiles: ["runtime.js"],
        targetSymbols: ["target"]
      }
    },
    {
      id: "ambiguous-coverage-regression",
      success: true,
      coverage: {
        targetFiles: ["CONTRACT.md"]
      }
    }
  ];

  assert.strictEqual(
    findRegressionRegistration({
      permanentRegressionChecks: checks,
      regressionId: "contract-file-regression"
    }),
    checks[0]
  );

  const fileEligible = evaluateExistingRepairEligibility({
    projectPath,
    targetFile: "CONTRACT.md",
    targetSymbol: null,
    coverageKind: "file",
    regressionId: "contract-file-regression",
    permanentRegressionChecks: checks
  });
  assert.strictEqual(fileEligible.eligible, true, fileEligible.reason);
  assert.strictEqual(fileEligible.coverageEvidence.coverageKind, "file");

  const unrelatedFile = evaluateExistingRepairEligibility({
    projectPath,
    targetFile: "UNRELATED.md",
    targetSymbol: null,
    coverageKind: "file",
    regressionId: "contract-file-regression",
    permanentRegressionChecks: checks
  });
  assert.strictEqual(unrelatedFile.eligible, false);

  const symbolAsFile = evaluateExistingRepairEligibility({
    projectPath,
    targetFile: "runtime.js",
    targetSymbol: null,
    coverageKind: "file",
    regressionId: "runtime-symbol-regression",
    permanentRegressionChecks: checks
  });
  assert.strictEqual(symbolAsFile.eligible, false);

  const fileAsSymbol = evaluateExistingRepairEligibility({
    projectPath,
    targetFile: "CONTRACT.md",
    targetSymbol: "target",
    coverageKind: "symbol",
    regressionId: "contract-file-regression",
    permanentRegressionChecks: checks
  });
  assert.strictEqual(fileAsSymbol.eligible, false);

  const omittedKind = evaluateExistingRepairEligibility({
    projectPath,
    targetFile: "CONTRACT.md",
    targetSymbol: null,
    coverageKind: "file",
    regressionId: "ambiguous-coverage-regression",
    permanentRegressionChecks: checks
  });
  assert.strictEqual(omittedKind.eligible, false);

  fs.writeFileSync(path.join(projectPath, "UNCHANGED.md"), "# Stable\n", "utf8");
  git(projectPath, ["add", "UNCHANGED.md"]);
  git(projectPath, ["commit", "-m", "add unchanged contract"]);
  checks.push({
    id: "unchanged-file-regression",
    success: true,
    coverage: { kind: "file", targetFiles: ["UNCHANGED.md"] }
  });
  const unchanged = evaluateExistingRepairEligibility({
    projectPath,
    targetFile: "UNCHANGED.md",
    targetSymbol: null,
    coverageKind: "file",
    regressionId: "unchanged-file-regression",
    permanentRegressionChecks: checks
  });
  assert.strictEqual(unchanged.eligible, false);

  console.log(JSON.stringify({
    mode: "completion-coverage-kind-regression-test",
    success: true,
    checks: {
      explicitFileCoverage: true,
      unrelatedFileRejected: true,
      symbolPromotionRejected: true,
      kindMismatchRejected: true,
      omittedKindRejected: true,
      unchangedFileRejected: true
    }
  }, null, 2));
} finally {
  fs.rmSync(projectPath, { recursive: true, force: true });
}
