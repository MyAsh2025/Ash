"use strict";

const fs = require("fs");
const path = require("path");

function normalizePatternList(patterns = []) {
  return Array.from(
    new Set(
      (Array.isArray(patterns) ? patterns : [])
        .filter(
          (pattern) =>
            typeof pattern === "string" &&
            pattern.trim().length > 0
        )
        .map((pattern) => pattern.trim())
    )
  );
}

function buildSymbolPatterns({
  targetSymbol = null,
  symbolType = null
} = {}) {
  const normalizedTargetSymbol =
    typeof targetSymbol === "string" &&
    targetSymbol.trim().length > 0
      ? targetSymbol.trim()
      : null;

  if (!normalizedTargetSymbol) {
    return [];
  }

  const normalizedSymbolType =
    typeof symbolType === "string"
      ? symbolType.trim().toLowerCase()
      : "";

  const patterns = [
    normalizedTargetSymbol,
    `${normalizedTargetSymbol}(`
  ];

  if (
    normalizedSymbolType === "function" ||
    normalizedSymbolType === "runtime-function"
  ) {
    patterns.unshift(
      `function ${normalizedTargetSymbol}`
    );
  }

  if (
    normalizedSymbolType === "class"
  ) {
    patterns.unshift(
      `class ${normalizedTargetSymbol}`
    );
  }

  return normalizePatternList(patterns);
}

function findAnchorsInFile(
  filePath,
  patterns = []
) {
  if (!fs.existsSync(filePath)) {
    return {
      filePath,
      exists: false,
      anchors: [],
      sourceText: "",
      lines: []
    };
  }

  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  const anchors = [];

  for (
    const pattern of normalizePatternList(patterns)
  ) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(pattern)) {
        anchors.push({
          pattern,
          line: i + 1,
          text: lines[i]
        });
      }
    }
  }

  return {
    filePath,
    exists: true,
    anchors,
    sourceText: text,
    lines
  };
}

function buildSurroundingContext({
  repositoryTargetResult = null,
  symbolAnchors = [],
  radius = 30
} = {}) {
  if (
    repositoryTargetResult?.exists !== true ||
    !Array.isArray(repositoryTargetResult.lines) ||
    repositoryTargetResult.lines.length === 0
  ) {
    return null;
  }

  const anchor =
    symbolAnchors[0] ||
    repositoryTargetResult.anchors?.[0] ||
    null;

  if (!anchor || !Number.isInteger(anchor.line)) {
    return null;
  }

  const anchorIndex =
    Math.max(0, anchor.line - 1);

  const normalizedRadius =
    Number.isInteger(radius) && radius > 0
      ? radius
      : 30;

  const startIndex =
    Math.max(0, anchorIndex - normalizedRadius);

  const endIndex =
    Math.min(
      repositoryTargetResult.lines.length,
      anchorIndex + normalizedRadius + 1
    );

  return {
    filePath:
      repositoryTargetResult.filePath || null,
    startLine: startIndex + 1,
    endLine: endIndex,
    anchorLine: anchor.line,
    anchorPattern: anchor.pattern || null,
    anchorText: anchor.text || null,
    text:
      repositoryTargetResult.lines
        .slice(startIndex, endIndex)
        .join("\n")
  };
}

function buildTargetLocator({
  patchPlanner
} = {}) {
  const root = process.cwd();

  const repositoryTargetFile =
    patchPlanner?.repositoryTargetFile || null;

  const targetSymbol =
    patchPlanner?.targetSymbol || null;

  const symbolType =
    patchPlanner?.symbolType || null;

  const symbolPatterns =
    buildSymbolPatterns({
      targetSymbol,
      symbolType
    });

  const repositoryPatterns =
    normalizePatternList([
      ...symbolPatterns,
      "TODO",
      "FIXME",
      "throw new Error",
      "NotImplemented",
      "stub",
      "module.exports"
    ]);

  const targets = [
    ...(repositoryTargetFile
      ? [
          {
            file: repositoryTargetFile,
            patterns: repositoryPatterns,
            role: "repository-target"
          }
        ]
      : []),
    {
      file: "ash/index.js",
      patterns: [
        "buildPatchPlanner",
        "runtimeResult.patchPlanner",
        "== Patch Planner =="
      ],
      role: "index-fallback"
    },
    {
      file: "ash/runtime/patch-planner.js",
      patterns: [
        "function buildPatchPlanner",
        "module.exports"
      ],
      role: "runtime-fallback"
    }
  ];

  const results = targets.map((target) => ({
    ...findAnchorsInFile(
      path.join(root, target.file),
      target.patterns
    ),
    role: target.role,
    requestedPatterns:
      normalizePatternList(target.patterns)
  }));

  const repositoryTargetResult =
    results.find(
      (result) =>
        result.role === "repository-target"
    ) || null;

  const symbolAnchors =
    repositoryTargetResult
      ? repositoryTargetResult.anchors.filter(
          (anchor) =>
            symbolPatterns.includes(anchor.pattern)
        )
      : [];

  const surroundingContext =
    buildSurroundingContext({
      repositoryTargetResult,
      symbolAnchors
    });

  return {
    mode: "target-locator-runtime",
    version:
      "ash-local-runtime-v0.2-concrete-symbol-location",
    required:
      patchPlanner?.needsPatchPlanning === true,
    targetProject:
      patchPlanner?.targetProject || null,
    repositoryTargetFile,
    targetSymbol,
    symbolType,
    symbolPatterns,
    symbolLocated:
      symbolAnchors.length > 0,
    symbolAnchors,
    surroundingContext,
    results,
    located:
      results.length > 0 &&
      results.every(
        (result) => result.exists
      ) &&
      results.some(
        (result) =>
          result.anchors.length > 0
      ),
    locatedAt:
      new Date().toISOString()
  };
}

module.exports = {
  buildTargetLocator,
  findAnchorsInFile,
  buildSymbolPatterns,
  normalizePatternList,
  buildSurroundingContext
};
