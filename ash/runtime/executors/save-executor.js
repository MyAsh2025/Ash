const fs = require("fs");
const path = require("path");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function buildSaveSummary(context = {}, type = "ash_core") {
  const project = context.project || {};
  const projectPath = context.projectPath || project.path || process.cwd();

  return {
    project: project.id || null,
    projectPath,
    saveType: type,
    generatedAt: new Date().toISOString(),
    reason: "Operational Kernel detected required save action.",
    recommendedScope: type === "ash_core"
      ? [
          "Operational Kernel progress",
          "Startup / Resume / Save Verification / Shutdown Runtime changes",
          "Execution Kernel and Operational Kernel integration"
        ]
      : [
          "Future sessions must begin with runtime verification",
          "CoreCheck, save verification, and handover should be proactively reported",
          "Do not repeat operational questions across sessions"
        ]
  };
}

function writeSaveDraft(context = {}, type = "ash_core") {
  const ashRoot = process.cwd();
  const saveDir = path.join(ashRoot, "ash", "save-drafts");
  ensureDir(saveDir);

  const summary = buildSaveSummary(context, type);
  const fileName = `${type}-save-${safeTimestamp()}.md`;
  const filePath = path.join(saveDir, fileName);

  const content = [
    `# ${type === "ash_core" ? "Ash_Core Save Draft" : "Memory Save Draft"}`,
    "",
    `Generated: ${summary.generatedAt}`,
    `Project: ${summary.project || "unknown"}`,
    `Project Path: ${summary.projectPath}`,
    "",
    "## Reason",
    summary.reason,
    "",
    "## Recommended Scope",
    ...summary.recommendedScope.map((item) => `- ${item}`),
    "",
    "## Status",
    "Draft only. User or Ash_Core save flow must confirm before permanent save.",
    ""
  ].join("\n");

  fs.writeFileSync(filePath, content, "utf8");

  return {
    filePath,
    summary
  };
}

function classifySaveScope(step = {}, context = {}) {
  const project = context.project || {};
  const projectPath = context.projectPath || project.path || process.cwd();

  return {
    executor: "save-executor",
    action: step.action || "classify_save_scope",
    success: true,
    status: 0,
    project: project.id || null,
    projectPath,
    scope: {
      ashCoreSaveRequired: true,
      memorySaveRequired: true,
      handoverSaveRequired: false
    },
    result: "Save scope classified.",
    executedAt: new Date().toISOString()
  };
}

function prepareHandoverSave(step = {}, context = {}) {
  const draft = writeSaveDraft(context, "handover");

  return {
    executor: "save-executor",
    action: step.action || "prepare_handover",
    success: true,
    status: 0,
    prepared: true,
    saveType: "handover",
    path: draft.filePath,
    summary: draft.summary,
    executedAt: new Date().toISOString()
  };
}

function prepareAshCoreSave(step = {}, context = {}) {
  const draft = writeSaveDraft(context, "ash_core");

  return {
    executor: "save-executor",
    action: step.action || "prepare_ash_core_save",
    success: true,
    status: 0,
    prepared: true,
    saveType: "ash_core",
    path: draft.filePath,
    summary: draft.summary,
    executedAt: new Date().toISOString()
  };
}

function prepareMemorySave(step = {}, context = {}) {
  const draft = writeSaveDraft(context, "memory");

  return {
    executor: "save-executor",
    action: step.action || "prepare_memory_save",
    success: true,
    status: 0,
    prepared: true,
    saveType: "memory",
    path: draft.filePath,
    summary: draft.summary,
    executedAt: new Date().toISOString()
  };
}

module.exports = {
  classifySaveScope,
  prepareHandoverSave,
  prepareAshCoreSave,
  prepareMemorySave
};

