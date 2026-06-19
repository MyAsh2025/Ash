const fs = require("fs");
const path = require("path");

function loadProjectRegistry() {
  const registryPath = path.join(process.cwd(), "ash", "config", "projects.json");
  return JSON.parse(fs.readFileSync(registryPath, "utf8"));
}

function resolveProject(task = "") {
  const registry = loadProjectRegistry();
  const text = String(task || "").toLowerCase();

  let projectId = registry.defaultProject;

  if (text.includes("ash_core") || text.includes("ash core")) {
    projectId = "ash_core";
  } else if (text.includes("ash service") || text === "ash" || text.includes("local runtime")) {
    projectId = "ash";
  } else if (
    text.includes("honne") ||
    text.includes("fortune") ||
    text.includes("本音") ||
    text.includes("占い") ||
    text.includes("corecheck")
  ) {
    projectId = "honne_fortune";
  }

  const project = registry.projects.find((item) => item.id === projectId)
    || registry.projects.find((item) => item.id === registry.defaultProject);

  return {
    mode: "project-context-runtime",
    version: "ash-local-runtime-v0.1",
    project,
    registryVersion: registry.version,
    resolvedAt: new Date().toISOString()
  };
}

module.exports = { loadProjectRegistry, resolveProject };
