"use strict";

const assert = require("assert");

function installModuleStub(modulePath, exportsValue) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: exportsValue,
    children: [],
    paths: []
  };
}

const modulePaths = [
  "./runtime-state",
  "./repository-observation-runtime",
  "./task-discovery-runtime",
  "./capability-loop",
  "./corecheck-runtime",
  "./autonomous-development-manager"
].map(require.resolve);

const savedEntries = new Map();
for (const modulePath of modulePaths) {
  if (require.cache[modulePath]) {
    savedEntries.set(modulePath, require.cache[modulePath]);
  }
  delete require.cache[modulePath];
}

const inference = {
  targetSymbol: null,
  symbolType: null,
  source: "ambiguous-exported-functions",
  candidates: [
    "buildImplementationPlanner",
    "inferExportedFunctionSymbol"
  ],
  taskMentionedCandidates: [],
  scoredCandidates: [
    {
      symbol: "buildImplementationPlanner",
      score: 20,
      matches: [{ type: "symbol-term", weight: 10 }]
    },
    {
      symbol: "inferExportedFunctionSymbol",
      score: 20,
      matches: [{ type: "symbol-term", weight: 10 }]
    }
  ],
  reason:
    "Multiple exported function candidates were found, and task semantics did not resolve them safely."
};

const targetSymbolResolution = {
  status: "ambiguous",
  targetFile: "ash/runtime/implementation-planner.js",
  targetSymbol: null,
  inference
};

let scenario = "ambiguous";
let capabilityCalls = 0;

function failedCapabilityLoop(pipelineResult) {
  return {
    success: false,
    stopReason: "dispatch_failed",
    steps: [
      {
        action: "development_pipeline",
        classification: {
          success: false,
          reason: pipelineResult.reason
        },
        dispatchResult: {
          classification: {
            success: false,
            reason: pipelineResult.reason
          },
          result: { result: pipelineResult }
        }
      }
    ]
  };
}

try {
  installModuleStub("./runtime-state", {
    readAutonomousCompletedTasks: () => ({ tasks: [] }),
    writeAutonomousCompletedTask: () => ({ saved: true })
  });
  installModuleStub("./repository-observation-runtime", {
    observeRepository: () => ({ branch: "regression" })
  });
  installModuleStub("./task-discovery-runtime", {
    discoverTaskFromRepository: () => ({ discovered: false, task: null })
  });
  installModuleStub("./corecheck-runtime", {
    runCoreCheck: () => ({ success: true })
  });
  installModuleStub("./capability-loop", {
    runCapabilityLoop: () => {
      capabilityCalls += 1;
      if (scenario === "ambiguous") {
        const reason =
          "Target symbol resolution is ambiguous for ash/runtime/implementation-planner.js; Queue Task Adapter stopped before Provider generation.";
        return failedCapabilityLoop({
          success: false,
          failureStage: "queue-task-adapter",
          reason,
          queueTaskAdapter: {
            success: false,
            reason,
            targetSymbolResolution,
            implementationPlanner: {
              targetSymbol: null,
              concretePlanReady: false,
              targetSymbolInference: inference
            }
          },
          implementationProvider: {
            success: false,
            reason: "Implementation provider requires a target symbol."
          },
          patchValidator: {
            issues: [],
            validatedOperations: []
          },
          editPlanner: {
            edits: [{ file: "ash/runtime/implementation-planner.js" }]
          }
        });
      }

      return failedCapabilityLoop({
        success: false,
        failureStage: "patch-validator",
        reason: "Repairable patch validation failure.",
        implementationProvider: { success: true },
        patchValidator: {
          issues: ["Repairable fixture issue."],
          validatedOperations: [
            {
              file: "ash/runtime/autonomous-development-manager.js",
              targetSymbol: "runAutonomousDevelopmentManager"
            }
          ]
        },
        editPlanner: {
          edits: [{ file: "ash/runtime/autonomous-development-manager.js" }]
        }
      });
    }
  });

  delete require.cache[require.resolve("./autonomous-development-manager")];
  const {
    runAutonomousDevelopmentManager
  } = require("./autonomous-development-manager");

  const ambiguous = runAutonomousDevelopmentManager({
    task:
      "Improve ash/runtime/implementation-planner.js without selecting an unverified exported function.",
    context: { projectPath: process.cwd() },
    maxCycles: 3,
    dryRun: true
  });

  assert.strictEqual(capabilityCalls, 1, "Ambiguity must stop after one cycle.");
  assert.strictEqual(ambiguous.cycles.length, 1, "Ambiguity must not enter cycle 2.");
  assert.strictEqual(ambiguous.success, false);
  assert.strictEqual(ambiguous.stopped, true);
  assert.strictEqual(
    ambiguous.stopReason,
    "target_symbol_resolution_unresolved",
    "Manager must return the dedicated target-symbol stop reason."
  );
  assert.strictEqual(ambiguous.failureStage, "queue-task-adapter");
  assert.strictEqual(ambiguous.pendingRepairTask, null);
  assert.strictEqual(ambiguous.cycles[0].repairTask, null);
  assert.strictEqual(ambiguous.cycles[0].selectedTask.targetSymbol, null);
  assert.strictEqual(ambiguous.targetSymbolResolution, targetSymbolResolution);
  assert.strictEqual(ambiguous.targetSymbolInference, inference);
  assert.strictEqual(
    ambiguous.targetSymbolInference.source,
    "ambiguous-exported-functions"
  );
  assert.deepStrictEqual(
    ambiguous.targetSymbolInference.candidates,
    inference.candidates
  );
  assert.deepStrictEqual(
    ambiguous.targetSymbolInference.scoredCandidates,
    inference.scoredCandidates
  );
  assert.strictEqual(ambiguous.targetSymbolInference.reason, inference.reason);
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(ambiguous, "providerFailure"),
    false,
    "A secondary Provider result must not be promoted into primary failure evidence."
  );

  scenario = "repairable";
  capabilityCalls = 0;
  const repairable = runAutonomousDevelopmentManager({
    task:
      "Repair runAutonomousDevelopmentManager in ash/runtime/autonomous-development-manager.js",
    context: { projectPath: process.cwd() },
    maxCycles: 2,
    dryRun: true
  });

  assert.strictEqual(capabilityCalls, 2, "Repairable failures must retain multi-cycle routing.");
  assert.strictEqual(repairable.cycles.length, 2);
  assert.ok(repairable.cycles[0].repairTask, "Repairable failure must create a repair task.");
  assert.strictEqual(
    repairable.cycles[1].selectedTask,
    repairable.cycles[0].repairTask,
    "The repair task must be selected in the next cycle."
  );
  assert.strictEqual(
    repairable.cycles[1].selectedTask.targetSymbol,
    "runAutonomousDevelopmentManager",
    "A concrete repair target symbol must be preserved."
  );
  assert.strictEqual(
    repairable.stopReason,
    "max_cycles_reached_with_pending_repair"
  );

  console.log(JSON.stringify({
    mode: "autonomous-development-target-symbol-stop-regression-test",
    success: true,
    ambiguousStopReason: ambiguous.stopReason,
    ambiguousCycles: ambiguous.cycles.length,
    targetSymbolInference: ambiguous.targetSymbolInference,
    repairableCycles: repairable.cycles.length,
    repairableTargetSymbol:
      repairable.cycles[1].selectedTask.targetSymbol
  }, null, 2));
} finally {
  for (const modulePath of modulePaths) {
    delete require.cache[modulePath];
    if (savedEntries.has(modulePath)) {
      require.cache[modulePath] = savedEntries.get(modulePath);
    }
  }
}
