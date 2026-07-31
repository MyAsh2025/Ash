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

function isIdentifierCharacter(character = "") {
  return /[A-Za-z0-9_$]/.test(character);
}

function findFunctionDeclarationStart({
  sourceText = "",
  targetSymbol = ""
} = {}) {
  if (
    typeof sourceText !== "string" ||
    typeof targetSymbol !== "string" ||
    targetSymbol.trim().length === 0
  ) {
    return -1;
  }

  const symbol = targetSymbol.trim();
  const patterns = [
    `async function ${symbol}`,
    `function ${symbol}`
  ];

  for (const pattern of patterns) {
    let searchFrom = 0;

    while (searchFrom < sourceText.length) {
      const index =
        sourceText.indexOf(
          pattern,
          searchFrom
        );

      if (index < 0) {
        break;
      }

      const before =
        index > 0
          ? sourceText[index - 1]
          : "";

      const after =
        sourceText[
          index + pattern.length
        ] || "";

      if (
        !isIdentifierCharacter(before) &&
        !isIdentifierCharacter(after)
      ) {
        return index;
      }

      searchFrom =
        index + pattern.length;
    }
  }

  return -1;
}

function findOpeningBrace({
  sourceText = "",
  startOffset = 0
} = {}) {
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (
    let index = startOffset;
    index < sourceText.length;
    index += 1
  ) {
    const character = sourceText[index];
    const nextCharacter =
      sourceText[index + 1] || "";

    if (lineComment) {
      if (character === "\n") {
        lineComment = false;
      }

      continue;
    }

    if (blockComment) {
      if (
        character === "*" &&
        nextCharacter === "/"
      ) {
        blockComment = false;
        index += 1;
      }

      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (character === "\\") {
        escaped = true;
        continue;
      }

      if (character === quote) {
        quote = null;
      }

      continue;
    }

    if (
      character === "/" &&
      nextCharacter === "/"
    ) {
      lineComment = true;
      index += 1;
      continue;
    }

    if (
      character === "/" &&
      nextCharacter === "*"
    ) {
      blockComment = true;
      index += 1;
      continue;
    }

    if (
      character === '"' ||
      character === "'" ||
      character === "`"
    ) {
      quote = character;
      continue;
    }

    if (character === "{") {
      return index;
    }
  }

  return -1;
}

function findFunctionBodyOpeningBrace({
  sourceText = "",
  startOffset = 0
} = {}) {
  if (
    typeof sourceText !== "string" ||
    startOffset < 0 ||
    startOffset >= sourceText.length
  ) {
    return -1;
  }

  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  let parameterDepth = 0;
  let parameterListStarted = false;

  for (
    let index = startOffset;
    index < sourceText.length;
    index += 1
  ) {
    const character = sourceText[index];
    const nextCharacter =
      sourceText[index + 1] || "";

    if (lineComment) {
      if (character === "\n") {
        lineComment = false;
      }

      continue;
    }

    if (blockComment) {
      if (
        character === "*" &&
        nextCharacter === "/"
      ) {
        blockComment = false;
        index += 1;
      }

      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (character === "\\") {
        escaped = true;
        continue;
      }

      if (character === quote) {
        quote = null;
      }

      continue;
    }

    if (
      character === "/" &&
      nextCharacter === "/"
    ) {
      lineComment = true;
      index += 1;
      continue;
    }

    if (
      character === "/" &&
      nextCharacter === "*"
    ) {
      blockComment = true;
      index += 1;
      continue;
    }

    if (
      character === '"' ||
      character === "'" ||
      character === "`"
    ) {
      quote = character;
      continue;
    }

    if (character === "(") {
      parameterDepth += 1;
      parameterListStarted = true;
      continue;
    }

    if (
      character === ")" &&
      parameterListStarted
    ) {
      parameterDepth -= 1;

      if (parameterDepth < 0) {
        return -1;
      }

      continue;
    }

    if (
      character === "{" &&
      parameterListStarted &&
      parameterDepth === 0
    ) {
      return index;
    }
  }

  return -1;
}

