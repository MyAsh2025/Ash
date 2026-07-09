const fs = require("fs");
const path = require("path");

function loadProjectRegistry() {
  const registryPath = path.join(process.cwd(), "ash", "config", "projects.json");
  return JSON.parse(fs.readFileSync(registryPath, "utf8"));
}

function normalizePathForMatch(value = "") {
  return String(value || "").replace(/\\/g, "/").toLowerCase();
}

function resolveProject(task = "", options = {}) {
  const registry = loadProjectRegistry();
  const text = String(task || "").toLowerCase();
  const requestedProjectPath = normalizePathForMatch(options.projectPath);

  let projectId = registry.defaultProject;

  if (requestedProjectPath) {
    const pathMatchedProject = registry.projects.find((item) =>
      normalizePathForMatch(item.path) === requestedProjectPath
    );

    if (pathMatchedProject) {
      projectId = pathMatchedProject.id;
    }
  }

  const shouldInferFromTask = projectId === registry.defaultProject;

  if (
    shouldInferFromTask &&
    (
      text.includes("ash_core") ||
      text.includes("ash core")
    )
  ) {
    projectId = "ash_core";
  } else if (
    shouldInferFromTask &&
    (
      text.includes("ash service") ||
      text === "ash" ||
      text.includes("local runtime")
    )
  ) {
    projectId = "ash";
  } else if (
    shouldInferFromTask &&
    (
      text.includes("honne") ||
      text.includes("fortune") ||
      text.includes("本音") ||
      text.includes("占い") ||
      text.includes("corecheck")
    )
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


