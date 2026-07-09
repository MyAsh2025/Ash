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

function compareCleanupCandidates(a, b) {
  const riskRank = {
    low: 0,
    review: 1,
    protected: 2,
    medium: 3
  };

  const typeRank = {
    "temporary-file": 0,
    "backup-file": 1,
    "embedded-ash-folder": 2
  };

  const aRisk = riskRank[a.risk] ?? 99;
  const bRisk = riskRank[b.risk] ?? 99;

  if (aRisk !== bRisk) {
    return aRisk - bRisk;
  }

  const aType = typeRank[a.type] ?? 99;
  const bType = typeRank[b.type] ?? 99;

  if (aType !== bType) {
    return aType - bType;
  }

  const aAge = a.ageDays ?? -1;
  const bAge = b.ageDays ?? -1;

  if (aAge !== bAge) {
    return bAge - aAge;
  }

  return a.path.localeCompare(b.path);
}

function detectCleanupCandidates(files = [], projectPath = process.cwd()) {
  return files
    .map((file) => classifyCleanupCandidate(file, projectPath))
    .filter(Boolean)
    .sort(compareCleanupCandidates);
}

function assessCleanupGroup(group) {
  const hasProtected = group.risks.includes("protected");
  const hasLow = group.risks.includes("low");
  const hasTemporary = group.types.includes("temporary-file");

  if (hasProtected) {
    return {
      recommendation: "keep",
      reason: "Recent protected cleanup candidates exist in this group."
    };
  }

  if (group.candidateCount >= 20) {
    return {
      recommendation: "review",
      reason: "High backup accumulation detected."
    };
  }

  if (hasTemporary && group.oldestAgeDays !== null && group.oldestAgeDays >= 7) {
    return {
      recommendation: "review",
      reason: "Temporary artifacts are older than review threshold."
    };
  }

  if (hasLow) {
    return {
      recommendation: "candidate",
      reason: "Only older low-risk cleanup candidates detected."
    };
  }

  return {
    recommendation: "review",
    reason: "Cleanup candidates require verification before removal."
  };
}

function groupCleanupCandidates(cleanupCandidates = []) {
  const groups = new Map();

  for (const candidate of cleanupCandidates) {
    const groupKey = candidate.originalPath || candidate.path;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        originalPath: candidate.originalPath,
        originalExists: candidate.originalExists,
        groupKey,
        candidateCount: 0,
        types: [],
        risks: [],
        oldestAgeDays: null,
        newestAgeDays: null,
        totalSizeBytes: 0,
        candidates: []
      });
    }

    const group = groups.get(groupKey);

    group.candidateCount += 1;
    group.candidates.push(candidate);

    if (!group.types.includes(candidate.type)) {
      group.types.push(candidate.type);
    }

    if (!group.risks.includes(candidate.risk)) {
      group.risks.push(candidate.risk);
    }

    if (typeof candidate.ageDays === "number") {
      group.oldestAgeDays =
        group.oldestAgeDays === null
          ? candidate.ageDays
          : Math.max(group.oldestAgeDays, candidate.ageDays);

      group.newestAgeDays =
        group.newestAgeDays === null
          ? candidate.ageDays
          : Math.min(group.newestAgeDays, candidate.ageDays);
    }

    if (typeof candidate.sizeBytes === "number") {
      group.totalSizeBytes += candidate.sizeBytes;
    }
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      assessment: assessCleanupGroup(group)
    }))
    .sort((a, b) => {
      if (a.candidateCount !== b.candidateCount) {
        return b.candidateCount - a.candidateCount;
      }

      const aOldest = a.oldestAgeDays ?? -1;
      const bOldest = b.oldestAgeDays ?? -1;

      if (aOldest !== bOldest) {
        return bOldest - aOldest;
      }

      return a.groupKey.localeCompare(b.groupKey);
    });
}

function buildRepositoryHealth({
  findings = [],
  cleanupCandidates = [],
  cleanupCandidateGroups = []
} = {}) {
  const cleanupRecommendations = {
    keep: 0,
    review: 0,
    candidate: 0
  };

  for (const group of cleanupCandidateGroups) {
    const recommendation = group.assessment?.recommendation || "review";
    cleanupRecommendations[recommendation] =
      (cleanupRecommendations[recommendation] || 0) + 1;
  }

  const status =
    findings.length > 0
      ? "attention"
      : cleanupRecommendations.candidate > 0
        ? "cleanup-ready"
        : cleanupRecommendations.review > 0
          ? "moderate"
          : cleanupCandidates.length > 0
            ? "stable-with-artifacts"
            : "clean";

  const reason =
    status === "attention"
      ? "Repository findings require attention."
      : status === "cleanup-ready"
        ? "Cleanup candidates exist, but removal still requires verification."
        : status === "moderate"
          ? "Cleanup artifacts detected in report-only mode."
          : status === "stable-with-artifacts"
            ? "Artifacts detected but currently protected or retained."
            : "No repository findings or cleanup candidates detected.";

  return {
    status,
    reason,
    findingCount: findings.length,
    cleanupCandidateCount: cleanupCandidates.length,
    cleanupCandidateGroupCount: cleanupCandidateGroups.length,
    cleanupRecommendations,
    automaticDeletionAllowed: false
  };
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
  const cleanupCandidateGroups = groupCleanupCandidates(cleanupCandidates);
  const repositoryHealth = buildRepositoryHealth({
    findings,
    cleanupCandidates,
    cleanupCandidateGroups
  });

  return {

    mode: "repository-observation-runtime",

    version: "ash-local-runtime-v0.2",

    success: true,

    findings,
    findingCount: findings.length,
    cleanupCandidateCount: cleanupCandidates.length,
    cleanupCandidateGroupCount: cleanupCandidateGroups.length,
    cleanupCandidates,
    cleanupCandidateGroups,
    repositoryHealth,

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
  compareCleanupCandidates,
  groupCleanupCandidates,
  assessCleanupGroup,
  buildRepositoryHealth,
  shouldSkipFile

};
















