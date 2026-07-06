const { runNodeCheck } = require("./executors/node-executor");
const { runGitDiffCheck, inspectRepository } = require("./executors/git-executor");
const { runRuntimeCorecheck, runCheckpointWhenNeeded } = require("./executors/powershell-executor");
const { runAuditCheck } = require("./executors/audit-executor");
const { runPreparePatchPlan } = require("./executors/prepare-patch-executor");
const { classifySaveScope, prepareHandoverSave, prepareAshCoreSave, prepareMemorySave } = require("./executors/save-executor");
const { runPlanExecutor } = require("./executors/plan-executor");

const registry = {
  node_check: runNodeCheck,
  git_diff_check: runGitDiffCheck,
  inspect_repository: inspectRepository,
  runtime_corecheck: runRuntimeCorecheck,
  run_corecheck: runRuntimeCorecheck,
  run_checkpoint_when_needed: runCheckpointWhenNeeded,
  audit_check: runAuditCheck,
  prepare_patch_plan: runPreparePatchPlan,
  classify_save_scope: classifySaveScope,
  prepare_handover: prepareHandoverSave,
  prepare_ash_core_save: prepareAshCoreSave,
  prepare_memory_save: prepareMemorySave,
  execute_plan: runPlanExecutor
};

function resolveExecutor(action) {
  return registry[action] || null;
}

function executeRegisteredAction(step = {}, context = {}) {
  const executor = resolveExecutor(step.action);

  if (!executor) {
    return {
      mode: "executor-registry-runtime",
      version: "ash-local-runtime-v0.1",
      action: step.action || "unknown",
      success: false,
      skipped: true,
      reason: "No registered executor for action.",
      executedAt: new Date().toISOString()
    };
  }

  const result = executor(step, context);

  return {
    mode: "executor-registry-runtime",
    version: "ash-local-runtime-v0.1",
    registered: true,
    ...result
  };
}

module.exports = {
  executeRegisteredAction,
  resolveExecutor,
  registry
};






