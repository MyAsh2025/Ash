"use strict";

const path = require("path");
const { spawnSync } = require("child_process");
const { locateFullSymbolRange } = require("./target-locator");

function normalizeRepositoryPath(value = "") {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "");
}

function runGit(projectPath, args) {
  return spawnSync("git", args, {
    cwd: projectPath,
    encoding: "utf8",
    shell: false
  });
}

function parseChangedLineRanges(diffText = "") {
  return Array.from(
    String(diffText || "").matchAll(
      /^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s+@@/gm
    ),
    (match) => {
      const start = Number(match[1]);
      const count = match[2] == null ? 1 : Number(match[2]);
      return {
        start,
        end: count > 0 ? start + count - 1 : start
      };
    }
  );
}

function findRegressionRegistration({
  permanentRegressionChecks = null,
  regressionId = null
} = {}) {
  const checks = Array.isArray(permanentRegressionChecks)
    ? permanentRegressionChecks
    : Array.isArray(permanentRegressionChecks?.results)
      ? permanentRegressionChecks.results
      : [];

  return checks.find((check) => check?.id === regressionId) || null;
}

function evaluateExistingRepairEligibility({
  projectPath = process.cwd(),
  targetFile = null,
  targetSymbol = null,
  coverageKind = null,
  regressionId = null,
  permanentRegressionChecks = null,
  previousPipelineResult = null
} = {}) {
  if (previousPipelineResult != null) {
    return {
      mode: "existing-repair-completion-eligibility",
      eligible: false,
      reason: "Existing-repair verification cannot be selected as a fallback after a patch pipeline result.",
      repositoryEvidence: null,
      coverageEvidence: null,
      evaluatedAt: new Date().toISOString()
    };
  }

  const normalizedTargetFile = normalizeRepositoryPath(targetFile);
  const normalizedTargetSymbol = String(targetSymbol || "").trim();
  const requestedCoverageKind =
    coverageKind === "file" || coverageKind === "symbol"
      ? coverageKind
      : null;
  const registration = findRegressionRegistration({
    permanentRegressionChecks,
    regressionId
  });
  const coverage = registration?.coverage || {};
  const registeredCoverageKind =
    coverage.kind === "file" || coverage.kind === "symbol"
      ? coverage.kind
      : null;
  const coveredFiles = Array.isArray(coverage.targetFiles)
    ? coverage.targetFiles.map(normalizeRepositoryPath)
    : [];
  const coveredSymbols = Array.isArray(coverage.targetSymbols)
    ? coverage.targetSymbols.map((value) => String(value || "").trim())
    : [];
  const explicitTargets = Array.isArray(coverage.targets)
    ? coverage.targets
    : [];
  const exactTarget = explicitTargets.find(
    (target) => normalizeRepositoryPath(target?.targetFile) === normalizedTargetFile
  );
  const exactTargetSymbols = Array.isArray(exactTarget?.targetSymbols)
    ? exactTarget.targetSymbols.map((value) => String(value || "").trim())
    : [];
  const coverageKindMatch =
    requestedCoverageKind != null &&
    requestedCoverageKind === registeredCoverageKind;
  const coverageTargetMatch =
    coverageKindMatch &&
    (explicitTargets.length > 0
      ? Boolean(exactTarget)
      : coveredFiles.includes(normalizedTargetFile)) &&
    (
      registeredCoverageKind === "file"
        ? normalizedTargetSymbol.length === 0 &&
          coveredSymbols.length === 0 &&
          exactTargetSymbols.length === 0
        : normalizedTargetSymbol.length > 0 &&
          (explicitTargets.length > 0
            ? exactTargetSymbols.includes(normalizedTargetSymbol)
            : coveredSymbols.includes(normalizedTargetSymbol))
    );

  const status = normalizedTargetFile
    ? runGit(projectPath, ["status", "--short", "--", normalizedTargetFile])
    : { status: 1, stdout: "", stderr: "A target file is required." };
  const statusText = String(status.stdout || "").trim();
  const fileChanged = status.status === 0 && statusText.length > 0;
  const untracked = /^\?\?\s/.test(statusText);
  const symbolRange =
    requestedCoverageKind === "symbol" &&
    normalizedTargetFile &&
    normalizedTargetSymbol
    ? locateFullSymbolRange({
        filePath: normalizedTargetFile,
        targetSymbol: normalizedTargetSymbol,
        root: projectPath
      })
    : null;
  const diff = normalizedTargetFile
    ? runGit(projectPath, ["diff", "--unified=0", "--", normalizedTargetFile])
    : { status: 1, stdout: "", stderr: "A target file is required." };
  const changedLineRanges = parseChangedLineRanges(diff.stdout || "");
  const targetSymbolChanged =
    requestedCoverageKind === "symbol" &&
    Boolean(symbolRange?.verified) &&
    (
      untracked ||
      changedLineRanges.some(
        (range) =>
          range.end >= symbolRange.startLine &&
          range.start <= symbolRange.endLine
      )
    );

  const repositoryEvidence = {
    targetFile: normalizedTargetFile || null,
    targetSymbol: normalizedTargetSymbol || null,
    coverageKind: requestedCoverageKind,
    fileChanged,
    statusShort: statusText,
    targetSymbolLocated: symbolRange?.verified === true,
    targetSymbolChanged,
    symbolRange: symbolRange
      ? {
          startLine: symbolRange.startLine,
          endLine: symbolRange.endLine,
          verified: symbolRange.verified === true
        }
      : null,
    changedLineRanges
  };
  const coverageEvidence = {
    regressionId: regressionId || null,
    coverageKind: registeredCoverageKind,
    requestedCoverageKind,
    registered: Boolean(registration),
    regressionPassed:
      registration?.success === true
        ? true
        : registration?.success === false
          ? false
          : null,
    targetMatch: coverageTargetMatch,
    coverage: registration?.coverage || null
  };
  const eligible =
    fileChanged &&
    (
      requestedCoverageKind === "file" ||
      targetSymbolChanged
    ) &&
    Boolean(registration) &&
    coverageTargetMatch;

  const reason = eligible
    ? "Repository change evidence and registered permanent regression coverage match the requested target."
    : !fileChanged
      ? "The target file is not present in the repository change set."
      : !requestedCoverageKind
        ? "An explicit file or symbol coverage kind is required."
      : !coverageKindMatch
        ? "Registered permanent regression coverage kind does not match the requested coverage kind."
      : requestedCoverageKind === "symbol" && !symbolRange?.verified
        ? "The target symbol could not be verified in production source."
        : requestedCoverageKind === "symbol" && !targetSymbolChanged
          ? "The target symbol is not part of the repository change set."
          : !registration
            ? "The requested permanent regression is not formally registered."
            : "Registered permanent regression coverage does not match the requested target.";

  return {
    mode: "existing-repair-completion-eligibility",
    version: "ash-local-runtime-v0.1-repository-evidence",
    eligible,
    selectionSource: "repository-evidence-only",
    fallbackAllowed: false,
    reason,
    repositoryEvidence,
    coverageEvidence,
    evaluatedAt: new Date().toISOString()
  };
}

