"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { locateFullSymbolRange, locateVerifiedLocalAnchor } = require("./target-locator");
const {
  applyOperationToText
} = require("./patch-apply-engine");

const SUPPORTED_OPERATIONS = new Set([
  "insert-before",
  "insert-after",
  "replace"
]);

const UNSAFE_REPLACE_ANCHORS = new Set([
  "TODO",
  "FIXME",
  "XXX",
  "stub"
]);

const JAVASCRIPT_EXTENSIONS = new Set([
  ".js",
  ".cjs",
  ".mjs"
]);

function escapeRegularExpression(value = "") {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function stripJavaScriptComments(
  source = ""
) {
  if (typeof source !== "string") {
    return "";
  }

  return source
    .replace(
      /\/\*[\s\S]*?\*\//g,
      ""
    )
    .replace(
      /^\s*\/\/.*$/gm,
      ""
    )
    .trim();
}

function isCommentOnlyGeneratedCode(
  generatedCode = ""
) {
  return (
    typeof generatedCode === "string" &&
    generatedCode.trim().length > 0 &&
    stripJavaScriptComments(
      generatedCode
    ).length === 0
  );
}

function isDiagnosticOnlyGeneratedCode(
  generatedCode = ""
) {
  return (
    generatedCode.includes(
      "function describeGeneratedImplementation()"
    ) &&
    generatedCode.includes(
      "generated-implementation-diagnostic"
    )
  );
}

function isUnsafeReplaceOperation(operation = {}) {
  return (
    operation.operation === "replace" &&
    UNSAFE_REPLACE_ANCHORS.has(
      operation.anchorPattern
    )
  );
}

function buildDeclarationPatterns(
  targetSymbol = ""
) {
  const escapedSymbol =
    escapeRegularExpression(targetSymbol);

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
  ];
}

function containsSymbolDeclaration(
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

  return buildDeclarationPatterns(
    targetSymbol.trim()
  ).some(
    (pattern) =>
      pattern.test(source)
  );
}

function isDuplicateTargetSymbolGeneration({
  operation,
  targetFileText,
  generatedCode,
  targetSymbol
} = {}) {
  if (
    operation !== "insert-before" &&
    operation !== "insert-after"
  ) {
    return false;
  }

  if (!targetSymbol) {
    return false;
  }

  return (
    containsSymbolDeclaration(
      targetFileText,
      targetSymbol
    ) &&
    containsSymbolDeclaration(
      generatedCode,
      targetSymbol
    )
  );
}

function extractCommonJsExportNames(
  source = ""
) {
  if (typeof source !== "string") {
    return [];
  }

  const match =
    source.match(
      /module\.exports\s*=\s*\{([\s\S]*?)\};/
    );

  if (!match) {
    return [];
  }

  return Array.from(
    new Set(
      match[1]
        .split(",")
        .map((entry) =>
          entry
            .trim()
            .split(":")[0]
            .trim()
        )
        .filter((name) =>
          /^[A-Za-z_$][\w$]*$/.test(name)
        )
    )
  );
}

