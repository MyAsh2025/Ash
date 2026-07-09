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

function isUnsafeReplaceOperation(operation = {}) {
  return (
    operation.operation === "replace" &&
    UNSAFE_REPLACE_ANCHORS.has(operation.anchorPattern)
  );
}

function validatePatchOperations(patchGenerator) {
  const operations = Array.isArray(patchGenerator?.operations)
    ? patchGenerator.operations
    : [];

  const validatedOperations = [];
  const issues = [];

  for (const operation of operations) {
    const targetFile = operation.file || "";
    const absolutePath = path.join(process.cwd(), targetFile);
    const fileExists = Boolean(targetFile) && fs.existsSync(absolutePath);
    const text = fileExists ? fs.readFileSync(absolutePath, "utf8") : "";
    const anchorPattern = operation.anchorPattern || "";
    const anchorExists = Boolean(anchorPattern) && text.includes(anchorPattern);
    const supportedOperation = SUPPORTED_OPERATIONS.has(operation.operation);
    const requiredChecks = Array.isArray(operation.payload?.requiredChecks)
      ? operation.payload.requiredChecks
      : [];
    const generatedCode = operation.payload?.generatedCode || "";
    const unsafeReplaceOperation = isUnsafeReplaceOperation(operation);

    const validation = {
      file: targetFile,
      operation: operation.operation || null,
      anchorPattern,
      fileExists,
      anchorExists,
      supportedOperation,
      hasRequiredChecks: requiredChecks.length > 0,
      hasGeneratedCode: generatedCode.length > 0,
      unsafeReplaceOperation,
      readyForSafePatch:
        fileExists &&
        anchorExists &&
        supportedOperation &&
        requiredChecks.length > 0 &&
        generatedCode.length > 0 &&
        !unsafeReplaceOperation
    };

    if (!validation.fileExists) {
      issues.push(`Target file does not exist: ${targetFile}`);
    }

    if (!validation.anchorExists) {
      issues.push(`Anchor not found: ${anchorPattern}`);
    }

    if (!validation.supportedOperation) {
      issues.push(`Unsupported operation: ${operation.operation}`);
    }

    if (!validation.hasRequiredChecks) {
      issues.push(`Missing required checks for: ${targetFile}`);
    }

    if (!validation.hasGeneratedCode) {
      issues.push(`Generated code is missing for: ${targetFile}`);
    }

    if (validation.unsafeReplaceOperation) {
      issues.push(`Unsafe replace anchor for generated code: ${anchorPattern}`);
    }

    validatedOperations.push(validation);
  }

  const readyForSafePatch =
    validatedOperations.length > 0 &&
    validatedOperations.every((operation) => operation.readyForSafePatch);

  return {
    mode: "patch-validator-runtime",
    version: "ash-local-runtime-v0.1",
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
  validatePatchOperations
};

