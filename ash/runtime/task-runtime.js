function buildTasksFromCoordinator({ task, coordinator, intent, workflow }) {
  const managerTasks = [];

  for (const manager of coordinator?.activeManagers || []) {
    if (manager.manager === "verification-manager") {
      managerTasks.push({
        taskId: "verify-runtime-safety",
        manager: manager.manager,
        objective: "Verify runtime safety and execution readiness.",
        priority: manager.priority,
        agents: manager.preferredAgents || [],
        actions: [
          "node_check",
          "runtime_corecheck",
          "git_diff_check",
          "audit_check"
        ],
        required: true
      });
    }

    if (manager.manager === "development-manager") {
      managerTasks.push({
        taskId: "execute-development-flow",
        manager: manager.manager,
        objective: "Execute development flow for the selected project.",
        priority: manager.priority,
        agents: manager.preferredAgents || [],
        actions: [
          "inspect_repository",
          "prepare_patch_plan",
          "run_corecheck",
          "run_checkpoint_when_needed"
        ],
        required: Boolean(workflow?.autoExecutable)
      });
    }

    if (manager.manager === "repository-manager") {
      managerTasks.push({
        taskId: "track-repository-state",
        manager: manager.manager,
        objective: "Track repository state and pending changes.",
        priority: manager.priority,
        agents: [],
        actions: [
          "inspect_repository",
          "git_diff_check"
        ],
        required: false
      });
    }
  }

  const sortedTasks = managerTasks.sort((a, b) => b.priority - a.priority);

  return {
    mode: "task-runtime",
    version: "ash-local-runtime-v0.1",
    source: "coordinator",
    tasks: sortedTasks,
    requiredTasks: sortedTasks.filter((item) => item.required),
    optionalTasks: sortedTasks.filter((item) => !item.required),
    actionQueue: [
      ...new Set(sortedTasks.flatMap((item) => item.actions || []))
    ],
    builtAt: new Date().toISOString()
  };
}

module.exports = { buildTasksFromCoordinator };
