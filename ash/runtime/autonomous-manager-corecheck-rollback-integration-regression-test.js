"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

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

function runRegression() {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "ash-manager-corecheck-rollback-")
  );

  const relativeTarget = "ash/runtime/integration-fixture.js";
  const absoluteTarget = path.join(tempRoot, relativeTarget);
  const backupPath = `${absoluteTarget}.backup.patch-apply-regression`;
  const original = '"use strict";\nmodule.exports = "original";\n';
  const changed = '"use strict";\nmodule.exports = "changed";\n';

  fs.mkdirSync(path.dirname(absoluteTarget), { recursive: true });
  fs.writeFileSync(absoluteTarget, original, "utf8");
  fs.copyFileSync(absoluteTarget, backupPath);
  fs.writeFileSync(absoluteTarget, changed, "utf8");

  const runtimeStatePath = require.resolve("./runtime-state");
  const observationPath = require.resolve("./repository-observation-runtime");
  const discoveryPath = require.resolve("./task-discovery-runtime");
  const capabilityPath = require.resolve("./capability-loop");
  const corecheckPath = require.resolve("./corecheck-runtime");
  const managerPath = require.resolve("./autonomous-development-manager");

  const savedEntries = new Map();
  for (const modulePath of [
    runtimeStatePath, observationPath, discoveryPath, capabilityPath, corecheckPath, managerPath
  ]) {
    if (require.cache[modulePath]) savedEntries.set(modulePath, require.cache[modulePath]);
    delete require.cache[modulePath];
  }

  let coreCheckCalls = 0;

  try {
    installModuleStub("./runtime-state", {
      readAutonomousCompletedTasks: () => ({ tasks: [] }),
      writeAutonomousCompletedTask: () => ({ saved: true })
    });

    installModuleStub("./repository-observation-runtime", {
      observeRepository: () => ({ branch: "regression" })
    });

    installModuleStub("./task-discovery-runtime", {
      discoverTaskFromRepository: () => ({
        discovered: false,
        task: null
      })
    });

    installModuleStub("./capability-loop", {
      runCapabilityLoop: () => ({
        success: true,
        steps: [
          {
            action: "development_pipeline",
            dispatchResult: {
              result: {
                result: {
                  success: true,
                  dryRun: false,
                  effectiveDryRun: false,
                  patchValidator: {
                    validatedOperations: [
                      { file: relativeTarget }
                    ]
                  },
                  patchApplyEngine: {
                    success: true,
                    applied: true,
                    dryRun: false,
                    results: [
                      {
                        file: relativeTarget,
                        success: true,
                        dryRun: false,
                        changed: true,
                        backupPath
                      }
                    ]
                  }
                }
              }
            }
          }
        ]
      })
    });

    installModuleStub("./corecheck-runtime", {
      runCoreCheck: () => {
        coreCheckCalls += 1;
        return coreCheckCalls === 1
          ? { success: false, reason: "Injected post-apply CoreCheck failure." }
          : { success: true, reason: "Injected post-rollback CoreCheck pass." };
      }
    });

    delete require.cache[managerPath];
    const { runAutonomousDevelopmentManager } = require("./autonomous-development-manager");

    const result = runAutonomousDevelopmentManager({
      task: "repair integration fixture",
      context: { projectPath: tempRoot },
      maxCycles: 1,
      dryRun: false
    });

    assert.strictEqual(coreCheckCalls, 2, "CoreCheck must run once after apply and once after rollback.");
    assert.strictEqual(fs.readFileSync(absoluteTarget, "utf8"), original, "Manager rollback must restore the exact pre-apply file.");
    assert.strictEqual(result.failureStage, "corecheck");
    assert.strictEqual(result.stopReason, "max_cycles_reached_with_pending_repair");
    assert.strictEqual(result.rollbackEvidence?.success, true);
    assert.strictEqual(result.rollbackCoreCheck?.success, true);
    assert.strictEqual(result.pendingRepairTask?.failureStage, "corecheck");
    assert.strictEqual(result.pendingRepairTask?.rollbackEvidence?.success, true);

    console.log(JSON.stringify({
      mode: "autonomous-manager-corecheck-rollback-integration-regression-test",
      success: true,
      coreCheckCalls,
      restoredExactContent: true,
      rollbackSuccess: result.rollbackEvidence.success,
      rollbackCoreCheckSuccess: result.rollbackCoreCheck.success,
      repairFailureStage: result.pendingRepairTask.failureStage
    }, null, 2));
  } finally {
    for (const modulePath of [runtimeStatePath, observationPath, discoveryPath, capabilityPath, corecheckPath, managerPath]) {
      delete require.cache[modulePath];
      if (savedEntries.has(modulePath)) require.cache[modulePath] = savedEntries.get(modulePath);
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

try {
  runRegression();
} catch (error) {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
}
