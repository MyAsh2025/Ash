"use strict";

function buildGeneratedCodeForOperation(operation) {
  if (!operation) {
    return {
      generatedCode: "",
      missingReason: "No patch operation provided."
    };
  }

  if (!operation.file) {
    return {
      generatedCode: "",
      missingReason: "Patch operation target file is missing."
    };
  }

  if (!operation.operation) {
    return {
      generatedCode: "",
      missingReason: "Patch operation type is missing."
    };
  }

  if (!["insert-before", "insert-after", "replace"].includes(operation.operation)) {
    return {
      generatedCode: "",
      missingReason: `Unsupported operation ${operation.operation}.`
    };
  }

  if (!operation.anchorPattern) {
    return {
      generatedCode: "",
      missingReason: "Patch operation anchorPattern is missing."
    };
  }

  if (operation.file !== "ash/runtime/patch-planner.js") {
    return {
      generatedCode: "",
      missingReason: `No generator strategy registered for ${operation.file}.`
    };
  }

  if (operation.operation !== "insert-before") {
    return {
      generatedCode: "",
      missingReason: `Unsupported operation ${operation.operation} for ash/runtime/patch-planner.js.`
    };
  }

  if (operation.anchorPattern !== "module.exports") {
    return {
      generatedCode: "",
      missingReason: `Unsupported anchor ${operation.anchorPattern} for ash/runtime/patch-planner.js.`
    };
  }

  return {
    generatedCode: [
      "function describePatchPlannerExtensionPoint() {",
      "  return {",
      "    mode: \"patch-planner-extension-point\",",
      "    version: \"ash-local-runtime-v0.1\",",
      "    purpose: \"Expose a verified extension point for repository-discovered implementation work.\",",
      "    ready: true",
      "  };",
      "}",
      ""
    ].join("\n"),
    missingReason: null
  };
}

function generateCodeForPatch(patchGenerator) {
  const operations = Array.isArray(patchGenerator?.operations)
    ? patchGenerator.operations
    : [];

  const generatedOperations = operations.map((operation) => {
    const generation = buildGeneratedCodeForOperation(operation);
    const generatedCode = generation.generatedCode || "";

    return {
      ...operation,
      payload: {
        ...(operation.payload || {}),
        generatedCode,
        codeGenerated: generatedCode.length > 0,
        missingReason: generation.missingReason || null,
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