function findMissingCommonJsExports({
  beforeSource = "",
  afterSource = ""
} = {}) {
  const beforeExports =
    extractCommonJsExportNames(beforeSource);

  if (beforeExports.length === 0) {
    return [];
  }

  const afterExports =
    new Set(
      extractCommonJsExportNames(afterSource)
    );

  return beforeExports.filter(
    (name) => !afterExports.has(name)
  );
}
function findMissingExportedDeclarations({
  beforeSource = "",
  afterSource = ""
} = {}) {
  const beforeExports =
    extractCommonJsExportNames(beforeSource);

  return beforeExports.filter(
    (name) =>
      containsSymbolDeclaration(
        beforeSource,
        name
      ) &&
      !containsSymbolDeclaration(
        afterSource,
        name
      )
  );
}
function extractLocalDeclarationNames(
  source = ""
) {
  if (typeof source !== "string") {
    return [];
  }

  const names = new Set();

  const patterns = [
    /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
    /\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g,
    /\bclass\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/g
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) {
        names.add(match[1]);
      }
    }
  }

  return Array.from(names);
}
function evaluateDestructiveReplace({
  operation = null,
  anchorPattern = "",
  generatedCode = ""
} = {}) {
  if (
    operation !== "replace" ||
    typeof anchorPattern !== "string" ||
    typeof generatedCode !== "string"
  ) {
    return {
      destructive: false,
      checked: false,
      reason:
        "Destructive replace check is not applicable."
    };
  }

  const original =
    anchorPattern.trim();

  const replacement =
    generatedCode.trim();

  if (
    original.length === 0 ||
    replacement.length === 0
  ) {
    return {
      destructive: false,
      checked: false,
      reason:
        "Destructive replace check requires non-empty source."
    };
  }

  const originalLines =
    original.split(/\r?\n/).length;

  const replacementLines =
    replacement.split(/\r?\n/).length;

  const characterRatio =
    replacement.length /
    original.length;

  const lineRatio =
    replacementLines /
    originalLines;

  const substantialOriginal =
    original.length >= 1000 ||
    originalLines >= 40;

  const severeCharacterReduction =
    characterRatio < 0.4;

  const severeLineReduction =
    lineRatio < 0.4;

  const originalLocalDeclarations =
    extractLocalDeclarationNames(
      original
    );

  const replacementLocalDeclarations =
    new Set(
      extractLocalDeclarationNames(
        replacement
      )
    );

  const retainedLocalDeclarations =
    originalLocalDeclarations.filter(
      (name) =>
        replacementLocalDeclarations.has(
          name
        )
    );

  const localDeclarationRetentionRatio =
    originalLocalDeclarations.length > 0
      ? retainedLocalDeclarations.length /
        originalLocalDeclarations.length
      : 1;

  const substantialLocalContract =
    originalLocalDeclarations.length >= 8;

  const severeLocalContractLoss =
    substantialLocalContract &&
    localDeclarationRetentionRatio < 0.5;

  const destructiveBySize =
    substantialOriginal &&
    severeCharacterReduction &&
    severeLineReduction;

  const destructive =
    destructiveBySize ||
    severeLocalContractLoss;

  return {
    destructive,
    checked: true,
    substantialOriginal,
    originalCharacters:
      original.length,
    replacementCharacters:
      replacement.length,
    characterRatio,
    originalLines,
    replacementLines,
    lineRatio,
    originalLocalDeclarationCount:
      originalLocalDeclarations.length,
    retainedLocalDeclarationCount:
      retainedLocalDeclarations.length,
    localDeclarationRetentionRatio,
    severeLocalContractLoss,
    reason:
      destructiveBySize
        ? "Large replace operation would remove most of the existing implementation."
        : severeLocalContractLoss
          ? "Full-symbol replacement would remove substantial verified local behavioral structure."
          : "Replace preserves the structural safety threshold and local declaration contract."
  };
}

function validateJavaScriptSyntax({
  source = "",
  targetFile = ""
} = {}) {
  const extension =
    path.extname(
      String(targetFile || "")
    ).toLowerCase();

  if (!JAVASCRIPT_EXTENSIONS.has(extension)) {
    return {
      checked: false,
      success: true,
      status: null,
      stderr: "",
      reason:
        "Target file is not a JavaScript source file."
    };
  }

  const tempDirectory =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        "ash-patch-validator-"
      )
    );

  const tempFile =
    path.join(
      tempDirectory,
      `candidate${extension}`
    );

  try {
    fs.writeFileSync(
      tempFile,
      source,
      "utf8"
    );

    const result =
      spawnSync(
        process.execPath,
        [
          "--check",
          tempFile
        ],
        {
          encoding: "utf8",
          shell: false
        }
      );

    const success =
      result.status === 0;

    return {
      checked: true,
      success,
      status:
        typeof result.status === "number"
          ? result.status
          : null,
      stderr:
        result.stderr || "",
      reason: success
        ? "Virtual JavaScript source passed syntax validation."
        : "Virtual JavaScript source failed syntax validation."
    };
  } catch (error) {
    return {
      checked: true,
      success: false,
      status: null,
      stderr:
        error?.message ||
        String(error),
      reason:
        "Virtual JavaScript syntax validation could not complete."
    };
  } finally {
    fs.rmSync(
      tempDirectory,
      {
        recursive: true,
        force: true
      }
    );
  }
}

