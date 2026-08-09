"use strict";

function escapeRegularExpression(value = "") {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function containsTargetSymbolDeclaration(
  source = "",
  targetSymbol = ""
) {
  if (
    typeof source !== "string" ||
    typeof targetSymbol !== "string" ||
    targetSymbol.trim().length === 0
  ) {
    return false;
  }

  const escapedSymbol =
    escapeRegularExpression(
      targetSymbol.trim()
    );

  return [
    new RegExp(
      `\\bfunction\\s+${escapedSymbol}\\s*\\(`
    ),
    new RegExp(
      `\\bclass\\s+${escapedSymbol}\\b`
    ),
    new RegExp(
      `\\b(?:const|let|var)\\s+${escapedSymbol}\\s*=`
    )
  ].some((pattern) => pattern.test(source));
}

function extractDeclaredSymbols(
  source = ""
) {
  if (typeof source !== "string") {
    return [];
  }

  const symbols =
    new Set();

  const patterns = [
    /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g,
    /\bclass\s+([A-Za-z_$][\w$]*)\b/g,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      symbols.add(match[1]);
    }
  }

  return [...symbols];
}

function sourceReferencesSymbol(
  source = "",
  symbol = ""
) {
  if (
    typeof source !== "string" ||
    typeof symbol !== "string" ||
    symbol.length === 0
  ) {
    return false;
  }

  const pattern =
    new RegExp(
      `\\b${escapeRegularExpression(symbol)}\\b`
    );

  return pattern.test(source);
}

