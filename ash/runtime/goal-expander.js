const { resolveActionsForGoal } = require("./goal-action-policy");

function expandGoalToActions({ operationalPlan, repository }) {
  const goal = operationalPlan?.goal || "general_operation";
  const repositoryDirty = repository?.clean === false;

  return resolveActionsForGoal(goal, { repositoryDirty });
}

function buildGoalExpanderRuntime({ operationalPlan, repository }) {
  const actions = [...new Set(expandGoalToActions({ operationalPlan, repository }))];

  return {
    mode: "goal-expander-runtime",
    version: "ash-local-runtime-v0.2-policy-backed",
    goal: operationalPlan?.goal || null,
    sourceSteps: operationalPlan?.steps || [],
    repositoryDirty: repository?.clean === false,
    actions,
    actionCount: actions.length,
    expandedAt: new Date().toISOString()
  };
}

module.exports = {
  buildGoalExpanderRuntime,
  expandGoalToActions
};
