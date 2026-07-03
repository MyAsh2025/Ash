function dispatchStep(step) {
  return {
    ...step,
    dispatch: {
      mode: "agent-dispatch",
      assignedAgent: step.assignedAgent || null,
      fallbackAgents: step.fallbackAgents || [],
      capability: step.capability || "unknown",
      dispatchable: Boolean(step.assignedAgent),
      reason: step.assignedAgent
        ? `Assigned to ${step.assignedAgent} for capability ${step.capability}.`
        : "No assigned agent for this capability."
    }
  };
}

function dispatchCapabilities(capabilityResolution = {}) {
  const steps = capabilityResolution.steps || [];
  const dispatchedSteps = steps.map(dispatchStep);

  return {
    mode: "agent-dispatcher-runtime",
    version: "ash-local-runtime-v0.1",
    steps: dispatchedSteps,
    dispatchableSteps: dispatchedSteps.filter((step) => step.dispatch.dispatchable),
    blockedSteps: dispatchedSteps.filter((step) => !step.dispatch.dispatchable),
    dispatchedAt: new Date().toISOString()
  };
}

module.exports = {
  dispatchCapabilities,
  dispatchStep
};