function findMatchingClosingBrace({
  sourceText = "",
  openingBraceOffset = -1
} = {}) {
  if (
    openingBraceOffset < 0 ||
    sourceText[openingBraceOffset] !== "{"
  ) {
    return -1;
  }

  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (
    let index = openingBraceOffset;
    index < sourceText.length;
    index += 1
  ) {
    const character = sourceText[index];
    const nextCharacter =
      sourceText[index + 1] || "";

    if (lineComment) {
      if (character === "\n") {
        lineComment = false;
      }

      continue;
    }

    if (blockComment) {
      if (
        character === "*" &&
        nextCharacter === "/"
      ) {
        blockComment = false;
        index += 1;
      }

      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (character === "\\") {
        escaped = true;
        continue;
      }

      if (character === quote) {
        quote = null;
      }

      continue;
    }

    if (
      character === "/" &&
      nextCharacter === "/"
    ) {
      lineComment = true;
      index += 1;
      continue;
    }

    if (
      character === "/" &&
      nextCharacter === "*"
    ) {
      blockComment = true;
      index += 1;
      continue;
    }

    if (
      character === '"' ||
      character === "'" ||
      character === "`"
    ) {
      quote = character;
      continue;
    }

    if (character === "{") {
      depth += 1;
      continue;
    }

    if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        return index;
      }

      if (depth < 0) {
        return -1;
      }
    }
  }

  return -1;
}

function countLinesBefore(
  sourceText = "",
  offset = 0
) {
  return (
    sourceText
      .slice(0, offset)
      .split(/\r?\n/)
      .length
  );
}

function locateFullSymbolRange({
  filePath = null,
  targetSymbol = null,
  root = process.cwd()
} = {}) {
  if (
    typeof filePath !== "string" ||
    filePath.trim().length === 0 ||
    typeof targetSymbol !== "string" ||
    targetSymbol.trim().length === 0
  ) {
    return null;
  }

  const absolutePath =
    path.isAbsolute(filePath)
      ? filePath
      : path.join(root, filePath);

  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  const sourceText =
    fs.readFileSync(
      absolutePath,
      "utf8"
    );

  const startOffset =
    findFunctionDeclarationStart({
      sourceText,
      targetSymbol
    });

  if (startOffset < 0) {
    return null;
  }

  const openingBraceOffset =
    findFunctionBodyOpeningBrace({
      sourceText,
      startOffset
    });

  if (openingBraceOffset < 0) {
    return null;
  }

  const closingBraceOffset =
    findMatchingClosingBrace({
      sourceText,
      openingBraceOffset
    });

  if (closingBraceOffset < 0) {
    return null;
  }

  const endOffset =
    closingBraceOffset + 1;

  const source =
    sourceText.slice(
      startOffset,
      endOffset
    );

  if (
    !source.startsWith(
      `function ${targetSymbol}`
    ) &&
    !source.startsWith(
      `async function ${targetSymbol}`
    )
  ) {
    return null;
  }

  return {
    targetSymbol:
      targetSymbol.trim(),
    symbolType: "function",
    startOffset,
    endOffset,
    startLine:
      countLinesBefore(
        sourceText,
        startOffset
      ),
    endLine:
      countLinesBefore(
        sourceText,
        closingBraceOffset
      ),
    source,
    complete:
      source.length > 0,
    verified:
      source.length > 0
  };
}

function locateVerifiedLocalAnchor({
  filePath = null,
  targetSymbol = null,
  pattern = null,
  root = process.cwd()
} = {}) {
  const normalizedPattern =
    typeof pattern === "string"
      ? pattern.trim()
      : "";

  if (!normalizedPattern) {
    return null;
  }

  const symbolRange =
    locateFullSymbolRange({
      filePath,
      targetSymbol,
      root
    });

  if (
    !symbolRange ||
    symbolRange.verified !== true ||
    typeof symbolRange.source !== "string" ||
    symbolRange.source.length === 0
  ) {
    return null;
  }

  const matches = [];

  const linePattern =
    /.*(?:\r\n|\n|\r|$)/g;

  let lineMatch;

  while (
    (
      lineMatch =
        linePattern.exec(
          symbolRange.source
        )
    ) !== null
  ) {
    const rawLine =
      lineMatch[0];

    const lineContent =
      rawLine.replace(
        /(?:\r\n|\n|\r)$/,
        ""
      );

    if (
      lineContent.trim() ===
      normalizedPattern
    ) {
      const contentOffset =
        lineContent.indexOf(
          normalizedPattern
        );

      if (contentOffset < 0) {
        return null;
      }

      matches.push(
        lineMatch.index +
        contentOffset
      );
    }

    if (rawLine.length === 0) {
      break;
    }
  }

  if (matches.length !== 1) {
    return null;
  }

  const uniqueRelativeOffset =
    matches[0];

  const absoluteOffset =
    symbolRange.startOffset +
    uniqueRelativeOffset;

  const sourceText =
    fs.readFileSync(
      path.isAbsolute(filePath)
        ? filePath
        : path.join(root, filePath),
      "utf8"
    );

  return {
    targetSymbol:
      symbolRange.targetSymbol,
    symbolType:
      symbolRange.symbolType,

    pattern:
      normalizedPattern,

    relativeOffset:
      uniqueRelativeOffset,

    absoluteOffset,

    line:
      countLinesBefore(
        sourceText,
        absoluteOffset
      ),

    symbolRange: {
      startOffset:
        symbolRange.startOffset,
      endOffset:
        symbolRange.endOffset,
      startLine:
        symbolRange.startLine,
      endLine:
        symbolRange.endLine,
      verified:
        symbolRange.verified === true
    },

    uniqueInsideVerifiedSymbol:
      true,

    verified:
      true
  };
}

