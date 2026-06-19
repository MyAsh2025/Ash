function runAgent(agentTask) {
  return {
    agent: agentTask.agent,
    status: agentTask.status === "ready" ? "executed_simulated" : "skipped",
    allowed: Boolean(agentTask.allowed),
    actions: agentTask.actions || [],
    result: agentTask.status === "ready"
      ? "Agent execution simulated successfully."
      : "Agent was not ready and was skipped.",
    executedAt: new Date().toISOString()
  };
}

function runAgentBus(agentSelection) {
  const selectedAgents = agentSelection?.selectedAgents || [];

  const results = selectedAgents.map((agentTask) => runAgent(agentTask));

  return {
    mode: "agent-bus-runtime",
    version: "ash-local-runtime-v0.1",
    executedAgents: results.filter((result) => result.status === "executed_simulated"),
    skippedAgents: results.filter((result) => result.status !== "executed_simulated"),
    results,
    completedAt: new Date().toISOString()
  };
}

module.exports = { runAgentBus };
