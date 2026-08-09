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

  const localDeclarations =
    Array.from(
      new Set(
        Array.from(
          source.matchAll(
            /(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\b/g
          ),
          (match) =>
            match[1]
        )
      )
    );

  return {
    targetSymbol:
      targetSymbol.trim(),
    symbolType: "function",
    localDeclarations,
    startOffset,
    openingBraceOffset,
    bodyStartOffset:
      openingBraceOffset + 1,
    endOffset,
    startLine:
      countLinesBefore(
        sourceText,
        startOffset
      ),
    openingBraceLine:
      countLinesBefore(
        sourceText,
        openingBraceOffset
      ),
    bodyStartLine:
      countLinesBefore(
        sourceText,
        openingBraceOffset
      ),
    openingBraceLineText:
      sourceText
        .slice(
          sourceText.lastIndexOf(
            "\n",
            openingBraceOffset
          ) + 1,
          sourceText.indexOf(
            "\n",
            openingBraceOffset
          ) >= 0
            ? sourceText.indexOf(
                "\n",
                openingBraceOffset
              )
            : sourceText.length
        )
        .replace(/\r$/, "")
        .trim(),
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

function locateFunctionBodyAnchor({
  filePath = null,
  targetSymbol = null,
  root = process.cwd()
} = {}) {
  const symbolRange =
    locateFullSymbolRange({
      filePath,
      targetSymbol,
      root
    });

  if (
    !symbolRange ||
    symbolRange.verified !== true ||
    typeof symbolRange.openingBraceLineText !== "string" ||
    symbolRange.openingBraceLineText.length === 0
  ) {
    return null;
  }

  return {
    verified: true,
    anchorType:
      "function-body-opening",
    targetSymbol:
      symbolRange.targetSymbol,
    symbolType:
      symbolRange.symbolType,
    pattern:
      symbolRange.openingBraceLineText,
    line:
      symbolRange.openingBraceLine,
    offset:
      symbolRange.openingBraceOffset,
    insertionOffset:
      symbolRange.bodyStartOffset,
    operation:
      "insert-after",
    existingLocalDeclarations:
      Array.isArray(
        symbolRange.localDeclarations
      )
        ? [
            ...symbolRange.localDeclarations
          ]
        : [],
    symbolRange: {
      startOffset:
        symbolRange.startOffset,
      openingBraceOffset:
        symbolRange.openingBraceOffset,
      bodyStartOffset:
        symbolRange.bodyStartOffset,
      endOffset:
        symbolRange.endOffset,
      startLine:
        symbolRange.startLine,
      openingBraceLine:
        symbolRange.openingBraceLine,
      endLine:
        symbolRange.endLine,
      verified:
        symbolRange.verified === true
    }
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

function tokenizeSemanticValue(value = "") {
  const ignoredTerms =
    new Set([
      "async",
      "class",
      "const",
      "false",
      "function",
      "let",
      "module",
      "null",
      "require",
      "return",
      "true",
      "undefined",
      "var"
    ]);

  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/\.js$/i, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9_$]+/)
    .map((term) => term.trim())
    .filter(
      (term) =>
        term.length >= 3 &&
        !ignoredTerms.has(term)
    );
}

function buildCompoundSemanticTerms(terms = []) {
  const normalizedTerms =
    Array.isArray(terms)
      ? terms.filter(Boolean)
      : [];

  const compoundTerms = [];

  for (
    let index = 0;
    index < normalizedTerms.length - 1;
    index += 1
  ) {
    compoundTerms.push(
      `${normalizedTerms[index]}-${normalizedTerms[index + 1]}`
    );
  }

  for (
    let index = 0;
    index < normalizedTerms.length - 2;
    index += 1
  ) {
    compoundTerms.push(
      `${normalizedTerms[index]}-${normalizedTerms[index + 1]}-${normalizedTerms[index + 2]}`
    );
  }

  return Array.from(
    new Set(compoundTerms)
  );
}

function buildActionResponsibilityProfiles(
  symbols = []
) {
  const actionTerms =
    new Set([
      "build",
      "create",
      "execute",
      "find",
      "generate",
      "hydrate",
      "infer",
      "locate",
      "normalize",
      "parse",
      "register",
      "resolve",
      "run",
      "validate"
    ]);

  return symbols
    .map((symbol) => {
      const terms =
        tokenizeSemanticValue(symbol);

      const actionIndex =
        terms.findIndex(
          (term) =>
            actionTerms.has(term)
        );

      if (
        actionIndex < 0 ||
        actionIndex >= terms.length - 1
      ) {
        return null;
      }

      return {
        symbol,
        action:
          terms[actionIndex],
        objectTerms:
          Array.from(
            new Set(
              terms.slice(
                actionIndex + 1
              )
            )
          )
      };
    })
    .filter(Boolean);
}

function extractTaskActionProfile(task = "") {
  const terms =
    tokenizeSemanticValue(task);

  const actionTerms =
    new Set([
      "build",
      "create",
      "execute",
      "find",
      "generate",
      "hydrate",
      "infer",
      "locate",
      "normalize",
      "parse",
      "register",
      "resolve",
      "run",
      "validate"
    ]);

  const actionIndex =
    terms.findIndex(
      (term) =>
        actionTerms.has(term)
    );

  if (
    actionIndex < 0 ||
    actionIndex >= terms.length - 1
  ) {
    return null;
  }

  return {
    action:
      terms[actionIndex],
    objectTerms:
      Array.from(
        new Set(
          terms.slice(
            actionIndex + 1
          )
        )
      )
  };
}

function scoreActionResponsibility({
  taskProfile = null,
  profiles = [],
  baseWeight = 0,
  overlapWeight = 0
} = {}) {
  if (!taskProfile) {
    return null;
  }

  let bestMatch = null;

  for (const profile of profiles) {
    if (
      profile.action !==
      taskProfile.action
    ) {
      continue;
    }

    const objectTerms =
      new Set(
        profile.objectTerms
      );

    const matchedObjectTerms =
      taskProfile.objectTerms.filter(
        (term) =>
          objectTerms.has(term)
      );

    if (
      matchedObjectTerms.length === 0
    ) {
      continue;
    }

    const weight =
      baseWeight +
      (
        matchedObjectTerms.length *
        overlapWeight
      );

    if (
      !bestMatch ||
      weight > bestMatch.weight
    ) {
      bestMatch = {
        symbol:
          profile.symbol,
        action:
          profile.action,
        matchedObjectTerms,
        weight
      };
    }
  }

  return bestMatch;
}

function tokenizeRepositoryFile(file = "") {
  return tokenizeSemanticValue(file);
}

function collectDeclaredResponsibilitySymbols(
  sourceText = ""
) {
  const symbols = new Set();

  const declarationPatterns = [
    /(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /(?:^|\n)\s*class\s+([A-Za-z_$][\w$]*)/g,
    /(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g
  ];

  for (
    const declarationPattern of
    declarationPatterns
  ) {
    let match;

    while (
      (
        match =
          declarationPattern.exec(sourceText)
      )
    ) {
      if (match[1]) {
        symbols.add(match[1]);
      }
    }
  }

  return Array.from(symbols);
}

function collectExportedResponsibilitySymbols(
  sourceText = ""
) {
  const symbols = new Set();

  const directExportPattern =
    /(?:^|\n)\s*exports\.([A-Za-z_$][\w$]*)\s*=/g;

  let directExportMatch;

  while (
    (
      directExportMatch =
        directExportPattern.exec(sourceText)
    )
  ) {
    if (directExportMatch[1]) {
      symbols.add(directExportMatch[1]);
    }
  }

  const moduleExportsPattern =
    /module\.exports\s*=\s*\{([\s\S]*?)\}\s*;?/g;

  let moduleExportsMatch;

  while (
    (
      moduleExportsMatch =
        moduleExportsPattern.exec(sourceText)
    )
  ) {
    const exportBody =
      moduleExportsMatch[1] || "";

    const exportEntryPattern =
      /(?:^|,)\s*([A-Za-z_$][\w$]*)\s*(?=[:,]|$)/gm;

    let exportEntryMatch;

    while (
      (
        exportEntryMatch =
          exportEntryPattern.exec(exportBody)
      )
    ) {
      if (exportEntryMatch[1]) {
        symbols.add(exportEntryMatch[1]);
      }
    }
  }

  return Array.from(symbols);
}

function buildRepositoryResponsibility({
  file = "",
  sourceText = ""
} = {}) {
  const declaredSymbols =
    collectDeclaredResponsibilitySymbols(
      sourceText
    );

  const exportedSymbols =
    collectExportedResponsibilitySymbols(
      sourceText
    );

  const declaredSymbolSet =
    new Set(declaredSymbols);

  const implementedExportedSymbols =
    exportedSymbols.filter(
      (symbol) =>
        declaredSymbolSet.has(symbol)
    );

  const reExportedSymbols =
    exportedSymbols.filter(
      (symbol) =>
        !declaredSymbolSet.has(symbol)
    );

  const declaredTerms =
    new Set(
      declaredSymbols.flatMap(
        (symbol) =>
          tokenizeSemanticValue(symbol)
      )
    );

  const implementedExportedTerms =
    new Set(
      implementedExportedSymbols.flatMap(
        (symbol) =>
          tokenizeSemanticValue(symbol)
      )
    );

  const reExportedTerms =
    new Set(
      reExportedSymbols.flatMap(
        (symbol) =>
          tokenizeSemanticValue(symbol)
      )
    );

  const fileSemanticTerms =
    tokenizeRepositoryFile(file);

  const declaredCompoundTerms =
    declaredSymbols.flatMap(
      (symbol) =>
        buildCompoundSemanticTerms(
          tokenizeSemanticValue(symbol)
        )
    );

  const implementedExportedCompoundTerms =
    implementedExportedSymbols.flatMap(
      (symbol) =>
        buildCompoundSemanticTerms(
          tokenizeSemanticValue(symbol)
        )
    );

  const reExportedCompoundTerms =
    reExportedSymbols.flatMap(
      (symbol) =>
        buildCompoundSemanticTerms(
          tokenizeSemanticValue(symbol)
        )
    );

  const fileCompoundTerms =
    buildCompoundSemanticTerms(
      fileSemanticTerms
    );

  const compoundTerms =
    new Set([
      ...fileCompoundTerms,
      ...declaredCompoundTerms,
      ...implementedExportedCompoundTerms
    ]);

  const responsibilityTerms =
    new Set([
      ...fileSemanticTerms,
      ...declaredTerms,
      ...implementedExportedTerms,
      ...compoundTerms
    ]);

  const declaredActionProfiles =
    buildActionResponsibilityProfiles(
      declaredSymbols
    );

  const implementedActionProfiles =
    buildActionResponsibilityProfiles(
      implementedExportedSymbols
    );

  const reExportedActionProfiles =
    buildActionResponsibilityProfiles(
      reExportedSymbols
    );

  return {
    file,
    declaredSymbols,
    exportedSymbols,
    implementedExportedSymbols,
    reExportedSymbols,
    declaredActionProfiles,
    implementedActionProfiles,
    reExportedActionProfiles,
    declaredTerms:
      Array.from(declaredTerms).sort(),
    exportedTerms:
      Array.from(
        implementedExportedTerms
      ).sort(),
    implementedExportedTerms:
      Array.from(
        implementedExportedTerms
      ).sort(),
    reExportedTerms:
      Array.from(
        reExportedTerms
      ).sort(),
    compoundTerms:
      Array.from(compoundTerms).sort(),
    reExportedCompoundTerms:
      Array.from(
        new Set(
          reExportedCompoundTerms
        )
      ).sort(),
    responsibilityTerms:
      Array.from(
        responsibilityTerms
      ).sort()
  };
}

function findExpandedTermMatch({
  taskTerm = "",
  candidateTerms = new Set()
} = {}) {
  const expandedTerms =
    expandTaskTerm(taskTerm);

  if (candidateTerms.has(taskTerm)) {
    return {
      matchedTerm: taskTerm,
      alias: false
    };
  }

  const aliasMatch =
    expandedTerms.find(
      (expandedTerm) =>
        expandedTerm !== taskTerm &&
        candidateTerms.has(expandedTerm)
    );

  if (!aliasMatch) {
    return null;
  }

  return {
    matchedTerm: aliasMatch,
    alias: true
  };
}

function inferTaskResponsibilityIntent({
  taskTerms = [],
  task = ""
} = {}) {
  const normalizedTask =
    String(task || "")
      .toLowerCase()
      .replace(/[^a-z0-9_$]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const normalizedTerms =
    Array.from(
      new Set([
        ...(
          Array.isArray(taskTerms)
            ? taskTerms
            : []
        ),
        ...normalizedTask
          .split(" ")
          .filter(Boolean)
      ])
    );

  const compoundProfiles = {
    validation: [
      "patch validator",
      "validate patch",
      "reject placeholder",
      "reject example",
      "invalid generated code",
      "unsafe generated code",
      "generated code validation",
      "does not match the resolved target symbol",
      "duplicate target symbol"
    ],
    provider: [
      "implementation provider",
      "openai provider",
      "openai implementation provider",
      "generate implementation",
      "implementation generation",
      "executable code template"
    ],
    planning: [
      "implementation planner",
      "patch planner",
      "implementation strategy",
      "patch planning",
      "expected behavior"
    ],
    targeting: [
      "target discovery",
      "target locator",
      "repository target",
      "resolve repository target",
      "target resolution",
      "target symbol discovery",
      "infer target symbol"
    ],
    editing: [
      "edit planner",
      "symbol edit",
      "function body anchor",
      "local anchor",
      "insert after",
      "insert before"
    ]
  };

  const profiles = {
    validation: {
      reject: 12,
      validate: 10,
      validator: 10,
      invalid: 8,
      unsafe: 8,
      placeholder: 8,
      example: 5,
      duplicate: 6,
      comment: 5,
      diagnostic: 5,
      mismatch: 6,
      match: 2
    },
    provider: {
      provider: 10,
      openai: 10,
      generate: 8,
      generated: 8,
      executable: 6,
      template: 5,
      implementation: 4,
      implementations: 4
    },
    planning: {
      plan: 10,
      planner: 10,
      planning: 10,
      strategy: 8,
      expected: 4,
      behavior: 4
    },
    targeting: {
      locate: 10,
      locator: 10,
      discovery: 8,
      discover: 8,
      resolve: 7,
      resolved: 4,
      infer: 5,
      target: 3,
      symbol: 3
    },
    editing: {
      edit: 10,
      anchor: 7,
      insert: 7,
      replace: 7,
      patch: 4
    }
  };

  const scores =
    Object.entries(profiles)
      .map(([role, weights]) => {
        const termScore =
          normalizedTerms.reduce(
            (total, term) =>
              total +
              (
                weights[term] ||
                weights[
                  term.endsWith("s")
                    ? term.slice(0, -1)
                    : ""
                ] ||
                0
              ),
            0
          );

        const matchedCompoundPhrases =
          (
            compoundProfiles[role] ||
            []
          ).filter(
            (phrase) =>
              normalizedTask.includes(
                phrase
              )
          );

        const compoundScore =
          matchedCompoundPhrases.reduce(
            (total, phrase) =>
              total +
              (
                phrase.split(" ").length >= 3
                  ? 30
                  : 24
              ),
            0
          );

        return {
          role,
          score:
            termScore +
            compoundScore,
          termScore,
          compoundScore,
          matchedCompoundPhrases
        };
      })
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.role.localeCompare(
            right.role
          )
      );

  const best =
    scores[0] || null;

  const second =
    scores[1] || null;

  const confident =
    Boolean(
      best &&
      best.score >= 12 &&
      (
        !second ||
        best.score - second.score >= 4
      )
    );

  return {
    role:
      confident
        ? best.role
        : null,
    confident,
    score:
      best?.score || 0,
    scores
  };
}

function classifyRepositoryFileResponsibility(
  file = ""
) {
  const normalizedFile =
    String(file || "")
      .replace(/\\/g, "/")
      .toLowerCase();

  if (
    normalizedFile.endsWith(
      "/patch-validator.js"
    )
  ) {
    return "validation";
  }

  if (
    normalizedFile.endsWith(
      "/implementation-provider.js"
    ) ||
    normalizedFile.endsWith(
      "/implementation-provider-command.js"
    ) ||
    normalizedFile.endsWith(
      "/openai-implementation-provider.mjs"
    )
  ) {
    return "provider";
  }

  if (
    normalizedFile.endsWith(
      "/implementation-planner.js"
    ) ||
    normalizedFile.endsWith(
      "/patch-planner.js"
    )
  ) {
    return "planning";
  }

  if (
    normalizedFile.endsWith(
      "/target-locator.js"
    )
  ) {
    return "targeting";
  }

  if (
    normalizedFile.endsWith(
      "/edit-planner.js"
    )
  ) {
    return "editing";
  }

  return null;
}

function scoreRepositoryTarget({
  file,
  taskTerms,
  task = "",
  root = process.cwd()
} = {}) {
  const fileTerms =
    new Set(
      tokenizeRepositoryFile(file)
    );

  const absolutePath =
    path.join(root, file);

  let sourceText = "";

  try {
    sourceText =
      fs.readFileSync(
        absolutePath,
        "utf8"
      );
  } catch (error) {
    return {
      file,
      score: 0,
      matches: [],
      responsibility: null
    };
  }

  const responsibility =
    buildRepositoryResponsibility({
      file,
      sourceText
    });

  const declaredTerms =
    new Set(
      responsibility.declaredTerms
    );

  const exportedTerms =
    new Set(
      responsibility
        .implementedExportedTerms ||
      responsibility.exportedTerms ||
      []
    );

  const reExportedTerms =
    new Set(
      responsibility.reExportedTerms ||
      []
    );

  const compoundTerms =
    new Set(
      responsibility.compoundTerms || []
    );

  const reExportedCompoundTerms =
    new Set(
      responsibility
        .reExportedCompoundTerms ||
      []
    );

  const taskCompoundTerms =
    buildCompoundSemanticTerms(
      taskTerms
    );

  const lowerSourceText =
    sourceText.toLowerCase();

  const taskActionProfile =
    extractTaskActionProfile(task);

  const responsibilityIntent =
    inferTaskResponsibilityIntent({
      taskTerms,
      task
    });

  const fileResponsibility =
    classifyRepositoryFileResponsibility(
      file
    );

  let score = 0;
  const matches = [];

  const implementedActionMatch =
    scoreActionResponsibility({
      taskProfile:
        taskActionProfile,
      profiles:
        responsibility
          .implementedActionProfiles ||
        [],
      baseWeight: 8,
      overlapWeight: 6
    });

  const declaredActionMatch =
    scoreActionResponsibility({
      taskProfile:
        taskActionProfile,
      profiles:
        responsibility
          .declaredActionProfiles ||
        [],
      baseWeight: 6,
      overlapWeight: 5
    });

  const reExportedActionMatch =
    scoreActionResponsibility({
      taskProfile:
        taskActionProfile,
      profiles:
        responsibility
          .reExportedActionProfiles ||
        [],
      baseWeight: 0,
      overlapWeight: 1
    });

  const actionMatch =
    implementedActionMatch ||
    declaredActionMatch ||
    reExportedActionMatch;

  if (actionMatch) {
    score += actionMatch.weight;

    matches.push({
      taskTerm:
        [
          actionMatch.action,
          ...actionMatch
            .matchedObjectTerms
        ].join("-"),
      matchedTerm:
        actionMatch.symbol,
      type:
        implementedActionMatch
          ? "implemented-action-responsibility"
          : declaredActionMatch
            ? "declared-action-responsibility"
            : "re-exported-action-responsibility",
      weight:
        actionMatch.weight
    });
  }

  for (const taskTerm of taskTerms) {
    const fileMatch =
      findExpandedTermMatch({
        taskTerm,
        candidateTerms: fileTerms
      });

    if (fileMatch) {
      const weight =
        fileMatch.alias ? 5 : 8;

      score += weight;

      matches.push({
        taskTerm,
        matchedTerm:
          fileMatch.matchedTerm,
        type:
          fileMatch.alias
            ? "file-alias"
            : "file-term",
        weight
      });
    }

    const exportMatch =
      findExpandedTermMatch({
        taskTerm,
        candidateTerms: exportedTerms
      });

    if (exportMatch) {
      const weight =
        exportMatch.alias ? 7 : 10;

      score += weight;

      matches.push({
        taskTerm,
        matchedTerm:
          exportMatch.matchedTerm,
        type:
          exportMatch.alias
            ? "exported-symbol-alias"
            : "exported-symbol-term",
        weight
      });
    }

    const declarationMatch =
      findExpandedTermMatch({
        taskTerm,
        candidateTerms: declaredTerms
      });

    if (
      declarationMatch &&
      !exportMatch
    ) {
      const weight =
        declarationMatch.alias ? 5 : 8;

      score += weight;

      matches.push({
        taskTerm,
        matchedTerm:
          declarationMatch.matchedTerm,
        type:
          declarationMatch.alias
            ? "declared-symbol-alias"
            : "declared-symbol-term",
        weight
      });
    }

    if (
      !exportMatch &&
      !declarationMatch
    ) {
      const reExportMatch =
        findExpandedTermMatch({
          taskTerm,
          candidateTerms:
            reExportedTerms
        });

      if (reExportMatch) {
        const weight =
          reExportMatch.alias ? 1 : 2;

        score += weight;

        matches.push({
          taskTerm,
          matchedTerm:
            reExportMatch.matchedTerm,
          type:
            reExportMatch.alias
              ? "re-exported-symbol-alias"
              : "re-exported-symbol-term",
          weight
        });
      }
    }

    if (
      lowerSourceText.includes(taskTerm)
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

  for (
    const taskCompoundTerm of
    taskCompoundTerms
  ) {
    if (
      compoundTerms.has(
        taskCompoundTerm
      )
    ) {
      score += 12;

      matches.push({
        taskTerm:
          taskCompoundTerm,
        matchedTerm:
          taskCompoundTerm,
        type:
          "compound-responsibility-term",
        weight:
          12
      });

      continue;
    }

    if (
      reExportedCompoundTerms.has(
        taskCompoundTerm
      )
    ) {
      score += 2;

      matches.push({
        taskTerm:
          taskCompoundTerm,
        matchedTerm:
          taskCompoundTerm,
        type:
          "re-exported-compound-term",
        weight:
          2
      });
    }
  }

  if (
    responsibilityIntent.confident &&
    responsibilityIntent.role
  ) {
    if (
      fileResponsibility ===
      responsibilityIntent.role
    ) {
      const responsibilityWeight =
        40;

      score +=
        responsibilityWeight;

      matches.push({
        taskTerm:
          responsibilityIntent.role,
        matchedTerm:
          fileResponsibility,
        type:
          "primary-task-responsibility",
        weight:
          responsibilityWeight
      });
    } else if (fileResponsibility) {
      const conflictPenalty =
        -8;

      score +=
        conflictPenalty;

      matches.push({
        taskTerm:
          responsibilityIntent.role,
        matchedTerm:
          fileResponsibility,
        type:
          "conflicting-task-responsibility",
        weight:
          conflictPenalty
      });
    }
  }

  const matchedTaskTerms =
    new Set(
      matches.map(
        (match) => match.taskTerm
      )
    );

  const symbolMatchCount =
    matches.filter(
      (match) =>
        match.type.startsWith(
          "exported-symbol"
        ) ||
        match.type.startsWith(
          "declared-symbol"
        )
    ).length;

  if (
    symbolMatchCount >= 2 &&
    matchedTaskTerms.size >= 2
  ) {
    const clusterWeight =
      Math.min(
        8,
        symbolMatchCount * 2
      );

    score += clusterWeight;

    matches.push({
      taskTerm:
        Array.from(
          matchedTaskTerms
        ).join("+"),
      matchedTerm:
        "responsibility-cluster",
      type:
        "responsibility-cluster",
      weight: clusterWeight
    });
  }

  return {
    file,
    score,
    matches,
    responsibility
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
          task,
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

  const functionBodyAnchor =
    localRepairIntent?.preserveExistingTarget === true &&
    repositoryTargetFile &&
    targetSymbol
      ? locateFunctionBodyAnchor({
          filePath:
            repositoryTargetFile,
          targetSymbol,
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
    functionBodyAnchor:
      functionBodyAnchor
        ? {
            ...functionBodyAnchor
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
  locateFunctionBodyAnchor,
  locateVerifiedLocalAnchor,
  resolveRepositoryTargetFromTask,
  collectRepositoryJavaScriptFiles,
  normalizeTaskTerms
};
