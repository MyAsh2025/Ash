function resolveExecutionAdapter(step = {}) {
  const action = step.action;

  const adapters = {
    node_check: {
      adapter: "node-check-adapter",
      executionType: "node",
      command: "node --check",
      realExecutable: true
    },
    git_diff_check: {
      adapter: "git-diff-adapter",
      executionType: "git",
      command: "git diff --check",
      realExecutable: true
    },
    runtime_corecheck: {
      adapter: "corecheck-adapter",
      executionType: "powershell",
      command: "runtime-corecheck.ps1",
      realExecutable: true
    },
    audit_check: {
      adapter: "audit-check-adapter",
      executionType: "internal",
      command: "audit_check",
      realExecutable: false
    },
    inspect_repository: {
      adapter: "repository-inspection-adapter",
      executionType: "git",
      command: "git status --short",
      realExecutable: true
    },
    prepare_patch_plan: {
      adapter: "patch-plan-adapter",
      executionType: "internal",
      command: "prepare_patch_plan",
      realExecutable: false
    },
    run_corecheck: {
      adapter: "corecheck-adapter",
      executionType: "powershell",
      command: "runtime-corecheck.ps1",
      realExecutable: true
    },
    run_checkpoint_when_needed: {
      adapter: "checkpoint-adapter",
      executionType: "powershell",
      command: "runtime-checkpoint.ps1",
      realExecutable: true
    }
  };

  return {
    ...(adapters[action] || {
      adapter: "unknown-adapter",
      executionType: "unknown",
      command: action || "unknown",
      realExecutable: false
    }),
    action,
    stepId: step.stepId || null,
    queueId: step.queueId || null,
    assignedAgent: step.assignedAgent || null,
    capability: step.capability || null,
    resolvedAt: new Date().toISOString()
  };
}

function buildExecutionAdapterRuntime(queueState = {}) {
  const queue = queueState.queue || [];

  const adapters = queue.map((item) => ({
    queueId: item.queueId,
    action: item.action,
    lifecycleState: item.lifecycle?.state || item.state || "unknown",
    adapter: resolveExecutionAdapter(item)
  }));

  return {
    mode: "execution-adapter-runtime",
    version: "ash-local-runtime-v0.1",
    adapters,
    executableAdapters: adapters.filter((item) => item.adapter.realExecutable),
    simulatedAdapters: adapters.filter((item) => !item.adapter.realExecutable),
    unresolvedAdapters: adapters.filter((item) => item.adapter.adapter === "unknown-adapter"),
    builtAt: new Date().toISOString()
  };
}

module.exports = {
  buildExecutionAdapterRuntime,
  resolveExecutionAdapter
};
