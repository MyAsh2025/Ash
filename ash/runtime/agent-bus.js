function coordinateAgent(agentTask, context = {}) {
  if (agentTask.status !== "ready") {
    return {
      agent: agentTask.agent,
      status: "skipped",
      allowed: Boolean(agentTask.allowed),
      actions: agentTask.actions || [],
      result: "Agent was not ready and was skipped.",
      coordinatedAt: new Date().toISOString()
    };
  }

  return {
    agent: agentTask.agent,
    status: "coordinated",
    allowed: Boolean(agentTask.allowed),
    actions: agentTask.actions || [],
    task: agentTask.task || context.task || "",
    recommendation: "Agent actions should be executed through Execution Plan Runtime.",
    result: "Agent coordination completed.",
    coordinatedAt: new Date().toISOString()
  };
}

function runAgentBus(agentSelection, context = {}) {
  const selectedAgents = agentSelection?.selectedAgents || [];

  const results = selectedAgents.map((agentTask) =>
    coordinateAgent(agentTask, context)
  );

  return {
    mode: "agent-bus-runtime",
    version: "ash-local-runtime-v0.3-coordination-only",
    coordinatedAgents: results.filter((result) => result.status === "coordinated"),
    failedAgents: [],
    skippedAgents: results.filter((result) => result.status === "skipped"),
    results,
    success: true,
    completedAt: new Date().toISOString()
  };
}

module.exports = { runAgentBus, coordinateAgent };
