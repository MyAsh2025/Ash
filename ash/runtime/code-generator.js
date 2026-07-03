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

  return {
    generatedCode: [
      "function describeGeneratedImplementation() {",
      "  return {",
      "    mode: \"generated-implementation-diagnostic\",",
      "    version: \"ash-local-runtime-v0.1\",",
      `    targetFile: \"${operation.file}\",`,
      `    operation: \"${operation.operation}\",`,
      `    anchorPattern: \"${operation.anchorPattern}\",`,
      "    generated: true",
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

