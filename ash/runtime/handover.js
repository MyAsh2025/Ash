const fs = require("fs");
const path = require("path");

function buildHandoverText({ task, observation, repository, decision, policy, executive, governance, workflow, agentSelection, agentBus, conversationHealth }) {
  return [
    "# Ash / Honne Fortune Handover",
    "",
    `GeneratedAt: ${new Date().toISOString()}`,
    "",
    "## Current Task",
    "",
    task || "unknown",
    "",
    "## Conversation Health",
    "",
    `Score: ${conversationHealth?.score}`,
    `RecommendedAction: ${conversationHealth?.recommendedAction}`,
    "",
    "Reasons:",
    ...(conversationHealth?.reasons || []).map((reason) => `- ${reason}`),
    "",
    "## Repository",
    "",
    `Branch: ${repository?.branch || "unknown"}`,
    `Clean: ${repository?.clean}`,
    `LatestCommit: ${repository?.latestCommit || "unknown"}`,
    `LatestMessage: ${repository?.latestMessage || "unknown"}`,
    "",
    "ChangedFiles:",
    ...(repository?.changedFiles || []).map((file) => `- ${file}`),
    "",
    "## Runtime Chain",
    "",
    `Observation: ${observation?.mode} ${observation?.version}`,
    `Decision: ${decision?.mode} ${decision?.version}`,
    `Policy: ${policy?.mode} ${policy?.version}`,
    `Executive: ${executive?.mode} ${executive?.version}`,
    `Governance: ${governance?.mode} ${governance?.version}`,
    `Workflow: ${workflow?.mode} ${workflow?.version}`,
    `AgentSelection: ${agentSelection?.mode} ${agentSelection?.version}`,
    `AgentBus: ${agentBus?.mode} ${agentBus?.version}`,
    "",
    "## Current Decision",
    "",
    `Domain: ${observation?.domain}`,
    `Importance: ${observation?.importance?.level} (${observation?.importance?.score})`,
    `ExecutiveTopPriority: ${executive?.topPriority?.domain} - ${executive?.topPriority?.reason}`,
    `GovernanceLevel: ${governance?.level}`,
    `WorkflowState: ${workflow?.state}`,
    "",
    "## Next Recommended Action",
    "",
    conversationHealth?.recommendedAction === "handover"
      ? "Start a new chat and paste this handover."
      : "Continue if performance is acceptable; handover is prepared.",
    ""
  ].join("\n");
}

function writeHandover(payload) {
  const handoverDir = path.join(process.cwd(), "ash", "handovers");
  fs.mkdirSync(handoverDir, { recursive: true });

  const filename = `handover-${new Date().toISOString().replace(/[:.]/g, "-")}.md`;
  const handoverPath = path.join(handoverDir, filename);
  const text = buildHandoverText(payload);

  fs.writeFileSync(handoverPath, text, "utf8");

  return {
    mode: "handover-runtime",
    version: "ash-local-runtime-v0.1",
    path: handoverPath,
    prepared: true,
    text,
    preparedAt: new Date().toISOString()
  };
}

module.exports = { writeHandover };
