function buildCheckpointAgentTask({ task, workflow }) {
  return {
    agent: "checkpoint-agent",
    version: "ash-agent-v0.1",
    purpose: "Commit, push, and confirm clean repository state when policy allows.",
    task,
    allowed: Boolean(workflow?.autoExecutable),
    actions: [
      "git_add",
      "git_commit",
      "git_push",
      "git_status"
    ],
    status: workflow?.autoExecutable ? "ready" : "blocked"
  };
}

module.exports = { buildCheckpointAgentTask };
