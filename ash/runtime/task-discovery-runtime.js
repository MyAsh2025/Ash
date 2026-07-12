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

function buildTaskIdentity(task = null) {
  if (!task) return null;

  return [
    task.source || "",
    task.task || "",
    task.file || task.targetFile || "",
    Array.isArray(task.work) ? task.work.join(",") : ""
  ].join("|");
}

function buildConcreteImplementationPlanningTask() {
  return {
    task: "Improve concrete implementation planning",
    priority: "high",
    source: "autonomous-self-improvement",
    work: [
      "self-evolution",
      "implementation-planning",
      "execution"
    ],
    implementationType: "runtime-improvement",
    strategy: "concrete-implementation-planning",
    recommendedOperation: "inspect-and-plan",
    confidence: "high",
    targetSymbol: "implementation planning runtime",
    symbolType: "runtime-behavior",
    expectedBehavior: [
      "Resolve a concrete target symbol before code generation.",
      "Describe the symbol type and expected behavior.",
      "Provide an implementation template and executable code template.",
      "Preserve validator safety requirements."
    ],
    implementationTemplate: {
      targetSymbol: null,
      symbolType: null,
      expectedBehavior: null,
      implementationTemplate: null,
      executableCodeTemplate: null
    },
    reason: [
      "No unresolved repository implementation finding is available.",
      "The previous repository cleanup review completed successfully.",
      "Improve planning so autonomous code generation receives concrete implementation details."
    ].join(" ")
  };
}

function discoverTaskFromRepository({
  observation = null,
  excludedTask = null
} = {}) {
  const finding = observation?.nextTask || null;
  const repositoryHealth = observation?.repositoryHealth || null;
  const excludedIdentity = buildTaskIdentity(excludedTask);

  if (
    !finding &&
    repositoryHealth?.attentionReasons?.includes(
      "large-cleanup-candidate-groups-detected"
    )
  ) {
    const cleanupTask = {
      task: "Review repository cleanup candidate groups",
      priority: "normal",
      source: "repository-health",
      work: ["cleanup-review"],
      reason: "Repository health detected large cleanup candidate groups.",
      reportOnly: true,
      automaticDeletionAllowed: false
    };

    if (buildTaskIdentity(cleanupTask) !== excludedIdentity) {
      return {
        mode: "task-discovery-runtime",
        version: "ash-local-runtime-v0.2-report-only-repeat-suppression",
        success: true,
        discovered: true,
        task: cleanupTask,
        discoveredAt: new Date().toISOString()
      };
    }

    return {
      mode: "task-discovery-runtime",
      version: "ash-local-runtime-v0.2-report-only-repeat-suppression",
      success: true,
      discovered: true,
      task: buildConcreteImplementationPlanningTask(),
      suppressedTask: cleanupTask,
      suppressionReason:
        "The same report-only cleanup task completed successfully in the previous cycle.",
      discoveredAt: new Date().toISOString()
    };
  }

  if (!finding) {
    return {
      mode: "task-discovery-runtime",
      version: "ash-local-runtime-v0.2-report-only-repeat-suppression",
      success: true,
      discovered: true,
      task: buildConcreteImplementationPlanningTask(),
      reason: "No repository findings detected; selected autonomous self-improvement.",
      discoveredAt: new Date().toISOString()
    };
  }

  const title = describeWork(finding.work);

  return {
    mode: "task-discovery-runtime",
    version: "ash-local-runtime-v0.2-report-only-repeat-suppression",
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
  describeWork,
  buildTaskIdentity,
  buildConcreteImplementationPlanningTask
};

