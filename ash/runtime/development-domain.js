function buildDevelopmentDomain({ executiveRuntime, domainPlanner, repository }) {
  const repositoryDirty = repository?.clean === false;
  const active = executiveRuntime?.domain === "development";

  const actions = [];

  if (active || repositoryDirty) {
    actions.push("inspect_repository");
    actions.push("prepare_patch_plan");
    actions.push("node_check");
    actions.push("runtime_corecheck");
  }

  if (repositoryDirty) {
    actions.push("git_diff_check");
    actions.push("run_checkpoint_when_needed");
  }

  return {
    mode: "development-domain-runtime",
    version: "ash-local-runtime-v0.1",
    active,
    repositoryDirty,
    objective: executiveRuntime?.objective || null,
    plannedActions: [...new Set(actions)],
    planReady: actions.length > 0,
    reason:
      active
        ? "Development domain is active from Executive Runtime."
        : repositoryDirty
          ? "Repository has pending changes requiring development-domain support."
          : "Development domain is idle.",
    evaluatedAt: new Date().toISOString()
  };
}

module.exports = {
  buildDevelopmentDomain
};
