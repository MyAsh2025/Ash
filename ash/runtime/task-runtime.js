function mapOperationalStepToActions(step) {
  const map = {
    load_previous_runtime_state: ["inspect_repository"],
    classify_resume_state: ["inspect_repository"],
    inspect_repository: ["inspect_repository"],
    runtime_corecheck: ["runtime_corecheck"],
    git_diff_check: ["git_diff_check"],
    save_verification: [
      "classify_save_scope",
      "prepare_ash_core_save",
      "prepare_memory_save"
    ],
    shutdown_verification: [],
    prepare_handover: ["prepare_handover"],
    prepare_patch_plan: ["prepare_patch_plan"],
    run_checkpoint_when_needed: ["run_checkpoint_when_needed"]
  };

  return map[step] || [];
}

function mapOperationalStepToAction(step) {
  return mapOperationalStepToActions(step)[0] || null;
}

function buildPlannerTask(operationalPlan, goalExpander = null, dependencyExpansion = null) {
  const actions = [...new Set(
    dependencyExpansion?.actions?.length
      ? dependencyExpansion.actions
      : goalExpander?.actions?.length
        ? goalExpander.actions
        : (operationalPlan?.steps || [])
            .flatMap(mapOperationalStepToActions)
            .filter(Boolean)
  )];

  if (actions.length === 0) {
    return null;
  }

  return {
    taskId: "operational-planner-task",
    manager: "operational-planner",
    objective: `Execute operational plan: ${operationalPlan.goal}`,
    priority: 95,
    agents: [],
    actions,
    required: true,
    sourceOperationalPlan: {
      goal: operationalPlan.goal,
      steps: operationalPlan.steps
    }
  };
}

function findManager(coordinator, managerName) {
  return (coordinator?.activeManagers || coordinator?.managers || [])
    .find((manager) => manager.manager === managerName);
}

function buildVerificationTask(manager) {
  return {
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
  };
}

function buildDevelopmentTask(manager, workflow) {
  return {
    taskId: "execute-development-flow",
    manager: manager.manager,
    objective: "Execute development flow for the selected project.",
    priority: manager.priority,
    agents: manager.preferredAgents || [],
    actions: [
      "inspect_repository",
      "prepare_patch_plan",
      "run_corecheck",
      "prepare_ash_core_save",
      "prepare_memory_save",
      "run_checkpoint_when_needed"
    ],
    required: Boolean(workflow?.autoExecutable)
  };
}

function buildRepositoryTasks(manager) {
  const assessment = manager?.assessment || {};
  const tasks = [];

  if (!manager || !assessment) {
    return tasks;
  }

  if (assessment.coreCheckRequired) {
    tasks.push({
      taskId: "repository-corecheck-required",
      manager: manager.manager,
      objective: "Verify repository safety with CoreCheck before repository operations.",
      priority: manager.priority,
      agents: [],
      actions: [
        "runtime_corecheck",
        "git_diff_check"
      ],
      required: true,
      sourceAssessment: assessment
    });
  }

  if (assessment.checkpointRequired) {
    tasks.push({
      taskId: "repository-checkpoint-required",
      manager: manager.manager,
      objective: "Prepare repository checkpoint when required metadata is available.",
      priority: manager.priority - 5,
      agents: [],
      actions: [
        "run_checkpoint_when_needed"
      ],
      required: false,
      sourceAssessment: assessment
    });
  }

  if (assessment.commitRequired) {
    tasks.push({
      taskId: "repository-commit-required",
      manager: manager.manager,
      objective: "Track pending repository changes that may require commit.",
      priority: manager.priority - 10,
      agents: [],
      actions: [
        "inspect_repository",
        "git_diff_check"
      ],
      required: false,
      sourceAssessment: assessment
    });
  }

  if (tasks.length === 0 && manager.active) {
    tasks.push({
      taskId: "track-repository-state",
      manager: manager.manager,
      objective: "Track repository state.",
      priority: manager.priority,
      agents: [],
      actions: [
        "inspect_repository"
      ],
      required: false,
      sourceAssessment: assessment
    });
  }

  return tasks;
}

function mergeTasksByAction(tasks = []) {
  const merged = new Map();

  for (const task of tasks) {
    for (const action of task.actions || []) {
      if (!merged.has(action)) {
        merged.set(action, {
          taskId: `merged-${action}`,
          objective: `Execute shared action: ${action}`,
          priority: task.priority,
          action,
          actions: [action],
          required: Boolean(task.required),
          requestedBy: [
            {
              taskId: task.taskId,
              manager: task.manager,
              priority: task.priority,
              required: Boolean(task.required),
              objective: task.objective
            }
          ],
          sourceAssessments: task.sourceAssessment ? [task.sourceAssessment] : [],
          sourceOperationalPlans: task.sourceOperationalPlan ? [task.sourceOperationalPlan] : []
        });

        continue;
      }

      const existing = merged.get(action);

      existing.priority = Math.max(existing.priority, task.priority);
      existing.required = existing.required || Boolean(task.required);

      existing.requestedBy.push({
        taskId: task.taskId,
        manager: task.manager,
        priority: task.priority,
        required: Boolean(task.required),
        objective: task.objective
      });

      if (task.sourceAssessment) {
        existing.sourceAssessments.push(task.sourceAssessment);
      }

      if (task.sourceOperationalPlan) {
        existing.sourceOperationalPlans.push(task.sourceOperationalPlan);
      }
    }
  }

  return [...merged.values()].sort((a, b) => b.priority - a.priority);
}

function buildTasksFromCoordinator({ task, coordinator, intent, workflow, operationalPlan = null, goalExpander = null, dependencyExpansion = null }) {
  const managerTasks = [];

  const plannerTask = buildPlannerTask(operationalPlan, goalExpander, dependencyExpansion);
  const verificationManager = findManager(coordinator, "verification-manager");
  const developmentManager = findManager(coordinator, "development-manager");
  const repositoryManager = findManager(coordinator, "repository-manager");

  if (plannerTask) {
    managerTasks.push(plannerTask);
  }

  if (!plannerTask && verificationManager?.active) {
    managerTasks.push(buildVerificationTask(verificationManager));
  }

  if (!plannerTask && developmentManager?.active) {
    managerTasks.push(buildDevelopmentTask(developmentManager, workflow));
  }

  if (!plannerTask) {
    managerTasks.push(...buildRepositoryTasks(repositoryManager));
  }

  const rawTasks = managerTasks.sort((a, b) => b.priority - a.priority);
  const mergedTasks = mergeTasksByAction(rawTasks);

  return {
    mode: "task-runtime",
    version: "ash-local-runtime-v0.4-operational-planner-aware",
    source: plannerTask ? "operational-planner+coordinator" : "coordinator",
    operationalPlanUsed: Boolean(plannerTask),
    rawTasks,
    tasks: mergedTasks,
    requiredTasks: mergedTasks.filter((item) => item.required),
    optionalTasks: mergedTasks.filter((item) => !item.required),
    actionQueue: mergedTasks.map((item) => item.action),
    builtAt: new Date().toISOString()
  };
}

module.exports = {
  buildTasksFromCoordinator,
  buildRepositoryTasks,
  buildPlannerTask,
  mapOperationalStepToAction,
  mapOperationalStepToActions,
  mergeTasksByAction,
  findManager
};




