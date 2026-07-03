function runAgentInbox(inbox = {}) {
  const steps = inbox.steps || [];

  return {
    agent: inbox.agent,
    mode: "agent-runtime",
    version: "ash-agent-runtime-v0.1",
    stepCount: steps.length,
    capabilities: inbox.capabilities || [],
    actions: inbox.actions || [],
    status: steps.length > 0 ? "ready" : "idle",
    preparedSteps: steps.map((step) => ({
      stepId: step.stepId || null,
      action: step.action,
      capability: step.capability,
      phase: step.phase || null,
      priority: step.priority ?? null,
      required: Boolean(step.required),
      dependencies: step.dependencies || [],
      dispatch: step.dispatch || null
    })),
    result: steps.length > 0
      ? "Agent inbox prepared for execution."
      : "Agent inbox is idle.",
    preparedAt: new Date().toISOString()
  };
}

function runAgentRuntime(agentInboxRuntime = {}) {
  const inboxes = agentInboxRuntime.inboxes || [];
  const agentResults = inboxes.map(runAgentInbox);

  return {
    mode: "agent-runtime",
    version: "ash-local-runtime-v0.1",
    agents: agentResults.map((result) => result.agent),
    readyAgents: agentResults.filter((result) => result.status === "ready"),
    idleAgents: agentResults.filter((result) => result.status === "idle"),
    results: agentResults,
    completedAt: new Date().toISOString()
  };
}

module.exports = {
  runAgentRuntime,
  runAgentInbox
};