function findPlaceholderImplementationComment(
  generatedCode = ""
) {
  if (typeof generatedCode !== "string") {
    return null;
  }

  const patterns = [
    /\/\*[\s\S]{0,160}\btask object as defined\b[\s\S]{0,160}\*\//i,
    /\/\*[\s\S]{0,160}\bimplementation(?: goes)? here\b[\s\S]{0,160}\*\//i,
    /\/\*[\s\S]{0,160}\bimplement(?:ation)?[^*]{0,80}\bhere\b[\s\S]{0,160}\*\//i,
    /^\s*\/\/\s*(?:TODO|FIXME)\b.*$/im
  ];

  const matchedPattern =
    patterns.find(
      (pattern) =>
        pattern.test(
          generatedCode
        )
    );

  if (!matchedPattern) {
    return null;
  }

  return (
    generatedCode.match(
      matchedPattern
    )?.[0]?.trim() ||
    "placeholder implementation comment"
  );
}

function findIllustrativePlaceholderValue(
  generatedCode = ""
) {
  if (
    typeof generatedCode !== "string" ||
    generatedCode.trim().length === 0
  ) {
    return null;
  }

  const patterns = [
    /<\s*target symbol name\s*>/i,
    /<\s*symbol type(?:\s*,\s*e\.?g\.?\s*,?\s*function)?\s*>/i,
    /<\s*describe expected behavior(?:\s+in detail)?\s*>/i,
    /<\s*(?:implementation|code|executable code) template\s*>/i,
    /\bdescribe expected behavior(?:\s+in detail)?\b/i,
    /\breplace with (?:your|the) implementation\b/i,
    /\byour implementation here\b/i,
    /\bimplement the function logic here\b/i,
    /\bsample implementation\b/i,
    /\bplaceholder implementation\b/i
  ];

  const matchedPattern =
    patterns.find(
      (pattern) =>
        pattern.test(generatedCode)
    );

  if (!matchedPattern) {
    return null;
  }

  return (
    generatedCode.match(
      matchedPattern
    )?.[0]?.trim() ||
    "illustrative placeholder value"
  );
}

function isTargetSymbolRemovedByReplace({
  operation = null,
  targetFileText = "",
  virtualFileText = "",
  targetSymbol = null
} = {}) {
  if (
    operation !== "replace" ||
    typeof targetSymbol !== "string" ||
    targetSymbol.trim().length === 0
  ) {
    return false;
  }

  const normalizedTargetSymbol =
    targetSymbol.trim();

  return (
    containsSymbolDeclaration(
      targetFileText,
      normalizedTargetSymbol
    ) &&
    !containsSymbolDeclaration(
      virtualFileText,
      normalizedTargetSymbol
    )
  );
}

