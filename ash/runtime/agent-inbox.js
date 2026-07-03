function buildAgentInboxes(agentDispatch = {}) {
  const inboxes = new Map();

  for (const step of agentDispatch.dispatchableSteps || []) {
    const agent = step.dispatch?.assignedAgent;

    if (!agent) continue;

    if (!inboxes.has(agent)) {
      inboxes.set(agent, {
        agent,
        steps: [],
        capabilities: new Set(),
        actions: new Set()
      });
    }

    const inbox = inboxes.get(agent);
    inbox.steps.push(step);
    inbox.capabilities.add(step.capability);
    inbox.actions.add(step.action);
  }

  return [...inboxes.values()].map((inbox) => ({
    agent: inbox.agent,
    stepCount: inbox.steps.length,
    capabilities: [...inbox.capabilities],
    actions: [...inbox.actions],
    steps: inbox.steps
  }));
}

function buildAgentInboxRuntime(agentDispatch = {}) {
  const inboxes = buildAgentInboxes(agentDispatch);

  return {
    mode: "agent-inbox-runtime",
    version: "ash-local-runtime-v0.1",
    inboxes,
    agents: inboxes.map((inbox) => inbox.agent),
    totalSteps: inboxes.reduce((sum, inbox) => sum + inbox.stepCount, 0),
    blockedSteps: agentDispatch.blockedSteps || [],
    builtAt: new Date().toISOString()
  };
}

module.exports = {
  buildAgentInboxRuntime,
  buildAgentInboxes
};
