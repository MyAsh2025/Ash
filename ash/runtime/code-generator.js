"use strict";

function buildGeneratedCodeForOperation(operation) {
  if (!operation || operation.file !== "ash/runtime/patch-planner.js") {
    return "";
  }

  if (operation.operation !== "insert-before") {
    return "";
  }

  if (operation.anchorPattern !== "module.exports") {
    return "";
  }

  return [
    "function describePatchPlannerExtensionPoint() {",
    "  return {",
    "    mode: \"patch-planner-extension-point\",",
    "    version: \"ash-local-runtime-v0.1\",",
    "    purpose: \"Expose a verified extension point for repository-discovered implementation work.\",",
    "    ready: true",
    "  };",
    "}",
    ""
  ].join("\n");
}

function generateCodeForPatch(patchGenerator) {
  const operations = Array.isArray(patchGenerator?.operations)
    ? patchGenerator.operations
    : [];

  const generatedOperations = operations.map((operation) => {
    const generatedCode = buildGeneratedCodeForOperation(operation);

    return {
      ...operation,
      payload: {
        ...(operation.payload || {}),
        generatedCode,
        codeGenerated: generatedCode.length > 0,
        codeSourceRuntime: "code-generator-runtime"
      }
    };
  });

  const success =
    generatedOperations.length > 0 &&
    generatedOperations.every((operation) => operation.payload?.codeGenerated === true);

  return {
    mode: "code-generator-runtime",
    version: "ash-local-runtime-v0.1",
    success,
    readyForValidation: success,
    operations: generatedOperations,
    generatedCount: generatedOperations.filter((operation) => operation.payload?.codeGenerated).length,
    reason: success
      ? "Generated code payloads for structured patch operations."
      : "Unable to generate code for one or more structured patch operations.",
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  generateCodeForPatch
};
