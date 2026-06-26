function buildVerificationManagerTask({ task, intent, workflow }) {
  const active =
    intent?.requiresCoreCheck ||
    intent?.requiresCheckpoint ||
    workflow?.autoExecutable;

  return {
    manager: "verification-manager",
    version: "ash-manager-v0.1",
    domain: "verification",
    active,
    priority: active ? 90 : 30,
    reason: active
      ? "Verification is required for corecheck, checkpoint, or executable workflow."
      : "No immediate verification required.",
    preferredAgents: active ? ["verification-agent"] : [],
    decidedAt: new Date().toISOString()
  };
}

module.exports = { buildVerificationManagerTask };
