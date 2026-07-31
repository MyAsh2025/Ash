"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
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

  const destructive =
    substantialOriginal &&
    severeCharacterReduction &&
    severeLineReduction;

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
    reason:
      destructive
        ? "Large replace operation would remove most of the existing implementation."
        : "Replace size remains within the structural safety threshold."
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

    const validation = {
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
        anchorExists &&
        supportedOperation &&
        requiredChecks.length > 0 &&
        generatedCode.length > 0 &&
        !unsafeReplaceOperation &&
        !diagnosticOnlyGeneratedCode &&
        !duplicateTargetSymbolGeneration &&
        virtualApply.success === true &&
        syntaxValidation.success === true &&
        semanticStructurePreserved &&
        !destructiveReplace.destructive
    };

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
  evaluateDestructiveReplace,
  isDiagnosticOnlyGeneratedCode,
  isUnsafeReplaceOperation
};
