"use strict";

const fs = require("fs");
const path = require("path");

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

function escapeRegularExpression(value = "") {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isDiagnosticOnlyGeneratedCode(generatedCode = "") {
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

function buildDeclarationPatterns(targetSymbol = "") {
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
  ).some((pattern) => pattern.test(source));
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

function validatePatchOperations(codeGenerator) {
  const operations = Array.isArray(
    codeGenerator?.operations
  )
    ? codeGenerator.operations
    : [];

  const validatedOperations = [];
  const issues = [];

  for (const operation of operations) {
    const targetFile = operation.file || "";
    const absolutePath = path.join(
      process.cwd(),
      targetFile
    );

    const fileExists =
      targetFile.length > 0 &&
      fs.existsSync(absolutePath);

    const targetFileText = fileExists
      ? fs.readFileSync(absolutePath, "utf8")
      : "";

    const anchorPattern =
      operation.anchorPattern || "";

    const anchorExists =
      fileExists &&
      anchorPattern.length > 0 &&
      targetFileText.includes(anchorPattern);

    const supportedOperation =
      SUPPORTED_OPERATIONS.has(
        operation.operation
      );

    const requiredChecks = Array.isArray(
      operation.payload?.requiredChecks
    )
      ? operation.payload.requiredChecks
      : [];

    const generatedCode =
      operation.payload?.generatedCode || "";

    const targetSymbol =
      typeof operation.payload?.targetSymbol ===
        "string" &&
      operation.payload.targetSymbol.trim().length > 0
        ? operation.payload.targetSymbol.trim()
        : null;

    const unsafeReplaceOperation =
      isUnsafeReplaceOperation(operation);

    const diagnosticOnlyGeneratedCode =
      isDiagnosticOnlyGeneratedCode(generatedCode);

    const duplicateTargetSymbolGeneration =
      isDuplicateTargetSymbolGeneration({
        operation: operation.operation,
        targetFileText,
        generatedCode,
        targetSymbol
      });

    const validation = {
      file: targetFile,
      operation: operation.operation || null,
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
      readyForSafePatch:
        fileExists &&
        anchorExists &&
        supportedOperation &&
        requiredChecks.length > 0 &&
        generatedCode.length > 0 &&
        !unsafeReplaceOperation &&
        !diagnosticOnlyGeneratedCode &&
        !duplicateTargetSymbolGeneration
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

    if (validation.unsafeReplaceOperation) {
      issues.push(
        `Unsafe replace anchor for generated code: ${anchorPattern}`
      );
    }

    if (validation.diagnosticOnlyGeneratedCode) {
      issues.push(
        `Invalid generated code: diagnostic-only implementation for ${targetFile}`
      );
    }

    if (
      validation.duplicateTargetSymbolGeneration
    ) {
      issues.push(
        `Invalid generated code: duplicate declaration of target symbol ${targetSymbol} in ${targetFile}`
      );
    }

    validatedOperations.push(validation);
  }

  const readyForSafePatch =
    validatedOperations.length > 0 &&
    validatedOperations.every(
      (operation) =>
        operation.readyForSafePatch
    );

  return {
    mode: "patch-validator-runtime",
    version:
      "ash-local-runtime-v0.2-duplicate-symbol-guard",
    success: readyForSafePatch,
    readyForSafePatch,
    validatedOperations,
    issueCount: issues.length,
    issues,
    reason: readyForSafePatch
      ? "Structured patch operations passed validation."
      : "Structured patch operations are not ready for safe patch.",
    validatedAt: new Date().toISOString()
  };
}

module.exports = {
  validatePatchOperations,
  containsSymbolDeclaration,
  isDuplicateTargetSymbolGeneration,
  isDiagnosticOnlyGeneratedCode,
  isUnsafeReplaceOperation
};
