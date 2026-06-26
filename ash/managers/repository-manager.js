function buildRepositoryManagerTask({ task, repository }) {
  const active = repository?.clean === false;

  return {
    manager: "repository-manager",
    version: "ash-manager-v0.1",
    domain: "repository",
    active,
    priority: active ? 70 : 20,
    reason: active
      ? "Repository has pending changes and should be tracked."
      : "Repository is clean.",
    preferredAgents: [],
    decidedAt: new Date().toISOString()
  };
}

module.exports = { buildRepositoryManagerTask };
