const { runAction } = require("../actions/action-runtime");

function runAgent(agentTask, context = {}) {
  if (agentTask.status !== "ready") {
    return {
      agent: agentTask.agent,
      status: "skipped",
      allowed: Boolean(agentTask.allowed),
      actions: agentTask.actions || [],
      result: "Agent was not ready and was skipped.",
      executedAt: new Date().toISOString()
    };
  }

  const actionResults = (agentTask.actions || []).map((action) => {
    return runAction(action, context);
  });

  const failed = actionResults.some((result) => result.success === false);

  return {
    agent: agentTask.agent,
    status: failed ? "failed" : "executed",
    allowed: Boolean(agentTask.allowed),
    actions: agentTask.actions || [],
    actionResults,
    result: failed ? "Agent execution failed." : "Agent execution completed.",
    executedAt: new Date().toISOString()
  };
}

function runAgentBus(agentSelection, context = {}) {
  const selectedAgents = agentSelection?.selectedAgents || [];

  const results = selectedAgents.map((agentTask) => runAgent(agentTask, context));

  return {
    mode: "agent-bus-runtime",
    version: "ash-local-runtime-v0.2",
    executedAgents: results.filter((result) => result.status === "executed"),
    failedAgents: results.filter((result) => result.status === "failed"),
    skippedAgents: results.filter((result) => result.status === "skipped"),
    results,
    success: results.every((result) => result.status !== "failed"),
    completedAt: new Date().toISOString()
  };
}

module.exports = { runAgentBus };
