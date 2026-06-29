"use strict";

function describeWork(work = []) {
  if (work.includes("implementation")) {
    return "Complete missing implementation";
  }

  if (work.includes("todo")) {
    return "Resolve TODO/FIXME markers";
  }

  if (work.includes("execution")) {
    return "Improve autonomous execution continuation";
  }

  return "Review repository finding";
}

function discoverTaskFromRepository({
  observation = null
} = {}) {
  const finding = observation?.nextTask || null;

  if (!finding) {
    return {
      mode: "task-discovery-runtime",
      version: "ash-local-runtime-v0.1",
      success: true,
      discovered: false,
      task: null,
      reason: "No repository findings detected."
    };
  }

  const title = describeWork(finding.work);

  return {
    mode: "task-discovery-runtime",
    version: "ash-local-runtime-v0.1",
    success: true,
    discovered: true,
    task: {
      task: `${title} in ${finding.file}`,
      priority: finding.priority || "normal",
      source: "repository-observation",
      file: finding.file,
      work: finding.work,
      reason: `Repository observation detected ${finding.work.join(", ")} work.`
    },
    discoveredAt: new Date().toISOString()
  };
}

module.exports = {
  discoverTaskFromRepository,
  describeWork
};
