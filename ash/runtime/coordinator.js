const { buildDevelopmentManagerTask } = require("../managers/development-manager");
const { buildVerificationManagerTask } = require("../managers/verification-manager");
const { buildRepositoryManagerTask } = require("../managers/repository-manager");

function coordinateManagers({ task, intent, workflow, repository }) {
  const managers = [
    buildDevelopmentManagerTask({ task, intent, workflow, repository }),
    buildVerificationManagerTask({ task, intent, workflow, repository }),
    buildRepositoryManagerTask({ task, intent, workflow, repository })
  ];

  const activeManagers = managers
    .filter((manager) => manager.active)
    .sort((a, b) => b.priority - a.priority);

  const preferredAgents = [
    ...new Set(activeManagers.flatMap((manager) => manager.preferredAgents || []))
  ];

  return {
    mode: "coordinator-runtime",
    version: "ash-local-runtime-v0.1",
    managers,
    activeManagers,
    preferredAgents,
    primaryManager: activeManagers[0] || null,
    coordinatedAt: new Date().toISOString()
  };
}

module.exports = { coordinateManagers };