function validatePatchOperations(codeGenerator) {
  const operations = Array.isArray(
    codeGenerator?.operations
  )
    ? codeGenerator.operations
    : [];

  const validatedOperations = [];
  const issues = [];

  /*
   * Preserve virtual file state across multiple
   * operations targeting the same file.
   *
   * This mirrors actual sequential patch application
   * without writing anything to the repository.
   */
  const virtualFileTexts =
    new Map();

  for (const operation of operations) {
    const targetFile =
      operation.file || "";

    const absolutePath =
      path.join(
        process.cwd(),
        targetFile
      );

    const fileExists =
      targetFile.length > 0 &&
      fs.existsSync(absolutePath);

    const originalFileText =
      fileExists
        ? fs.readFileSync(
            absolutePath,
            "utf8"
          )
        : "";

    const targetFileText =
      virtualFileTexts.has(targetFile)
        ? virtualFileTexts.get(targetFile)
        : originalFileText;

    const anchorPattern =
      operation.anchorPattern || "";

    const anchorExists =
      fileExists &&
      anchorPattern.length > 0 &&
      targetFileText.includes(
        anchorPattern
      );

    const supportedOperation =
      SUPPORTED_OPERATIONS.has(
        operation.operation
      );

    const planningPolicy =
      operation.payload?.planningPolicy &&
      typeof operation.payload.planningPolicy === "object"
        ? operation.payload.planningPolicy
        : null;

    const requiredChecks =
      Array.isArray(
        operation.payload?.requiredChecks
      )
        ? operation.payload.requiredChecks
        : [];

    const generatedCode =
      operation.payload?.generatedCode ||
      "";

    const targetSymbol =
      typeof operation.payload
        ?.targetSymbol === "string" &&
      operation.payload.targetSymbol
        .trim()
        .length > 0
        ? operation.payload
            .targetSymbol
            .trim()
        : null;

    const unsafeReplaceOperation =
      isUnsafeReplaceOperation(
        operation
      );

    const diagnosticOnlyGeneratedCode =
      isDiagnosticOnlyGeneratedCode(
        generatedCode
      );

    const commentOnlyGeneratedCode =
      isCommentOnlyGeneratedCode(
        generatedCode
      );

    const duplicateTargetSymbolGeneration =
      isDuplicateTargetSymbolGeneration({
        operation:
          operation.operation,
        targetFileText,
        generatedCode,
        targetSymbol
      });

    const virtualApplyEligible =
      fileExists &&
      anchorExists &&
      supportedOperation &&
      generatedCode.length > 0;

    const virtualApply =
      virtualApplyEligible
        ? applyOperationToText(
            targetFileText,
            operation
          )
        : {
            success: false,
            text:
              targetFileText,
            reason:
              "Virtual patch prerequisites are not satisfied."
          };

    const syntaxValidation =
      virtualApply.success === true
        ? validateJavaScriptSyntax({
            source:
              virtualApply.text,
            targetFile
          })
        : {
            checked: false,
            success: false,
            status: null,
            stderr: "",
            reason:
              "Syntax validation requires a successful virtual patch."
          };

    const missingCommonJsExports =
      virtualApply.success === true
        ? findMissingCommonJsExports({
            beforeSource:
              targetFileText,
            afterSource:
              virtualApply.text
          })
        : [];

    const missingExportedDeclarations =
      virtualApply.success === true
        ? findMissingExportedDeclarations({
            beforeSource:
              targetFileText,
            afterSource:
              virtualApply.text
          })
        : [];

    const semanticStructurePreserved =
      missingCommonJsExports.length === 0 &&
      missingExportedDeclarations.length === 0;

    const destructiveReplace =
      evaluateDestructiveReplace({
        operation:
          operation.operation,
        anchorPattern:
          operation.anchorPattern,
        generatedCode
      });
    const placeholderImplementationComment =
      findPlaceholderImplementationComment(
        generatedCode
      );

    const illustrativePlaceholderValue =
      findIllustrativePlaceholderValue(
        generatedCode
      );

    const targetSymbolRemovedByReplace =
      isTargetSymbolRemovedByReplace({
        operation:
          operation.operation,
        targetFileText,
        virtualFileText:
          virtualApply.text || "",
        targetSymbol
      });


    const observedSymbolRange =
      targetSymbol
        ? locateFullSymbolRange({
            filePath: targetFile,
            targetSymbol
          })
        : null;

    const observedLocalAnchor =
      targetSymbol && anchorPattern
        ? locateVerifiedLocalAnchor({
            filePath: targetFile,
            targetSymbol,
            pattern: anchorPattern
          })
        : null;

    const planningPolicyVerified =
      !planningPolicy ||
      (
        (!planningPolicy.symbolRange ||
          (observedSymbolRange?.verified === true &&
           observedSymbolRange.startLine === planningPolicy.symbolRange.startLine &&
           observedSymbolRange.endLine === planningPolicy.symbolRange.endLine)) &&
        (!planningPolicy.verifiedLocalAnchorRequired ||
          (observedLocalAnchor?.verified === true &&
           observedLocalAnchor.line === planningPolicy.verifiedLocalAnchor?.anchorLine &&
           observedLocalAnchor.pattern === planningPolicy.verifiedLocalAnchor?.anchorPattern))
      );

    const validation = {
      planningPolicy,

      observedSymbolRange,

      observedLocalAnchor,

      planningPolicyVerified,
      file:
        targetFile,

      operation:
        operation.operation || null,

      anchorPattern,

      targetSymbol,

      fileExists,

      anchorExists,

      supportedOperation,

      hasRequiredChecks:
        requiredChecks.length > 0,

      hasGeneratedCode:
        generatedCode.length > 0,

      unsafeReplaceOperation,

      diagnosticOnlyGeneratedCode,


      commentOnlyGeneratedCode,


      placeholderImplementationComment,

      illustrativePlaceholderValue,

      targetSymbolRemovedByReplace,
duplicateTargetSymbolGeneration,

      virtualApplySuccess:
        virtualApply.success === true,

      virtualApplyChanged:
        virtualApply.success === true &&
        targetFileText !==
          virtualApply.text,

      syntaxChecked:
        syntaxValidation.checked ===
        true,

      syntaxValid:
        syntaxValidation.success ===
        true,

      syntaxStatus:
        syntaxValidation.status,

      syntaxError:
        syntaxValidation.success === true
          ? null
          : (
              syntaxValidation.stderr ||
              syntaxValidation.reason
            ),

      semanticStructurePreserved,

      missingCommonJsExports,

      destructiveReplaceChecked:
        destructiveReplace.checked,

      destructiveReplace:
        destructiveReplace.destructive,

      destructiveReplaceMetrics:
        destructiveReplace,

      missingExportedDeclarations,

      readyForSafePatch:
        fileExists &&
        planningPolicyVerified &&
        anchorExists &&
        supportedOperation &&
        requiredChecks.length > 0 &&
        generatedCode.length > 0 &&
        !unsafeReplaceOperation &&
        !diagnosticOnlyGeneratedCode &&
                !commentOnlyGeneratedCode &&
        !placeholderImplementationComment &&
        !illustrativePlaceholderValue &&
        !targetSymbolRemovedByReplace &&
        !duplicateTargetSymbolGeneration &&
        virtualApply.success === true &&
        targetFileText !== virtualApply.text &&
        syntaxValidation.success === true &&
        semanticStructurePreserved &&
        !destructiveReplace.destructive
    };

    if (
      validation.virtualApplySuccess &&
      !validation.virtualApplyChanged
    ) {
      issues.push(
        `Generated patch makes no effective change in ${targetFile}.`
      );
    }

    if (!validation.fileExists) {
      issues.push(
        `Target file does not exist: ${targetFile}`
      );
    }

    if (!validation.anchorExists) {
      issues.push(
        `Patch anchor was not found: ${anchorPattern}`
      );
    }

    if (!validation.supportedOperation) {
      issues.push(
        `Unsupported patch operation: ${operation.operation}`
      );
    }

    if (!validation.hasRequiredChecks) {
      issues.push(
        `Required checks are missing for ${targetFile}`
      );
    }

    if (!validation.hasGeneratedCode) {
      issues.push(
        `Generated code is missing for ${targetFile}`
      );
    }

    if (
      validation.unsafeReplaceOperation
    ) {
      issues.push(
        `Unsafe replace anchor for generated code: ${anchorPattern}`
      );
    }
    if (
      validation.commentOnlyGeneratedCode
    ) {
      issues.push(
        `Invalid generated code: comment-only implementation for ${targetFile}`
      );
    }
    if (
      validation
        .placeholderImplementationComment
    ) {
      issues.push(
        `Invalid generated code: placeholder implementation comment in ${targetFile}: ${validation.placeholderImplementationComment}`
      );
    }

    if (
      validation
        .illustrativePlaceholderValue
    ) {
      issues.push(
        `Invalid generated code: unresolved illustrative placeholder in ${targetFile}: ${validation.illustrativePlaceholderValue}`
      );
    }

    if (
      validation
        .targetSymbolRemovedByReplace
    ) {
      issues.push(
        `Invalid replace operation: target symbol ${targetSymbol} would be removed from ${targetFile}`
      );
    }



    if (
      validation
        .diagnosticOnlyGeneratedCode
    ) {
      issues.push(
        `Invalid generated code: diagnostic-only implementation for ${targetFile}`
      );
    }

    if (
      validation
        .duplicateTargetSymbolGeneration
    ) {
      issues.push(
        `Invalid generated code: duplicate declaration of target symbol ${targetSymbol} in ${targetFile}`
      );
    }

    if (
      virtualApplyEligible &&
      !validation.virtualApplySuccess
    ) {
      issues.push(
        `Virtual patch application failed for ${targetFile}: ${virtualApply.reason}`
      );
    }

    if (
      validation.virtualApplySuccess &&
      !validation.syntaxValid
    ) {
      const syntaxMessage =
        String(
          validation.syntaxError || ""
        )
          .trim()
          .split(/\r?\n/)
          .filter(Boolean)
          .slice(0, 3)
          .join(" ");

      issues.push(
        [
          `Invalid generated code: virtual patched file failed syntax validation for ${targetFile}.`,
          syntaxMessage
        ]
          .filter(Boolean)
          .join(" ")
      );
    }

    if (
      validation.destructiveReplace
    ) {
      issues.push(
        `Destructive replace rejected for ${targetFile}: replacement retains only ${Math.round(
          destructiveReplace.characterRatio * 100
        )}% of characters and ${Math.round(
          destructiveReplace.lineRatio * 100
        )}% of lines from a substantial existing implementation.`
      );
    }

    if (
      validation.virtualApplySuccess &&
      !validation.semanticStructurePreserved
    ) {
      issues.push(
        `Semantic structure regression in ${targetFile}: removed exports=${missingCommonJsExports.join(", ") || "none"}; missing exported declarations=${missingExportedDeclarations.join(", ") || "none"}`
      );
    }

    if (
      validation.virtualApplySuccess &&
      validation.syntaxValid &&
      validation.semanticStructurePreserved
    ) {
      virtualFileTexts.set(
        targetFile,
        virtualApply.text
      );
    }

    validatedOperations.push(
      validation
    );
  }

  const readyForSafePatch =
    validatedOperations.length > 0 &&
    validatedOperations.every(
      (operation) =>
        operation.readyForSafePatch
    );

  return {
    mode:
      "patch-validator-runtime",

    version:
      "ash-local-runtime-v0.3-virtual-syntax-validation",

    success:
      readyForSafePatch,

    readyForSafePatch,

    validatedOperations,

    issueCount:
      issues.length,

    issues,

    reason:
      readyForSafePatch
        ? "Structured patch operations passed validation including virtual syntax validation."
        : "Structured patch operations are not ready for safe patch.",

    validatedAt:
      new Date().toISOString()
  };
}

module.exports = {
  validatePatchOperations,
  validateJavaScriptSyntax,
  containsSymbolDeclaration,
  isDuplicateTargetSymbolGeneration,
  extractCommonJsExportNames,
  findMissingCommonJsExports,
  findMissingExportedDeclarations,
  extractLocalDeclarationNames,
  evaluateDestructiveReplace,
  isDiagnosticOnlyGeneratedCode,
  isCommentOnlyGeneratedCode,

  findPlaceholderImplementationComment,
  findIllustrativePlaceholderValue,
  isTargetSymbolRemovedByReplace,
isUnsafeReplaceOperation
};
