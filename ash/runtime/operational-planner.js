const {
  resolveBaseOperationalSteps,
  resolveOperationalStepsForGoal,
  resolveDirtyRepositoryOperationalSteps,
  filterGovernorOperationalSteps
} = require("./operational-step-policy");

function getPreviousLatest(previousRuntimeState) {
  return previousRuntimeState?.state?.latestRuntime || null;
}

function getPreviousGovernor(previousRuntimeState) {
  return getPreviousLatest(previousRuntimeState)?.governor || null;
}

function classifyOperationalGoal({ task, previousRuntimeState, resumeRuntime }) {
  const text = String(task || "").toLowerCase();
  const previousLatest = getPreviousLatest(previousRuntimeState);
  const previousGovernor = getPreviousGovernor(previousRuntimeState);

  if (
    text.includes("すすめて") ||
    text.includes("continue") ||
    text.includes("resume") ||
    text.includes("next")
  ) {
    if (previousGovernor?.nextState === "stable-with-repository-dirty") {
      return "continue_governor_next_actions";
    }

    return "continue_previous_operation";
  }

  if (
    text.includes("runtime") ||
    text.includes("kernel") ||
    text.includes("architecture")
  ) {
    return "develop_runtime_architecture";
  }

  if (resumeRuntime?.resumeState === "completed-from-previous-runtime") {
    return "continue_after_completed_cycle";
  }

  if (previousLatest?.shutdownCompleted && previousLatest?.saveCompleted) {
    return "continue_after_completed_cycle";
  }

  return "general_operation";
}

function appendGovernorActions(steps, previousGovernor) {
  for (const action of filterGovernorOperationalSteps(previousGovernor?.nextActions || [])) {
    steps.push(action);
  }
}

function buildOperationalPlan({ task, previousRuntimeState, resumeRuntime, repository }) {
  const previousGovernor = getPreviousGovernor(previousRuntimeState);

  const goal = classifyOperationalGoal({
    task,
    previousRuntimeState,
    resumeRuntime
  });

  const repositoryDirty = repository?.clean === false;
  const steps = resolveBaseOperationalSteps();

  if (goal === "continue_governor_next_actions") {
    appendGovernorActions(steps, previousGovernor);
  } else {
    steps.push(...resolveOperationalStepsForGoal(goal));

    if (
      repositoryDirty &&
      (goal === "continue_previous_operation" || goal === "continue_after_completed_cycle")
    ) {
      steps.push(...resolveDirtyRepositoryOperationalSteps());
    }
  }

  const uniqueSteps = [...new Set(steps)];

  return {
    mode: "operational-planner-runtime",
    version: "ash-local-runtime-v0.2-governor-aware",
    task,
    goal,
    repositoryDirty,
    previousRuntimeAvailable: Boolean(previousRuntimeState?.exists),
    previousResumeState: previousRuntimeState?.state?.latestRuntime?.resumeState || null,
    previousGovernor,
    currentResumeState: resumeRuntime?.resumeState || null,
    steps: uniqueSteps,
    nextRecommendedStep: uniqueSteps[0] || null,
    planReady: uniqueSteps.length > 0,
    plannedAt: new Date().toISOString()
  };
}

module.exports = {
  buildOperationalPlan,
  classifyOperationalGoal,
  getPreviousLatest,
  getPreviousGovernor,
  appendGovernorActions
};

