const { buildDevelopmentAgentTask } = require("../agents/development");
const { buildVerificationAgentTask } = require("../agents/verification");
const { buildCheckpointAgentTask } = require("../agents/checkpoint");
const { buildSaveAgentTask } = require("../agents/save");

function includesAgent(coordinator, agentName) {
  const preferred = coordinator?.preferredAgents || [];
  return preferred.includes(agentName);
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function hasAction(source = {}, actions = []) {
  const actionSet = new Set(actions);

  const steps = asArray(source?.steps);
  const tasks = asArray(source?.tasks);

  const candidates = [
    ...asArray(source?.actions),
    ...asArray(source?.actionQueue),
    ...steps.map((step) =>
      typeof step === "string" ? step : step?.action
    ),
    ...tasks.flatMap((task) =>
      asArray(task?.actions || task?.action)
    )
  ].filter(Boolean);

  return candidates.some((action) => actionSet.has(action));
}

function normalizeAgentApproval(agent, executionAllowed) {
  if (executionAllowed) {
    return {
      ...agent,
      allowed: true,
      status: "ready"
    };
  }

  return {
    ...agent,
    allowed: false,
    status: agent.status === "ready" ? "blocked" : agent.status
  };
}

function selectAgents({
  task,
  intent,
  workflow,
  coordinator = null,
  approval = null,
  taskRuntime = null,
  executionPlan = null,
  capabilityResolution = null
}) {
  const agents = [];

  const executionAllowed =
    approval?.executionAllowed ?? workflow?.autoExecutable ?? false;

  const wantsDevelopment =
    includesAgent(coordinator, "development-agent") ||
    intent?.requiresCoreCheck ||
    intent?.requiresCheckpoint ||
    workflow?.autoExecutable ||
    executionAllowed;

  const wantsVerification =
    includesAgent(coordinator, "verification-agent") ||
    intent?.requiresCoreCheck ||
    workflow?.autoExecutable ||
    executionAllowed;

  const wantsSave =
    intent?.requiresAshCoreSave ||
    intent?.requiresMemorySave ||
    intent?.requiresHandover ||
    hasAction(taskRuntime, ["prepare_ash_core_save", "prepare_memory_save", "prepare_handover"]) ||
    hasAction(executionPlan, ["prepare_ash_core_save", "prepare_memory_save", "prepare_handover"]) ||
    hasAction(capabilityResolution, ["prepare_ash_core_save", "prepare_memory_save", "prepare_handover"]);

  if (wantsDevelopment) {
    agents.push(buildDevelopmentAgentTask({ task, intent, workflow }));
  }

  if (wantsVerification) {
    agents.push(buildVerificationAgentTask({ task, workflow }));
  }

  if (intent?.requiresCheckpoint) {
    agents.push(buildCheckpointAgentTask({ task, workflow }));
  }

  if (wantsSave) {
    agents.push(buildSaveAgentTask({
      task,
      intent: {
        ...intent,
        requiresAshCoreSave: true,
        requiresMemorySave: true
      },
      workflow
    }));
  }

  const normalizedAgents = agents.map((agent) =>
    normalizeAgentApproval(agent, executionAllowed)
  );

  return {
    mode: "agent-selector-runtime",
    version: "ash-local-runtime-v0.4-save-action-aware",
    coordinator,
    approval,
    executionAllowed,
    selectedAgents: normalizedAgents,
    readyAgents: normalizedAgents.filter((agent) => agent.status === "ready"),
    blockedAgents: normalizedAgents.filter((agent) => agent.status !== "ready"),
    selectedAt: new Date().toISOString()
  };
}

module.exports = {
  selectAgents,
  normalizeAgentApproval,
  hasAction
};

