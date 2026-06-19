function buildSaveAgentTask({ task, intent, workflow }) {
  const needsSave =
    Boolean(intent?.requiresAshCoreSave) ||
    Boolean(intent?.requiresMemorySave) ||
    Boolean(intent?.requiresHandover);

  return {
    agent: "save-agent",
    version: "ash-agent-v0.1",
    purpose: "Classify and prepare Ash_Core, Memory, and handover saves.",
    task,
    allowed: Boolean(workflow?.autoExecutable && needsSave),
    needsSave,
    actions: [
      "classify_save_scope",
      "prepare_ash_core_save",
      "prepare_memory_save",
      "prepare_handover"
    ],
    status: workflow?.autoExecutable && needsSave ? "ready" : "blocked_or_not_needed"
  };
}

module.exports = { buildSaveAgentTask };