function normalizeTaskTerms(task = "") {
  const normalizedTask =
    String(task || "")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .toLowerCase();

  const ignoredTerms =
    new Set([
      "add",
      "build",
      "change",
      "create",
      "fix",
      "improve",
      "implement",
      "make",
      "update",
      "with",
      "from",
      "into",
      "for",
      "the",
      "and"
    ]);

  return Array.from(
    new Set(
      normalizedTask
        .split(/[^a-z0-9_$]+/)
        .map((term) => term.trim())
        .filter(
          (term) =>
            term.length >= 3 &&
            !ignoredTerms.has(term)
        )
    )
  );
}

function expandTaskTerm(term = "") {
  const aliases = {
    discovery: [
      "locator",
      "locate",
      "resolver",
      "resolution"
    ],
    discover: [
      "locator",
      "locate",
      "resolver"
    ],
    locating: [
      "locator",
      "locate"
    ],
    location: [
      "locator",
      "locate"
    ],
    resolve: [
      "resolver",
      "resolution"
    ],
    resolver: [
      "resolve",
      "resolution"
    ],
    planning: [
      "planner"
    ],
    plan: [
      "planner"
    ],
    execution: [
      "executor"
    ],
    execute: [
      "executor"
    ],
    generation: [
      "generator"
    ],
    generate: [
      "generator"
    ],
    validation: [
      "validator"
    ],
    validate: [
      "validator"
    ]
  };

  return normalizePatternList([
    term,
    ...(aliases[term] || [])
  ]);
}

function collectRepositoryJavaScriptFiles({
  root = process.cwd()
} = {}) {
  const scanDirectories = [
    "ash/runtime",
    "ash/capabilities",
    "ash/managers"
  ];

  const files = [];

  function visit(directory) {
    if (!fs.existsSync(directory)) {
      return;
    }

    for (
      const entry of
      fs.readdirSync(
        directory,
        {
          withFileTypes: true
        }
      )
    ) {
      const entryPath =
        path.join(
          directory,
          entry.name
        );

      if (entry.isDirectory()) {
        if (
          entry.name === "node_modules" ||
          entry.name === "backup" ||
          entry.name === ".sandbox"
        ) {
          continue;
        }

        visit(entryPath);
        continue;
      }

      if (
        !entry.isFile() ||
        !entry.name.endsWith(".js") ||
        /\.backup\./i.test(entry.name) ||
        /\.old$/i.test(entry.name) ||
        /\.tmp$/i.test(entry.name)
      ) {
        continue;
      }

      files.push(
        path
          .relative(root, entryPath)
          .replace(/\\/g, "/")
      );
    }
  }

  for (const scanDirectory of scanDirectories) {
    visit(
      path.join(
        root,
        scanDirectory
      )
    );
  }

  return Array.from(
    new Set(files)
  ).sort();
}

function tokenizeRepositoryFile(file = "") {
  return String(file || "")
    .replace(/\\/g, "/")
    .replace(/\.js$/i, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9_$]+/)
    .filter(Boolean);
}

