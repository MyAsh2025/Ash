function buildDevelopmentManagerTask({ task, intent, workflow, repository }) {
  const active =
    workflow?.autoExecutable ||
    intent?.requiresCheckpoint ||
    repository?.clean === false;

  return {
    manager: "development-manager",
    version: "ash-manager-v0.1",
    domain: "development",
    active,
    priority: active ? 80 : 20,
    reason: active
      ? "Development work is relevant because execution or repository changes are present."
      : "No immediate development execution required.",
    preferredAgents: active ? ["development-agent"] : [],
    decidedAt: new Date().toISOString()
  };
}

module.exports = { buildDevelopmentManagerTask };
