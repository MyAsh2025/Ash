"use strict";

const fs = require("fs");
const path = require("path");

function applyOperationToText(text, operation) {
  const anchor = operation.anchorPattern;
  const generatedCode = operation.payload?.generatedCode || "";

  if (!anchor || !text.includes(anchor)) {
    return {
      success: false,
      text,
      reason: "Anchor not found."
    };
  }

  if (!generatedCode) {
    return {
      success: false,
      text,
      reason: "Generated code is empty."
    };
  }

  if (text.includes(generatedCode.trim())) {
    return {
      success: true,
      skipped: true,
      alreadyImplemented: true,
      text,
      reason: "Generated code already exists."
    };
  }

  if (operation.operation === "insert-before") {
    return {
      success: true,
      text: text.replace(anchor, `${generatedCode}${anchor}`),
      reason: "Inserted generated code before anchor."
    };
  }

  if (operation.operation === "insert-after") {
    return {
      success: true,
      text: text.replace(anchor, `${anchor}\n${generatedCode}`),
      reason: "Inserted generated code after anchor."
    };
  }

  if (operation.operation === "replace") {
    return {
      success: true,
      text: text.replace(anchor, generatedCode),
      reason: "Replaced anchor with generated code."
    };
  }

  return {
    success: false,
    text,
    reason: `Unsupported operation: ${operation.operation}`
  };
}

function applyValidatedPatch({
  patchValidator,
  codeGenerator,
  dryRun = true
} = {}) {
  const operations = Array.isArray(codeGenerator?.operations)
    ? codeGenerator.operations
    : [];

  if (!patchValidator?.readyForSafePatch) {
    return {
      mode: "patch-apply-engine-runtime",
      version: "ash-local-runtime-v0.1",
      success: false,
      applied: false,
      dryRun,
      reason: "Patch validator did not approve safe patch.",
      results: [],
      appliedAt: new Date().toISOString()
    };
  }

  const results = [];

  for (const operation of operations) {
    const targetFile = operation.file || "";
    const absolutePath = path.join(process.cwd(), targetFile);

    if (!fs.existsSync(absolutePath)) {
      results.push({
        file: targetFile,
        success: false,
        reason: "Target file does not exist."
      });
      continue;
    }

    const beforeText = fs.readFileSync(absolutePath, "utf8");
    const applied = applyOperationToText(beforeText, operation);

    if (!applied.success) {
      results.push({
        file: targetFile,
        success: false,
        reason: applied.reason
      });
      continue;
    }

    const backupPath = `${absolutePath}.backup.patch-apply-${Date.now()}`;

    if (!dryRun) {
      fs.copyFileSync(absolutePath, backupPath);
      fs.writeFileSync(absolutePath, applied.text, "utf8");
    }

    results.push({
      file: targetFile,
      success: true,
      skipped: applied.skipped === true,
      alreadyImplemented: applied.alreadyImplemented === true,
      dryRun,
      backupPath: dryRun || applied.skipped === true ? null : backupPath,
      changed: beforeText !== applied.text,
      reason: applied.reason
    });
  }

  const success =
    results.length > 0 &&
    results.every((result) => result.success === true);

  return {
    mode: "patch-apply-engine-runtime",
    version: "ash-local-runtime-v0.1",
    success,
    applied: success && !dryRun && results.some((result) => result.changed === true),
    dryRun,
    results,
    reason: success
      ? dryRun
        ? "Validated patch can be applied."
        : results.every((result) => result.alreadyImplemented === true)
          ? "Validated patch already implemented."
          : "Validated patch applied successfully."
      : "One or more patch operations failed.",
    appliedAt: new Date().toISOString()
  };
}

module.exports = {
  applyValidatedPatch,
  applyOperationToText
};