function scoreRepositoryTarget({
  file,
  taskTerms,
  root = process.cwd()
} = {}) {
  const fileTerms =
    new Set(
      tokenizeRepositoryFile(file)
    );

  let score = 0;
  const matches = [];

  for (const taskTerm of taskTerms) {
    const expandedTerms =
      expandTaskTerm(taskTerm);

    if (fileTerms.has(taskTerm)) {
      score += 10;

      matches.push({
        taskTerm,
        matchedTerm: taskTerm,
        type: "file-term",
        weight: 10
      });

      continue;
    }

    const aliasMatch =
      expandedTerms.find(
        (expandedTerm) =>
          expandedTerm !== taskTerm &&
          fileTerms.has(expandedTerm)
      );

    if (aliasMatch) {
      score += 7;

      matches.push({
        taskTerm,
        matchedTerm: aliasMatch,
        type: "file-alias",
        weight: 7
      });
    }
  }

  if (score === 0) {
    return {
      file,
      score,
      matches
    };
  }

  const absolutePath =
    path.join(root, file);

  let sourceText = "";

  try {
    sourceText =
      fs.readFileSync(
        absolutePath,
        "utf8"
      ).toLowerCase();
  } catch (error) {
    return {
      file,
      score,
      matches
    };
  }

  for (const taskTerm of taskTerms) {
    if (
      sourceText.includes(taskTerm)
    ) {
      score += 1;

      matches.push({
        taskTerm,
        matchedTerm: taskTerm,
        type: "source-term",
        weight: 1
      });
    }
  }

  return {
    file,
    score,
    matches
  };
}

function resolveRepositoryTargetFromTask({
  task = "",
  root = process.cwd()
} = {}) {
  const taskTerms =
    normalizeTaskTerms(task);

  if (taskTerms.length === 0) {
    return {
      targetFile: null,
      resolved: false,
      ambiguous: false,
      score: 0,
      candidates: [],
      reason:
        "Task does not contain repository target terms."
    };
  }

  const candidates =
    collectRepositoryJavaScriptFiles({
      root
    })
      .map((file) =>
        scoreRepositoryTarget({
          file,
          taskTerms,
          root
        })
      )
      .filter(
        (candidate) =>
          candidate.score > 0
      )
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.file.localeCompare(right.file)
      );

  const bestCandidate =
    candidates[0] || null;

  const secondCandidate =
    candidates[1] || null;

  if (
    !bestCandidate ||
    bestCandidate.score < 10
  ) {
    return {
      targetFile: null,
      resolved: false,
      ambiguous: false,
      score:
        bestCandidate?.score || 0,
      candidates:
        candidates.slice(0, 5),
      reason:
        "No repository target reached the minimum confidence score."
    };
  }

  if (
    secondCandidate &&
    bestCandidate.score -
      secondCandidate.score < 3
  ) {
    return {
      targetFile: null,
      resolved: false,
      ambiguous: true,
      score: bestCandidate.score,
      candidates:
        candidates.slice(0, 5),
      reason:
        "Repository target resolution is ambiguous."
    };
  }

  return {
    targetFile: bestCandidate.file,
    resolved: true,
    ambiguous: false,
    score: bestCandidate.score,
    candidates:
      candidates.slice(0, 5),
    reason:
      "Repository target resolved from task terms."
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

  const localRepairIntent =
    patchPlanner?.localRepairIntent &&
    typeof patchPlanner.localRepairIntent === "object"
      ? patchPlanner.localRepairIntent
      : null;

  const localAnchorPattern =
    typeof localRepairIntent?.localAnchorPattern === "string"
      ? localRepairIntent.localAnchorPattern.trim()
      : "";

  const verifiedLocalAnchor =
    localRepairIntent?.requireVerifiedLocalAnchor === true &&
    repositoryTargetFile &&
    targetSymbol &&
    localAnchorPattern
      ? locateVerifiedLocalAnchor({
          filePath:
            repositoryTargetFile,
          targetSymbol,
          pattern:
            localAnchorPattern,
          root
        })
      : null;

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
    verifiedLocalAnchor:
      verifiedLocalAnchor
        ? {
            ...verifiedLocalAnchor
          }
        : null,
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
  buildSurroundingContext,
  locateFullSymbolRange,
  locateVerifiedLocalAnchor,
  resolveRepositoryTargetFromTask,
  collectRepositoryJavaScriptFiles,
  normalizeTaskTerms
};
