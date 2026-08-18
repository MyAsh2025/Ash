"use strict";

const assert = require("assert");

const {
  buildImplementationPlanner
} = require("./implementation-planner");
const {
  buildPatchPlanner
} = require("./patch-planner");
const {
  buildTargetLocator
} = require("./target-locator");
const {
  buildEditPlanner
} = require("./edit-planner");
const {
  buildProviderInput,
  resolveImplementationProvider
} = require("./implementation-provider");

const targetFile =
  "ash/runtime/implementation-provider.js";
const targetSymbol =
  "buildProviderInput";

const implementationPlanner =
  buildImplementationPlanner({
    task:
      "Repair buildProviderInput after a destructive replacement was rejected.",
    targetFile,
    work: ["implementation"],
    recommendedOperation: "replace",
    targetSymbol,
    symbolType: "function",
    expectedBehavior: [
      "Preserve the existing target function and add a local repair."
    ],
    repairAction: "repair_patch",
    failureStage: "patch-validator",
    validatedOperations: [
      {
        operation: "replace",
        destructiveReplaceChecked: true,
        destructiveReplace: true
      }
    ]
  });

assert.strictEqual(
  implementationPlanner.recommendedOperation,
  "insert-after",
  "Implementation Planner must preserve the local repair insert-after operation."
);

const localRepairIntent = {
  ...implementationPlanner.localRepairIntent,
  localAnchorPattern:
    "const completeTargetSource ="
};

const patchPlanner = buildPatchPlanner({
  task: implementationPlanner.task,
  targetFile,
  work: implementationPlanner.work,
  executionPolicy: {
    plannedActions: ["prepare_patch_plan"]
  },
  targetSymbol,
  symbolType: "function",
  expectedBehavior:
    implementationPlanner.expectedBehavior,
  recommendedOperation:
    implementationPlanner.recommendedOperation,
  localRepairIntent
});

assert.strictEqual(
  patchPlanner.recommendedOperation,
  "insert-after",
  "Patch Planner must preserve the local repair operation."
);
assert.deepStrictEqual(
  patchPlanner.localRepairIntent,
  localRepairIntent,
  "Patch Planner must preserve the local repair intent."
);

const targetLocator = buildTargetLocator({
  patchPlanner
});

assert.strictEqual(
  targetLocator.verifiedLocalAnchor?.verified,
  true,
  "The regression requires a verified local anchor."
);
assert.strictEqual(
  targetLocator.functionBodyAnchor?.verified,
  true,
  "The regression requires a verified function-body anchor."
);

const editPlanner = buildEditPlanner({
  patchPlanner,
  targetLocator
});
const edit = editPlanner.edits[0];

assert.strictEqual(
  edit?.operation,
  "insert-after",
  "Edit Planner must choose insert-after for the function-body repair."
);
assert.strictEqual(
  edit?.anchorPattern,
  targetLocator.functionBodyAnchor.pattern,
  "Edit Planner must anchor the insertion at the function-body opening."
);

const providerInput = buildProviderInput({
  implementationPlanner: {
    ...implementationPlanner,
    localRepairIntent
  },
  targetLocator
});

assert.strictEqual(
  providerInput.recommendedOperation,
  edit.operation,
  "Provider input operation must match the actual patch operation."
);
assert.strictEqual(
  providerInput.verifiedLocalAnchor?.pattern,
  edit.anchorPattern,
  "Provider input anchor must match the Edit Planner anchor."
);
assert.strictEqual(
  providerInput.requiredOutputShape,
  "statements-only",
  "Function-body insertion must require statements-only provider output."
);

const completeTargetFunctionResult =
  resolveImplementationProvider({
    implementationPlanner: {
      ...implementationPlanner,
      localRepairIntent
    },
    targetLocator,
    provider: () => ({
      success: true,
      providerName:
        "local-repair-anchor-regression-provider",
      executableCodeTemplate: [
        "function buildProviderInput() {",
        "  return {};",
        "}"
      ].join("\n")
    })
  });

assert.strictEqual(
  completeTargetFunctionResult.success,
  false,
  "A complete target function must be rejected at the statements-only provider boundary."
);
assert.match(
  completeTargetFunctionResult.reason,
  /required output shape statements-only was not satisfied/,
  "The existing statements-only semantic enforcement must perform the rejection."
);

console.log(
  JSON.stringify(
    {
      mode:
        "implementation-provider-local-repair-anchor-regression-test",
      success: true,
      implementationPlannerOperation:
        implementationPlanner.recommendedOperation,
      patchPlannerOperation:
        patchPlanner.recommendedOperation,
      editOperation: edit.operation,
      editAnchor: edit.anchorPattern,
      providerOperation:
        providerInput.recommendedOperation,
      providerAnchor:
        providerInput.verifiedLocalAnchor.pattern,
      requiredOutputShape:
        providerInput.requiredOutputShape,
      completeTargetFunctionRejectedAtProviderBoundary:
        completeTargetFunctionResult.success === false,
      providerBoundaryReason:
        completeTargetFunctionResult.reason
    },
    null,
    2
  )
);
