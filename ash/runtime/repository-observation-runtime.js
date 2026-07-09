"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_SCAN = [
  "ash/runtime",
  "ash/capabilities",
  "ash/managers"
];

function collectFiles(base, dir) {
  const target = path.join(base, dir);

  if (!fs.existsSync(target)) {
    return [];
  }

  const result = [];

  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);

      if (entry.isDirectory()) {
        walk(full);
        continue;
      }

      result.push(full);
    }
  }

  walk(target);

  return result;
}

function reconstructOriginalPath(relative) {
  const knownExtensions = [
    ".js",
    ".json",
    ".md",
    ".txt",
    ".ps1",
    ".ts",
    ".tsx",
    ".jsx"
  ];

  for (const ext of knownExtensions) {
    const marker = ext + ".backup.";

    if (relative.includes(marker)) {
      return relative.slice(0, relative.indexOf(marker) + ext.length);
    }
  }

  const backupIndex = relative.indexOf(".backup.");

  if (backupIndex === -1) {
    return null;
  }

  const ext = path.extname(relative);

  if (!ext) {
    return null;
  }

  const withoutExt = relative.slice(0, -ext.length);
  const reconstructed = withoutExt.replace(/\.backup\..*$/, "") + ext;

  return reconstructed === relative ? null : reconstructed;
}

function classifyCleanupCandidate(file, projectPath = process.cwd()) {
  const relative = path.relative(projectPath, file).replace(/\\/g, "/");
  const normalized = relative.toLowerCase();

  const stat = fs.existsSync(file)
    ? fs.statSync(file)
    : null;

  const modifiedAt = stat?.mtime ?? null;
  const sizeBytes = stat?.size ?? null;

  const ageDays = modifiedAt
    ? Math.floor((Date.now() - modifiedAt.getTime()) / 86400000)
    : null;

  const cleanupRisk =
    ageDays === null
      ? "review"
      : ageDays < 7
        ? "protected"
        : ageDays < 30
          ? "review"
          : "low";

  const cleanupRecommendedAction =
    cleanupRisk === "low"
      ? "verify-unused-then-remove"
      : "keep-until-older-or-reviewed";

  const originalPath = normalized.includes(".backup.")
    ? reconstructOriginalPath(relative)
    : null;

  const originalExists = originalPath
    ? fs.existsSync(path.join(projectPath, originalPath))
    : null;

  if (
    normalized.includes(".backup.") ||
    normalized.includes(".backup/") ||
    normalized.match(/\.backup\.[0-9]+$/)
  ) {
    return {
      path: relative,
      type: "backup-file",
      risk: cleanupRisk,
      referenced: "unverified",
      recommendedAction: cleanupRecommendedAction,
      reason: "Backup artifact detected.",
      modifiedAt,
      ageDays,
      sizeBytes,
      originalPath,
      originalExists
    };
  }

  if (
    normalized.includes("/.sandbox/") ||
    normalized.includes("/tmp/") ||
    normalized.includes("/temp/") ||
    normalized.endsWith(".tmp")
  ) {
    return {
      path: relative,
      type: "temporary-file",
      risk: cleanupRisk,
      referenced: "unverified",
      recommendedAction: cleanupRecommendedAction,
      reason: "Temporary artifact detected.",
      modifiedAt,
      ageDays,
      sizeBytes,
      originalPath,
      originalExists
    };
  }

  const projectName = path.basename(projectPath).toLowerCase();

  if (
    projectName !== "ash" &&
    (
      normalized === "ash" ||
      normalized.startsWith("ash/")
    )
  ) {
    return {
      path: relative,
      type: "embedded-ash-folder",
      risk: "medium",
      referenced: "unverified",
      recommendedAction: "verify-references-before-removal",
      reason: "Possible duplicate or embedded Ash folder detected."
    };
  }

  return null;
}

function detectCleanupCandidates(files = [], projectPath = process.cwd()) {
  return files
    .map((file) => classifyCleanupCandidate(file, projectPath))
    .filter(Boolean);
}

function shouldSkipFile(file) {
  const normalized = file.replace(/\\/g, "/");

  return (
    normalized.includes(".backup.") ||
    normalized.includes("/.sandbox/") ||
    normalized.endsWith("repository-observation-runtime.js")
  );
}

function detectWork(file) {
  if (shouldSkipFile(file)) {
    return [];
  }

  const text = fs.readFileSync(file, "utf8");

  const work = [];

  if (/TODO|FIXME|XXX/i.test(text)) {
    work.push("todo");
  }

  if (/throw new Error|NotImplemented|stub/i.test(text)) {
    work.push("implementation");
  }

  if (/continue_autonomous_development/.test(text)) {
    work.push("execution");
  }

  return work;
}

function observeRepository({
  projectPath = process.cwd(),
  scanTargets = DEFAULT_SCAN
} = {}) {

  const findings = [];
  const scannedFiles = [];

  for (const dir of scanTargets) {

    const files = collectFiles(projectPath, dir);
    scannedFiles.push(...files);

    for (const file of files) {

      const work = detectWork(file);

      if (work.length === 0) {
        continue;
      }

      findings.push({
        file: path.relative(projectPath, file),
        work,
        priority:
          work.includes("implementation")
            ? "high"
            : "normal"
      });

    }

  }

  findings.sort((a, b) => {

    if (a.priority === b.priority) return 0;

    return a.priority === "high" ? -1 : 1;

  });

  const cleanupCandidates = detectCleanupCandidates(scannedFiles, projectPath);

  return {

    mode: "repository-observation-runtime",

    version: "ash-local-runtime-v0.2",

    success: true,

    findings,
    findingCount: findings.length,
    cleanupCandidateCount: cleanupCandidates.length,
    cleanupCandidates,

    nextTask:

      findings.length === 0
        ? null
        : findings[0],

    observedAt: new Date().toISOString()

  };

}

module.exports = {

  observeRepository,
  detectCleanupCandidates,
  classifyCleanupCandidate,
  shouldSkipFile

};












