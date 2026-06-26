const { buildDevelopmentAgentTask } = require("../agents/development");
const { buildVerificationAgentTask } = require("../agents/verification");
const { buildCheckpointAgentTask } = require("../agents/checkpoint");
const { buildSaveAgentTask } = require("../agents/save");

function includesAgent(coordinator, agentName) {
  const preferred = coordinator?.preferredAgents || [];
  return preferred.includes(agentName);
}

function selectAgents({ task, intent, workflow, coordinator = null }) {
  const agents = [];

  const wantsDevelopment =
    includesAgent(coordinator, "development-agent") ||
    intent?.requiresCoreCheck ||
    intent?.requiresCheckpoint ||
    workflow?.autoExecutable;

  const wantsVerification =
    includesAgent(coordinator, "verification-agent") ||
    intent?.requiresCoreCheck ||
    workflow?.autoExecutable;

  if (wantsDevelopment) {
    agents.push(buildDevelopmentAgentTask({ task, intent, workflow }));
  }

  if (wantsVerification) {
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
    version: "ash-local-runtime-v0.2-coordinator-aware",
    coordinator,
    selectedAgents: agents,
    readyAgents: agents.filter((agent) => agent.status === "ready"),
    blockedAgents: agents.filter((agent) => agent.status !== "ready"),
    selectedAt: new Date().toISOString()
  };
}

module.exports = { selectAgents };
