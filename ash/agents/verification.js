function buildVerificationAgentTask({ task, workflow }) {
  return {
    agent: "verification-agent",
    version: "ash-agent-v0.1",
    purpose: "Verify syntax, runtime checks, audit keys, and repository safety.",
    task,
    allowed: Boolean(workflow?.autoExecutable),
    actions: [
      "node_check",
      "runtime_corecheck",
      "git_diff_check",
      "audit_check"
    ],
    status: workflow?.autoExecutable ? "ready" : "blocked"
  };
}

module.exports = { buildVerificationAgentTask };
