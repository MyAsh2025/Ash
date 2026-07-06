const { expandActionWithDependencies } = require("./dependency-policy");

function expandActionDependencies(actions = []) {
  const expanded = [];

  function add(action) {
    if (!expanded.includes(action)) {
      expanded.push(action);
    }
  }

  for (const action of actions) {
    for (const expandedAction of expandActionWithDependencies(action)) {
      add(expandedAction);
    }
  }

  return expanded;
}

function buildDependencyExpansionRuntime({ goalExpander }) {
  const sourceActions = goalExpander?.actions || [];
  const actions = expandActionDependencies(sourceActions);

  return {
    mode: "dependency-expansion-runtime",
    version: "ash-local-runtime-v0.1",
    sourceActions,
    actions,
    addedActions: actions.filter((action) => !sourceActions.includes(action)),
    actionCount: actions.length,
    expandedAt: new Date().toISOString()
  };
}

module.exports = {
  buildDependencyExpansionRuntime,
  expandActionDependencies
};