function buildExistingRepairCompletionEvidence({
  eligibility = null,
  coreCheck = null,
  safetyRejection = null
} = {}) {
  const regressionId = eligibility?.coverageEvidence?.regressionId || null;
  const regressionResult = findRegressionRegistration({
    permanentRegressionChecks: coreCheck?.permanentRegressionChecks,
    regressionId
  });
  const regressionPassed = regressionResult?.success === true;
  const completionSuccess =
    eligibility?.eligible === true &&
    coreCheck?.success === true &&
    regressionPassed &&
    regressionResult?.coverage != null &&
    eligibility?.coverageEvidence?.targetMatch === true;

  return {
    mode: "completion-evidence",
    version: "ash-local-runtime-v0.1-distinct-completion-kinds",
    completionKind: "existing-repair-verification",
    completionEligible: eligibility?.eligible === true,
    completionSuccess,
    executionSuccess: true,
    patchCandidateSuccess: null,
    safetyGateSuccess:
      safetyRejection?.evaluated === true
        ? safetyRejection.success === true
        : null,
    verificationSuccess: completionSuccess,
    coreCheckSuccess: coreCheck?.success === true,
    applied: false,
    eligibility,
    regressionEvidence: regressionResult || null,
    safetyRejection: safetyRejection || null,
    reason: completionSuccess
      ? "Existing production repair is verified by repository evidence, matching permanent regression coverage, and CoreCheck."
      : "Existing-repair completion evidence is incomplete.",
    completedAt: new Date().toISOString()
  };
}

module.exports = {
  normalizeRepositoryPath,
  parseChangedLineRanges,
  findRegressionRegistration,
  evaluateExistingRepairEligibility,
  buildExistingRepairCompletionEvidence
};
