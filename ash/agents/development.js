function buildDevelopmentAgentTask({ task, intent, workflow }) {
  return {
    agent: "development-agent",
    version: "ash-agent-v0.1",
    purpose: "Handle low-risk development execution tasks.",
    task,
    allowed: Boolean(workflow?.autoExecutable),
    actions: [
      "inspect_repository",
      "prepare_patch_plan",
      "run_corecheck",
      "run_checkpoint_when_needed"
    ],
    status: workflow?.autoExecutable ? "ready" : "blocked"
  };
}

module.exports = { buildDevelopmentAgentTask };
