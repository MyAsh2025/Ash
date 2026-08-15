"use strict";

const fs = require("fs");
const path = require("path");

function resolveVerifiedAnchorLineStart({
  text = "",
  anchor = "",
  anchorLine = null
} = {}) {
  if (
    typeof text !== "string" ||
    typeof anchor !== "string" ||
    anchor.length === 0 ||
    !Number.isInteger(anchorLine) ||
    anchorLine <= 0
  ) {
    return {
      success: false,
      index: -1,
      reason: "Verified anchor line is unavailable."
    };
  }

  let lineStart = 0;

  for (let line = 1; line < anchorLine; line += 1) {
    const newlineIndex = text.indexOf("\n", lineStart);

    if (newlineIndex < 0) {
      return {
        success: false,
        index: -1,
        reason: "Verified anchor line is outside the target text."
      };
    }

    lineStart = newlineIndex + 1;
  }

  const newlineIndex = text.indexOf("\n", lineStart);

  const lineEnd =
    newlineIndex >= 0
      ? newlineIndex
      : text.length;

  const lineText =
    text.slice(lineStart, lineEnd);

  if (!lineText.includes(anchor)) {
    return {
      success: false,
      index: -1,
      reason: "Verified anchor was not found on the expected anchor line."
    };
  }

  return {
    success: true,
    index: lineStart,
    reason: "Verified anchor line resolved."
  };
}

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
      reason: operation.payload?.missingReason || "Generated code is empty.",
      missingReason: operation.payload?.missingReason || null
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
    const verifiedAnchor =
      resolveVerifiedAnchorLineStart({
        text,
        anchor,
        anchorLine: operation.anchorLine
      });

    if (!verifiedAnchor.success) {
      return {
        success: false,
        text,
        reason: verifiedAnchor.reason
      };
    }

    const insertion =
      generatedCode.endsWith("\n")
        ? generatedCode
        : `${generatedCode}\n`;

    return {
      success: true,
      text:
        text.slice(0, verifiedAnchor.index) +
        insertion +
        text.slice(verifiedAnchor.index),
      reason:
        "Inserted generated code before verified anchor line."
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
        reason: applied.reason,
        missingReason: applied.missingReason || null
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


function rollbackAppliedPatch({
  patchApplyEngine,
  projectPath = process.cwd()
} = {}) {
  const applyResults = Array.isArray(patchApplyEngine?.results) ? patchApplyEngine.results : [];
  const candidates = applyResults.filter((result) =>
    result?.success === true && result?.dryRun !== true && result?.changed === true &&
    typeof result?.backupPath === "string" && result.backupPath.length > 0
  );
  const results = [];
  for (const result of candidates) {
    const targetFile = result.file || "";
    const absolutePath = path.resolve(projectPath, targetFile);
    const backupPath = path.resolve(result.backupPath);
    if (!fs.existsSync(backupPath)) {
      results.push({ file: targetFile, success: false, restored: false, backupPath, reason: "Patch backup does not exist." });
      continue;
    }
    try {
      const backupText = fs.readFileSync(backupPath, "utf8");
      fs.writeFileSync(absolutePath, backupText, "utf8");
      const restored = fs.readFileSync(absolutePath, "utf8") === backupText;
      results.push({ file: targetFile, success: restored, restored, backupPath, reason: restored ? "Applied patch was rolled back from verified backup." : "Rollback verification failed." });
    } catch (error) {
      results.push({ file: targetFile, success: false, restored: false, backupPath, reason: error?.message || "Patch rollback failed." });
    }
  }
  const success = candidates.length > 0 && results.length === candidates.length && results.every((result) => result.success === true && result.restored === true);
  return {
    mode: "patch-apply-rollback", success, attempted: candidates.length > 0, results,
    reason: candidates.length === 0 ? "No applied patch with a verified backup was available for rollback." : success ? "Applied patch was rolled back successfully." : "One or more applied patch rollbacks failed.",
    rolledBackAt: new Date().toISOString()
  };
}

module.exports = {
  applyValidatedPatch,
  applyOperationToText,
  rollbackAppliedPatch
};