function findRedeclaredExistingLocal({
  providerInput = null,
  executableCodeTemplate = ""
} = {}) {
  const existingLocalDeclarations =
    Array.isArray(
      providerInput
        ?.existingLocalDeclarations
    )
      ? new Set(
          providerInput
            .existingLocalDeclarations
        )
      : new Set();

  if (
    existingLocalDeclarations.size === 0 ||
    typeof executableCodeTemplate !==
      "string"
  ) {
    return null;
  }

  const declarations =
    Array.from(
      executableCodeTemplate.matchAll(
        /(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\b/g
      ),
      (match) =>
        match[1]
    );

  return (
    declarations.find(
      (identifier) =>
        existingLocalDeclarations.has(
          identifier
        )
    ) || null
  );
}

function findIllustrativeImplementationViolation(
  executableCodeTemplate = "",
  context = null
) {
  if (
    typeof executableCodeTemplate !==
      "string" ||
    executableCodeTemplate.trim().length ===
      0
  ) {
    return null;
  }

  const implementationTemplateBlock =
    executableCodeTemplate.match(
      /implementationTemplate\s*:\s*\{[\s\S]{0,1600}?\}/i
    )?.[0] || "";

  const schemaPlaceholderPatterns = [
    /\btargetSymbol\s*:\s*["'`]string["'`]/i,
    /\bsymbolType\s*:\s*["'`]string["'`]/i,
    /\bexpectedBehavior\s*:\s*["'`]string\[\]["'`]/i,
    /\bimplementationTemplate\s*:\s*["'`]string["'`]/i,
    /\bexecutableCodeTemplate\s*:\s*["'`]string["'`]/i
  ];

  const schemaPlaceholderCount =
    schemaPlaceholderPatterns.filter(
      (pattern) =>
        pattern.test(
          implementationTemplateBlock
        )
    ).length;

  const selfReferentialTargetSymbol =
    typeof context?.targetSymbol === "string"
      ? context.targetSymbol.trim()
      : "";

  const escapedSelfReferentialTargetSymbol =
    selfReferentialTargetSymbol
      ? selfReferentialTargetSymbol.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )
      : "";

  const selfReferentialTemplatePattern =
    escapedSelfReferentialTargetSymbol
      ? new RegExp(
          [
            "(?:implementationTemplate|executableCodeTemplate)",
            "\\s*:\\s*",
            "[\"'`]",
            "[\\s\\S]{0,240}",
            "(?:async\\s+)?function\\s+",
            escapedSelfReferentialTargetSymbol,
            "\\s*\\("
          ].join(""),
          "i"
        )
      : null;

  const indicators = [
    {
      name:
        "unresolved-angle-placeholder",
      matched:
        /<\s*(?:target symbol name|symbol type(?:\s*,\s*e\.?g\.?\s*,?\s*function)?|describe expected behavior(?:\s+in detail)?|(?:implementation|code|executable code) template(?:\s+for implementation)?)\s*>/i.test(
          executableCodeTemplate
        ),
      weight: 5
    },
    {
      name:
        "self-referential-code-template",
      matched:
        Boolean(
          selfReferentialTemplatePattern &&
          selfReferentialTemplatePattern.test(
            executableCodeTemplate
          )
        ),
      weight: 5
    },
    {
      name:
        "schema-placeholder-bundle",
      matched:
        schemaPlaceholderCount >= 3,
      weight: 5
    },
    {
      name:
        "example-target-symbol",
      matched:
        /\bexampleTargetSymbol\b/i.test(
          executableCodeTemplate
        ),
      weight: 3
    },
    {
      name:
        "example-output",
      matched:
        /\bExample output\b/i.test(
          executableCodeTemplate
        ),
      weight: 3
    },
    {
      name:
        "implement-function-logic",
      matched:
        /Implement the function logic here/i.test(
          executableCodeTemplate
        ),
      weight: 2
    },
    {
      name:
        "fixed-example-string",
      matched:
        /fixed example string/i.test(
          executableCodeTemplate
        ),
      weight: 2
    },
    {
      name:
        "demonstrate-implementation",
      matched:
        /demonstrate implementation/i.test(
          executableCodeTemplate
        ),
      weight: 2
    },
    {
      name:
        "sample-implementation",
      matched:
        /sample implementation/i.test(
          executableCodeTemplate
        ),
      weight: 2
    },
    {
      name:
        "placeholder-implementation",
      matched:
        /placeholder implementation/i.test(
          executableCodeTemplate
        ),
      weight: 2
    }
  ];

  const matchedIndicators =
    indicators.filter(
      (indicator) =>
        indicator.matched
    );

  const score =
    matchedIndicators.reduce(
      (total, indicator) =>
        total + indicator.weight,
      0
    );

  if (score < 4) {
    return null;
  }

  return {
    score,
    indicators:
      matchedIndicators.map(
        (indicator) =>
          indicator.name
      )
  };
}

function findProviderContractViolation({
  providerInput = null,
  executableCodeTemplate = ""
} = {}) {
  const requiredOutputShape =
    providerInput?.requiredOutputShape ||
    resolveRequiredOutputShape({
      recommendedOperation:
        providerInput?.recommendedOperation ||
        null,
      symbolType:
        providerInput?.symbolType ||
        null,
      verifiedLocalAnchor:
        providerInput?.verifiedLocalAnchor ||
        null
    });

  if (
    !satisfiesRequiredOutputShape({
      requiredOutputShape,
      targetSymbol:
        providerInput?.targetSymbol ||
        null,
      executableCodeTemplate
    })
  ) {
    return (
      "Provider contract violation: required output shape " +
      requiredOutputShape +
      " was not satisfied for target " +
      (
        providerInput?.targetSymbol ||
        "(unknown)"
      ) +
      "."
    );
  }

  const illustrativeImplementation =
    findIllustrativeImplementationViolation(
      executableCodeTemplate,
      {
        targetSymbol:
          providerInput?.targetSymbol || null
      }
    );

  if (illustrativeImplementation) {
    return (
      "The generated implementation appears to be an " +
      "illustrative example or placeholder rather than " +
      "a concrete implementation. Detected indicators: " +
      illustrativeImplementation.indicators.join(", ") +
      "."
    );
  }

  const operation =
    providerInput?.recommendedOperation;

  if (
    operation !== "insert-before" &&
    operation !== "insert-after"
  ) {
    return null;
  }

  const targetSymbol =
    providerInput?.targetSymbol;

  const existingSource =
    providerInput?.surroundingContext?.text ||
    "";

  if (
    targetSymbol &&
    containsTargetSymbolDeclaration(
      existingSource,
      targetSymbol
    ) &&
    containsTargetSymbolDeclaration(
      executableCodeTemplate,
      targetSymbol
    )
  ) {
    return (
      `Provider contract violation: insert operation ` +
      `would redeclare existing target symbol ` +
      `${targetSymbol}.`
    );
  }

  const verifiedLocalAnchor =
    providerInput?.verifiedLocalAnchor &&
    providerInput.verifiedLocalAnchor.verified === true
      ? providerInput.verifiedLocalAnchor
      : null;

  const localAnchorPattern =
    typeof verifiedLocalAnchor?.pattern === "string"
      ? verifiedLocalAnchor.pattern.trim()
      : "";

  const localAnchorDeclaration =
    localAnchorPattern.match(
      /^\s*(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/
    );

  const localAnchorSymbol =
    localAnchorDeclaration?.[1] || null;

  if (
    localAnchorSymbol &&
    containsTargetSymbolDeclaration(
      executableCodeTemplate,
      localAnchorSymbol
    )
  ) {
    return (
      `Provider contract violation: insert operation ` +
      `would redeclare verified local anchor symbol ` +
      `${localAnchorSymbol}.`
    );
  }

  const functionBodyInsertion =
    verifiedLocalAnchor?.anchorType ===
      "function-body-opening";

  if (functionBodyInsertion) {
    const redeclaredExistingLocal =
      findRedeclaredExistingLocal({
        providerInput,
        executableCodeTemplate
      });

    if (redeclaredExistingLocal) {
      return (
        `Provider contract violation: function-body repair ` +
        `would redeclare existing local identifier ` +
        `${redeclaredExistingLocal}.`
      );
    }

    const nestedTypeDeclaration =
      (
        /(?:^|\n)\s*(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(
          executableCodeTemplate
        ) ||
        /(?:^|\n)\s*class\s+[A-Za-z_$][\w$]*\b/.test(
          executableCodeTemplate
        )
      );

    if (nestedTypeDeclaration) {
      return (
        `Provider contract violation: function-body repair ` +
        `must contain local executable statements, not new ` +
        `function or class declarations.`
      );
    }
  } else {
    const declaredSymbols =
      extractDeclaredSymbols(
        executableCodeTemplate
      ).filter(
        (symbol) =>
          symbol !== targetSymbol
      );

    if (
      declaredSymbols.length > 0 &&
      !declaredSymbols.some(
        (symbol) =>
          sourceReferencesSymbol(
            existingSource,
            symbol
          )
      ) &&
      !sourceReferencesSymbol(
        executableCodeTemplate,
        targetSymbol
      )
    ) {
      return (
        `Provider contract violation: insert operation ` +
        `adds declarations that are not connected to ` +
        `target symbol ${targetSymbol || "(unknown)"}.`
      );
    }
  }

  return null;
}

function normalizeTemplate(value = null) {
  if (!value || typeof value !== "object") {
    return {
      targetSymbol: null,
      symbolType: null,
      expectedBehavior: [],
      executableCodeTemplate: null
    };
  }

  return {
    ...value,
    targetSymbol:
      value.targetSymbol || null,
    symbolType:
      value.symbolType || null,
    expectedBehavior:
      Array.isArray(value.expectedBehavior)
        ? value.expectedBehavior
            .filter(
              (item) =>
                typeof item === "string" &&
                item.trim().length > 0
            )
            .map((item) => item.trim())
        : [],
    executableCodeTemplate:
      typeof value.executableCodeTemplate === "string"
        ? value.executableCodeTemplate.trim()
        : null
  };
}

function normalizeProviderResult(value = null) {
  if (typeof value === "string") {
    return {
      success: value.trim().length > 0,
      executableCodeTemplate:
        value.trim() || null,
      providerName: "external-provider"
    };
  }

  if (!value || typeof value !== "object") {
    return {
      success: false,
      executableCodeTemplate: null,
      providerName: null,
      reason:
        "Implementation provider returned no result."
    };
  }

  const executableCodeTemplate =
    typeof value.executableCodeTemplate === "string"
      ? value.executableCodeTemplate.trim()
      : "";

  return {
    ...value,
    success:
      value.success !== false &&
      executableCodeTemplate.length > 0,
    executableCodeTemplate:
      executableCodeTemplate || null,
    providerName:
      value.providerName ||
      value.provider ||
      "external-provider"
  };
}

function resolveRequiredOutputShape({
  recommendedOperation = null,
  symbolType = null,
  verifiedLocalAnchor = null
} = {}) {
  const operation =
    typeof recommendedOperation === "string"
      ? recommendedOperation.trim()
      : "";

  const normalizedSymbolType =
    typeof symbolType === "string"
      ? symbolType.trim().toLowerCase()
      : "";

  const anchorType =
    typeof verifiedLocalAnchor?.anchorType === "string"
      ? verifiedLocalAnchor.anchorType.trim()
      : "";

  if (
    (
      operation === "insert-before" ||
      operation === "insert-after"
    ) &&
    anchorType === "function-body-opening"
  ) {
    return "statements-only";
  }

  if (operation === "replace") {
    if (normalizedSymbolType === "function") {
      return "complete-function";
    }

    if (normalizedSymbolType === "class") {
      return "complete-class";
    }

    return "complete-symbol";
  }

  if (
    operation === "insert-before" ||
    operation === "insert-after"
  ) {
    return "module-fragment";
  }

  return "module-fragment";
}

function satisfiesRequiredOutputShape({
  requiredOutputShape = null,
  targetSymbol = null,
  executableCodeTemplate = ""
} = {}) {
  if (
    typeof executableCodeTemplate !== "string" ||
    executableCodeTemplate.trim().length === 0
  ) {
    return false;
  }

  if (requiredOutputShape === "statements-only") {
    return !(
      /(?:^|\n)\s*(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(
        executableCodeTemplate
      ) ||
      /(?:^|\n)\s*class\s+[A-Za-z_$][\w$]*\b/.test(
        executableCodeTemplate
      )
    );
  }

  if (
    typeof targetSymbol !== "string" ||
    !/^[A-Za-z_$][\w$]*$/.test(
      targetSymbol
    )
  ) {
    return false;
  }

  if (requiredOutputShape === "complete-function") {
    const declarationPattern =
      new RegExp(
        "(?:^|\\n)\\s*(?:async\\s+)?function\\s+" +
        targetSymbol +
        "\\s*\\("
      );

    return declarationPattern.test(
      executableCodeTemplate
    );
  }

  if (requiredOutputShape === "complete-class") {
    const declarationPattern =
      new RegExp(
        "(?:^|\\n)\\s*class\\s+" +
        targetSymbol +
        "\\b"
      );

    return declarationPattern.test(
      executableCodeTemplate
    );
  }

  if (requiredOutputShape === "complete-symbol") {
    return containsTargetSymbolDeclaration(
      executableCodeTemplate,
      targetSymbol
    );
  }

  return true;
}
function resolveCompleteProviderSourceText({
  implementationPlanner = null,
  targetLocator = null
} = {}) {
  const explicitSourceText =
    typeof targetLocator?.sourceText ===
      "string"
      ? targetLocator.sourceText
      : "";

  if (explicitSourceText.length > 0) {
    return explicitSourceText;
  }

  const targetFile =
    implementationPlanner?.targetFile ||
    targetLocator?.repositoryTargetFile ||
    targetLocator?.targetFile ||
    null;

  if (
    typeof targetFile === "string" &&
    targetFile.trim().length > 0
  ) {
    try {
      const fs =
        require("fs");

      if (fs.existsSync(targetFile)) {
        const fileText =
          fs.readFileSync(
            targetFile,
            "utf8"
          );

        if (
          typeof fileText === "string" &&
          fileText.length > 0
        ) {
          return fileText;
        }
      }
    } catch {
      // Fall back to bounded surrounding context.
    }
  }

  return (
    targetLocator?.surroundingContext
      ?.text ||
    ""
  );
}

function extractCurrentTargetSource({
  sourceText = "",
  targetSymbol = null
} = {}) {
  if (
    typeof sourceText !== "string" ||
    sourceText.length === 0 ||
    typeof targetSymbol !== "string" ||
    !/^[A-Za-z_$][\w$]*$/.test(
      targetSymbol
    )
  ) {
    return "";
  }

  const escapedTargetSymbol =
    targetSymbol.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  const declarationPattern =
    new RegExp(
      "(?:^|\\n)\\s*(?:async\\s+)?" +
      "function\\s+" +
      escapedTargetSymbol +
      "\\s*\\([^)]*\\)\\s*\\{",
      "m"
    );

  const declarationMatch =
    declarationPattern.exec(
      sourceText
    );

  if (!declarationMatch) {
    return "";
  }

  const functionStart =
    declarationMatch.index +
    declarationMatch[0].search(/\S/);

  const openingBrace =
    sourceText.indexOf(
      "{",
      declarationMatch.index
    );

  if (openingBrace < 0) {
    return "";
  }

  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (
    let index = openingBrace;
    index < sourceText.length;
    index += 1
  ) {
    const character =
      sourceText[index];

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
        return sourceText
          .slice(
            functionStart,
            index + 1
          )
          .trim();
      }
    }
  }

  return "";
}

function buildProviderInput({
  implementationPlanner = null,
  targetLocator = null
} = {}) {
  return {
    currentTargetSource:
      extractCurrentTargetSource({
        sourceText:
          resolveCompleteProviderSourceText({
            implementationPlanner,
            targetLocator
          }),
        targetSymbol:
          implementationPlanner?.targetSymbol ||
          targetLocator?.targetSymbol ||
          null
      }),
    task:
      implementationPlanner?.task || null,
    targetFile:
      implementationPlanner?.targetFile ||
      targetLocator?.repositoryTargetFile ||
      null,
    targetSymbol:
      implementationPlanner?.targetSymbol ||
      targetLocator?.targetSymbol ||
      null,
    symbolType:
      implementationPlanner?.symbolType ||
      targetLocator?.symbolType ||
      null,
    expectedBehavior:
      Array.isArray(
        implementationPlanner?.expectedBehavior
      )
        ? implementationPlanner.expectedBehavior
        : [],
    implementationType:
      implementationPlanner?.implementationType ||
      null,
    strategy:
      implementationPlanner?.strategy || null,
    recommendedOperation:
      implementationPlanner?.recommendedOperation ||
      null,

    requiredOutputShape:
      resolveRequiredOutputShape({
        recommendedOperation:
          implementationPlanner?.recommendedOperation ||
          null,
        symbolType:
          implementationPlanner?.symbolType ||
          targetLocator?.symbolType ||
          null,
        verifiedLocalAnchor:
          targetLocator?.verifiedLocalAnchor &&
          typeof targetLocator.verifiedLocalAnchor === "object"
            ? targetLocator.verifiedLocalAnchor
            : targetLocator?.functionBodyAnchor &&
                typeof targetLocator.functionBodyAnchor === "object"
              ? targetLocator.functionBodyAnchor
              : null
      }),
    localRepairIntent:
      implementationPlanner?.localRepairIntent &&
      typeof implementationPlanner.localRepairIntent === "object"
        ? {
            ...implementationPlanner.localRepairIntent
          }
        : null,
    repairAction:
      implementationPlanner?.repairAction ||
      null,
    failureStage:
      implementationPlanner?.failureStage ||
      null,
    errorMessage:
      implementationPlanner?.errorMessage ||
      null,
    issues:
      Array.isArray(
        implementationPlanner?.issues
      )
        ? implementationPlanner.issues
        : [],
    validatedOperations:
      Array.isArray(
        implementationPlanner?.validatedOperations
      )
        ? implementationPlanner.validatedOperations
        : [],
    originalTask:
      implementationPlanner?.originalTask ||
      null,
    developmentPrinciples:
      implementationPlanner?.developmentPrinciples &&
      typeof implementationPlanner.developmentPrinciples === "object"
        ? {
            ...implementationPlanner.developmentPrinciples
          }
        : null,
    repairAware:
      implementationPlanner?.repairAware === true,
    surroundingContext:
      targetLocator?.surroundingContext || null,
    verifiedLocalAnchor:
      targetLocator?.verifiedLocalAnchor &&
      typeof targetLocator.verifiedLocalAnchor === "object"
        ? {
            ...targetLocator.verifiedLocalAnchor
          }
        : targetLocator?.functionBodyAnchor &&
            typeof targetLocator.functionBodyAnchor === "object"
          ? {
              ...targetLocator.functionBodyAnchor
            }
          : null,
    existingLocalDeclarations:
      Array.isArray(
        targetLocator?.functionBodyAnchor
          ?.existingLocalDeclarations
      )
        ? [
            ...targetLocator
              .functionBodyAnchor
              .existingLocalDeclarations
          ]
        : []
  };
}

function hydrateImplementationPlanner({
  implementationPlanner,
  executableCodeTemplate,
  providerName
} = {}) {
  const originalTemplate =
    normalizeTemplate(
      implementationPlanner?.implementationTemplate
    );

  const hydratedTemplate = {
    ...originalTemplate,
    targetSymbol:
      originalTemplate.targetSymbol ||
      implementationPlanner?.targetSymbol ||
      null,
    symbolType:
      originalTemplate.symbolType ||
      implementationPlanner?.symbolType ||
      null,
    expectedBehavior:
      originalTemplate.expectedBehavior.length > 0
        ? originalTemplate.expectedBehavior
        : Array.isArray(
            implementationPlanner?.expectedBehavior
          )
          ? implementationPlanner.expectedBehavior
          : [],
    executableCodeTemplate
  };

  const executableTemplateReady =
    typeof executableCodeTemplate === "string" &&
    executableCodeTemplate.trim().length > 0;

  return {
    ...implementationPlanner,
    implementationTemplate: hydratedTemplate,
    executableTemplateReady,
    readyForCodeGeneration:
      implementationPlanner?.concretePlanReady === true &&
      executableTemplateReady,
    implementationProvider:
      providerName || null
  };
}

function resolveImplementationProvider({
  implementationPlanner = null,
  targetLocator = null,
  provider = null
} = {}) {
  if (!implementationPlanner) {
    return {
      mode: "implementation-provider-runtime",
      version:
        "ash-local-runtime-v0.1-provider-boundary",
      success: false,
      providerConfigured:
        typeof provider === "function",
      implementationPlanner: null,
      providerInput: null,
      reason:
        "Implementation planner result is missing."
    };
  }

  const existingTemplate =
    normalizeTemplate(
      implementationPlanner.implementationTemplate
    );

  const existingTemplateViolation =
    findIllustrativeImplementationViolation(
      existingTemplate.executableCodeTemplate || "",
      {
        targetSymbol:
          implementationPlanner.targetSymbol || null
      }
    );

  const reusableExistingTemplate =
    Boolean(
      existingTemplate.executableCodeTemplate
    ) &&
    !existingTemplateViolation;

  if (reusableExistingTemplate) {
    return {
      mode: "implementation-provider-runtime",
      version:
        "ash-local-runtime-v0.1-provider-boundary",
      success: true,
      providerConfigured:
        typeof provider === "function",
      providerName:
        implementationPlanner.implementationProvider ||
        "existing-template",
      providerInput:
        buildProviderInput({
          implementationPlanner,
          targetLocator
        }),
      implementationPlanner:
        hydrateImplementationPlanner({
          implementationPlanner,
          executableCodeTemplate:
            existingTemplate.executableCodeTemplate,
          providerName:
            implementationPlanner.implementationProvider ||
            "existing-template"
        }),
      reason:
        "Existing executable implementation template was preserved."
    };
  }

  const providerInput =
    buildProviderInput({
      implementationPlanner,
      targetLocator
    });

  if (!providerInput.targetFile) {
    return {
      mode: "implementation-provider-runtime",
      version:
        "ash-local-runtime-v0.1-provider-boundary",
      success: false,
      providerConfigured:
        typeof provider === "function",
      implementationPlanner,
      providerInput,
      reason:
        "Implementation provider requires a target file."
    };
  }

  if (!providerInput.targetSymbol) {
    return {
      mode: "implementation-provider-runtime",
      version:
        "ash-local-runtime-v0.1-provider-boundary",
      success: false,
      providerConfigured:
        typeof provider === "function",
      implementationPlanner,
      providerInput,
      reason:
        "Implementation provider requires a target symbol."
    };
  }

  if (!providerInput.surroundingContext?.text) {
    return {
      mode: "implementation-provider-runtime",
      version:
        "ash-local-runtime-v0.1-provider-boundary",
      success: false,
      providerConfigured:
        typeof provider === "function",
      implementationPlanner,
      providerInput,
      reason:
        "Implementation provider requires surrounding source context."
    };
  }

  if (typeof provider !== "function") {
    return {
      mode: "implementation-provider-runtime",
      version:
        "ash-local-runtime-v0.1-provider-boundary",
      success: false,
      providerConfigured: false,
      implementationPlanner,
      providerInput,
      reason:
        "No external implementation provider is configured."
    };
  }

  let rawProviderResult;

  try {
    rawProviderResult =
      provider(providerInput);
  } catch (error) {
    return {
      mode: "implementation-provider-runtime",
      version:
        "ash-local-runtime-v0.1-provider-boundary",
      success: false,
      providerConfigured: true,
      implementationPlanner,
      providerInput,
      reason:
        error?.message ||
        "External implementation provider failed."
    };
  }

  if (
    rawProviderResult &&
    typeof rawProviderResult.then === "function"
  ) {
    return {
      mode: "implementation-provider-runtime",
      version:
        "ash-local-runtime-v0.1-provider-boundary",
      success: false,
      providerConfigured: true,
      implementationPlanner,
      providerInput,
      reason:
        "Asynchronous implementation providers are not supported by the synchronous development pipeline."
    };
  }

  const providerResult =
    normalizeProviderResult(rawProviderResult);

  if (
    providerResult.success !== true ||
    !providerResult.executableCodeTemplate
  ) {
    return {
      mode: "implementation-provider-runtime",
      version:
        "ash-local-runtime-v0.1-provider-boundary",
      success: false,
      providerConfigured: true,
      providerName:
        providerResult.providerName || null,
      implementationPlanner,
      providerInput,
      providerResult,
      reason:
        providerResult.reason ||
        "Implementation provider did not produce executable code."
    };
  }

  const providerContractViolation =
    findProviderContractViolation({
      providerInput,
      executableCodeTemplate:
        providerResult.executableCodeTemplate
    });

  if (providerContractViolation) {
    return {
      mode: "implementation-provider-runtime",
      version:
        "ash-local-runtime-v0.1-provider-boundary",
      success: false,
      providerConfigured: true,
      providerName:
        providerResult.providerName || null,
      implementationPlanner,
      providerInput,
      providerResult,
      reason:
        providerContractViolation
    };
  }

  return {
    mode: "implementation-provider-runtime",
    version:
      "ash-local-runtime-v0.1-provider-boundary",
    success: true,
    providerConfigured: true,
    providerName:
      providerResult.providerName,
    providerInput,
    providerResult,
    implementationPlanner:
      hydrateImplementationPlanner({
        implementationPlanner,
        executableCodeTemplate:
          providerResult.executableCodeTemplate,
        providerName:
          providerResult.providerName
      }),
    reason:
      "Executable implementation template was produced by the configured provider."
  };
}

module.exports = {
  resolveImplementationProvider,
  buildProviderInput,
  hydrateImplementationPlanner
};
