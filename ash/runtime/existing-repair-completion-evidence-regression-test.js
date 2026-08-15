"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  evaluateExistingRepairEligibility,
  buildExistingRepairCompletionEvidence
} = require("./completion-evidence");

function runGit(projectPath, args) {
  const result = spawnSync("git", args, {
    cwd: projectPath,
    encoding: "utf8",
    shell: false
  });

  assert.strictEqual(
    result.status,
    0,
    result.stderr || `git ${args.join(" ")} failed`
  );
}

const projectPath = fs.mkdtempSync(
  path.join(os.tmpdir(), "ash-existing-repair-evidence-")
);

try {
  runGit(projectPath, ["init"]);
  runGit(projectPath, ["config", "user.email", "ash-regression@example.invalid"]);
  runGit(projectPath, ["config", "user.name", "Ash Regression"]);

  const targetFile = "runtime/example.js";
  const absoluteTarget = path.join(projectPath, targetFile);
  fs.mkdirSync(path.dirname(absoluteTarget), { recursive: true });
  fs.writeFileSync(
    absoluteTarget,
    [
      '"use strict";',
      "",
      "function verifiedTarget() {",
      '  return "before";',
      "}",
      "",
      "function unchangedTarget() {",
      "  return true;",
      "}",
      "",
      "module.exports = { verifiedTarget, unchangedTarget };"
    ].join("\n"),
    "utf8"
  );
  runGit(projectPath, ["add", targetFile]);
  runGit(projectPath, ["commit", "-m", "baseline"]);

  fs.writeFileSync(
    absoluteTarget,
    fs.readFileSync(absoluteTarget, "utf8").replace(
      'return "before";',
      'return "after";'
    ),
    "utf8"
  );

  const regressionChecks = {
    success: true,
    results: [
      {
        id: "verified-target-regression",
        success: true,
        coverage: {
          kind: "symbol",
          targetFiles: [targetFile],
          targetSymbols: ["verifiedTarget"]
        }
      }
    ]
  };

  const eligible = evaluateExistingRepairEligibility({
    projectPath,
    targetFile,
    targetSymbol: "verifiedTarget",
    coverageKind: "symbol",
    regressionId: "verified-target-regression",
    permanentRegressionChecks: regressionChecks
  });

  assert.strictEqual(eligible.eligible, true, eligible.reason);
  assert.strictEqual(eligible.repositoryEvidence.fileChanged, true);
  assert.strictEqual(eligible.repositoryEvidence.targetSymbolChanged, true);
  assert.strictEqual(eligible.coverageEvidence.registered, true);
  assert.strictEqual(eligible.coverageEvidence.targetMatch, true);

  const unchangedSymbol = evaluateExistingRepairEligibility({
    projectPath,
    targetFile,
    targetSymbol: "unchangedTarget",
    coverageKind: "symbol",
    regressionId: "verified-target-regression",
    permanentRegressionChecks: regressionChecks
  });
  assert.strictEqual(unchangedSymbol.eligible, false);

  const unrelatedCoverage = evaluateExistingRepairEligibility({
    projectPath,
    targetFile,
    targetSymbol: "verifiedTarget",
    coverageKind: "symbol",
    regressionId: "unregistered-regression",
    permanentRegressionChecks: regressionChecks
  });
  assert.strictEqual(unrelatedCoverage.eligible, false);

  const forbiddenFallback = evaluateExistingRepairEligibility({
    projectPath,
    targetFile,
    targetSymbol: "verifiedTarget",
    coverageKind: "symbol",
    regressionId: "verified-target-regression",
    permanentRegressionChecks: regressionChecks,
    previousPipelineResult: {
      success: false,
      failureStage: "patch-validator"
    }
  });
  assert.strictEqual(forbiddenFallback.eligible, false);
  assert.strictEqual(
    forbiddenFallback.reason,
    "Existing-repair verification cannot be selected as a fallback after a patch pipeline result."
  );

  const completion = buildExistingRepairCompletionEvidence({
    eligibility: eligible,
    coreCheck: {
      success: true,
      permanentRegressionChecks: regressionChecks
    }
  });
  assert.strictEqual(completion.completionSuccess, true);
  assert.strictEqual(completion.completionKind, "existing-repair-verification");

  const safetyRejectionAlone = buildExistingRepairCompletionEvidence({
    eligibility: {
      ...eligible,
      eligible: false,
      reason: "A safety rejection alone is not completion evidence."
    },
    coreCheck: {
      success: true,
      permanentRegressionChecks: regressionChecks
    },
    safetyRejection: {
      evaluated: true,
      success: true,
      decision: "rejected"
    }
  });
  assert.strictEqual(safetyRejectionAlone.completionSuccess, false);

  console.log(JSON.stringify({
    mode: "existing-repair-completion-evidence-regression-test",
    success: true,
    checks: {
      repositoryEligibility: true,
      symbolDiffEligibility: true,
      registeredCoverageRequired: true,
      fallbackProhibited: true,
      safetyRejectionAloneRejected: true
    }
  }, null, 2));
} finally {
  fs.rmSync(projectPath, { recursive: true, force: true });
}
