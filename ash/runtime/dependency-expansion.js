function expandActionDependencies(actions = []) {
  const expanded = [];

  function add(action) {
    if (!expanded.includes(action)) {
      expanded.push(action);
    }
  }

  for (const action of actions) {
    if (action === "runtime_corecheck" || action === "run_corecheck") {
      add("node_check");
      add(action);
      continue;
    }

    if (action === "run_checkpoint_when_needed") {
      add("node_check");
      add("runtime_corecheck");
      add("git_diff_check");
      add(action);
      continue;
    }

    if (action === "audit_check") {
      add("node_check");
      add("runtime_corecheck");
      add(action);
      continue;
    }

    add(action);
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
