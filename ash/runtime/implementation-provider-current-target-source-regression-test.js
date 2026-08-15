"use strict";

const assert =
  require("assert");

const {
  buildProviderInput
} =
  require("./implementation-provider");

function buildInput({
  targetFile,
  targetSymbol
}) {
  return buildProviderInput({
    implementationPlanner: {
      task:
        "Verify complete current target source extraction.",
      targetFile,
      targetSymbol,
      symbolType:
        "function",
      expectedBehavior: [
        "Preserve the complete existing target function."
      ],
      implementationType:
        "runtime-improvement",
      strategy:
        "concrete-implementation-planning",
      recommendedOperation:
        "replace"
    },
    targetLocator: {
      repositoryTargetFile:
        targetFile,
      targetSymbol,
      symbolType:
        "function"
    }
  });
}

const destructured =
  buildInput({
    targetFile:
      "ash/runtime/implementation-provider.js",
    targetSymbol:
      "extractCurrentTargetSource"
  });

assert.ok(
  destructured.currentTargetSource.includes(
    "const escapedTargetSymbol"
  ),
  "Destructured function body must be preserved."
);

assert.ok(
  destructured.currentTargetSource.includes(
    "let depth = 0"
  ),
  "Brace scanner must be inside currentTargetSource."
);

assert.ok(
  destructured.currentTargetSource.includes(
    'return "";'
  ),
  "Final return must be preserved."
);

assert.ok(
  !destructured.currentTargetSource.includes(
    "function buildProviderInput"
  ),
  "Extraction must stop at the target function boundary."
);

assert.ok(
  destructured.currentTargetSource.length > 1000,
  "Extraction must not collapse to the declaration header."
);

const ordinary =
  buildInput({
    targetFile:
      "ash/runtime/implementation-provider.js",
    targetSymbol:
      "normalizeProviderResult"
  });

assert.ok(
  ordinary.currentTargetSource.includes(
    "function normalizeProviderResult"
  ),
  "Ordinary function extraction must remain supported."
);

assert.ok(
  ordinary.currentTargetSource.length > 100,
  "Ordinary function body must remain available."
);

console.log(
  JSON.stringify(
    {
      success: true,
      checks: {
        destructuredFunctionBodyPreserved:
          true,
        braceScannerPreserved:
          true,
        finalReturnPreserved:
          true,
        extractionStopsAtTargetBoundary:
          true,
        headerOnlyRegressionRejected:
          true,
        ordinaryFunctionStillSupported:
          true
      },
      evidence: {
        destructuredCurrentLength:
          destructured.currentTargetSource.length,
        destructuredCompleteLength:
          destructured.completeTargetSource.length,
        ordinaryCurrentLength:
          ordinary.currentTargetSource.length
      }
    },
    null,
    2
  )
);