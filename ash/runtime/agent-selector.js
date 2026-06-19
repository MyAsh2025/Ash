const { buildDevelopmentAgentTask } = require("../agents/development");
const { buildVerificationAgentTask } = require("../agents/verification");
const { buildCheckpointAgentTask } = require("../agents/checkpoint");
const { buildSaveAgentTask } = require("../agents/save");

function selectAgents({ task, intent, workflow }) {
  const agents = [];

  if (intent?.requiresCoreCheck || intent?.requiresCheckpoint || workflow?.autoExecutable) {
    agents.push(buildDevelopmentAgentTask({ task, intent, workflow }));
    agents.push(buildVerificationAgentTask({ task, workflow }));
  }

  if (intent?.requiresCheckpoint) {
    agents.push(buildCheckpointAgentTask({ task, workflow }));
  }

  if (
    intent?.requiresAshCoreSave ||
    intent?.requiresMemorySave ||
    intent?.requiresHandover
  ) {
    agents.push(buildSaveAgentTask({ task, intent, workflow }));
  }

  return {
    mode: "agent-selector-runtime",
    version: "ash-local-runtime-v0.1",
    selectedAgents: agents,
    readyAgents: agents.filter((agent) => agent.status === "ready"),
    blockedAgents: agents.filter((agent) => agent.status !== "ready"),
    selectedAt: new Date().toISOString()
  };
}

module.exports = { selectAgents };
