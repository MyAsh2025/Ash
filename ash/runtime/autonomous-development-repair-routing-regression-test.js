"use strict";

const {
  extractCapabilityFailure,
  buildRepairTask
} = require("./autonomous-development-manager");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const repeatedGenerationViolation = {
  detected: true,
  violation:
    "Generated implementation references unavailable runtime dependency: ghostRuntime",
  occurrenceCount: 3,
  attempts: [0, 1, 2],
  distinctRejectedImplementationCount: 3,
  generatedImplementationsChanged: true,
  suspectedValidationOrGuidanceDefect: true,
  reason:
    "The same generation violation persisted across multiple distinct generated implementations."
};

const retryDiagnostics = [
  {
    attempt: 0,
    violation: repeatedGenerationViolation.violation,
    executableCodeTemplate:
      "function target(){ return ghostRuntime.one(); }"
  },
  {
    attempt: 1,
    violation: repeatedGenerationViolation.violation,
    executableCodeTemplate:
      "function target(){ return ghostRuntime.two(); }"
  },
  {
    attempt: 2,
    violation: repeatedGenerationViolation.violation,
    executableCodeTemplate:
      "function target(){ return ghostRuntime.three(); }"
  }
];

const providerResult = {
  success: false,
  providerName: "openai-command",
  executableCodeTemplate: "",
  reason:
    "OpenAI implementation regeneration did not satisfy the function-body contract.",
  retryAttempts: 2,
  retryLimit: 2,
  retryViolation: repeatedGenerationViolation.violation,
  repeatedGenerationViolation,
  rejectedExecutableCodeTemplate:
    retryDiagnostics[2].executableCodeTemplate,
  rejectedExecutableCodeLength:
    retryDiagnostics[2].executableCodeTemplate.length,
  retryDiagnostics,
  requestId: "permanent-repair-routing-regression"
};

const pipelineResult = {
  success: false,
  failureStage: "implementation-provider",
  reason: providerResult.reason,
  implementationProvider: {
    success: false,
    reason: providerResult.reason,
    providerResult
  },
  patchValidator: {
    issues: [],
    validatedOperations: []
  },
  editPlanner: {
    edits: [
      {
        file:
          "ash/providers/openai-implementation-provider.mjs"
      }
    ]
  }
};

/*
 * This shape intentionally matches runCapabilityLoop output.
 * A previous disposable probe passed a single step directly to
 * extractCapabilityFailure, which never exercised the real contract.
 */
const capabilityLoop = {
  success: false,
  stopReason: "capability_loop_failed",
  steps: [
    {
      action: "development_pipeline",
      classification: {
        success: false,
        reason: providerResult.reason
      },
      dispatchResult: {
        classification: {
          success: false,
          reason: providerResult.reason
        },
        result: {
          result: pipelineResult
        }
      }
    }
  ]
};

const failure =
  extractCapabilityFailure(capabilityLoop);

assert(failure, "Failure extraction returned no result.");
assert(
  failure.failureStage === "implementation-provider",
  "Failure stage was not preserved."
);
assert(
  failure.targetFile ===
    "ash/providers/openai-implementation-provider.mjs",
  "Target file was not preserved."
);
assert(
  failure.providerFailure === providerResult,
  "Provider failure payload was not preserved by identity."
);
assert(
  failure.providerFailure.retryAttempts === 2,
  "retryAttempts was not preserved."
);
assert(
  failure.providerFailure.retryLimit === 2,
  "retryLimit was not preserved."
);
assert(
  failure.providerFailure.retryViolation ===
    repeatedGenerationViolation.violation,
  "retryViolation was not preserved."
);
assert(
  failure.providerFailure.repeatedGenerationViolation
    ?.suspectedValidationOrGuidanceDefect === true,
  "Repeated-generation diagnosis was not preserved."
);
assert(
  failure.providerFailure.repeatedGenerationViolation
    ?.generatedImplementationsChanged === true,
  "Changed-generation evidence was not preserved."
);
assert(
  failure.providerFailure.retryDiagnostics === retryDiagnostics,
  "retryDiagnostics were not preserved by identity."
);
assert(
  failure.providerFailure.requestId ===
    "permanent-repair-routing-regression",
  "Provider requestId was not preserved."
);

const repairTask = buildRepairTask({
  failure,
  previousTask: {
    task: "Improve invented runtime dependency validation",
    targetFile:
      "ash/providers/openai-implementation-provider.mjs",
    targetSymbol:
      "findInventedRuntimeDependencyViolation"
  },
  cycleIndex: 2
});

assert(repairTask, "Repair task was not created.");
assert(
  repairTask.providerFailure === providerResult,
  "Repair task did not preserve provider failure payload by identity."
);
assert(
  repairTask.providerFailure.retryDiagnostics === retryDiagnostics,
  "Repair task did not preserve retryDiagnostics."
);
assert(
  repairTask.providerFailure.repeatedGenerationViolation ===
    repeatedGenerationViolation,
  "Repair task did not preserve repeated-generation evidence."
);
assert(
  repairTask.targetSymbol ===
    "findInventedRuntimeDependencyViolation",
  "Repair task did not preserve target symbol."
);
assert(
  repairTask.cycleIndex === 2,
  "Repair task did not preserve cycle index."
);

console.log(
  JSON.stringify(
    {
      mode:
        "autonomous-development-repair-routing-regression-test",
      success: true,
      failureStage: failure.failureStage,
      targetFile: failure.targetFile,
      retryAttempts:
        repairTask.providerFailure.retryAttempts,
      retryLimit:
        repairTask.providerFailure.retryLimit,
      retryDiagnosticsCount:
        repairTask.providerFailure.retryDiagnostics.length,
      repeatedGenerationViolation:
        repairTask.providerFailure.repeatedGenerationViolation,
      requestId:
        repairTask.providerFailure.requestId
    },
    null,
    2
  )
);
