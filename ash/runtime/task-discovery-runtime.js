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

function isConcreteImplementationPlanningSatisfied(
  task = null
) {
  if (
    !task ||
    typeof task !== "object"
  ) {
    return false;
  }

  const implementationTemplate =
    task.implementationTemplate;

  const requiredNestedKeys = [
    "targetSymbol",
    "symbolType",
    "expectedBehavior",
    "implementationTemplate",
    "executableCodeTemplate"
  ];

  const hasConcreteTarget =
    typeof task.targetFile === "string" &&
    task.targetFile.trim().length > 0 &&
    typeof task.targetSymbol === "string" &&
    task.targetSymbol.trim().length > 0 &&
    typeof task.symbolType === "string" &&
    task.symbolType.trim().length > 0;

  const hasExpectedBehavior =
    Array.isArray(
      task.expectedBehavior
    ) &&
    task.expectedBehavior.length > 0;

  const hasPlanningContract =
    implementationTemplate &&
    typeof implementationTemplate ===
      "object" &&
    !Array.isArray(
      implementationTemplate
    ) &&
    requiredNestedKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(
          implementationTemplate,
          key
        )
    );

  const nestedContractMatches =
    hasPlanningContract &&
    implementationTemplate.targetSymbol ===
      task.targetSymbol &&
    implementationTemplate.symbolType ===
      task.symbolType &&
    Array.isArray(
      implementationTemplate.expectedBehavior
    ) &&
    implementationTemplate.expectedBehavior
      .length > 0;

  const executableGenerationRequired =
    hasPlanningContract &&
    implementationTemplate
      .implementationTemplate === null &&
    implementationTemplate
      .executableCodeTemplate === null;

  return (
    hasConcreteTarget &&
    hasExpectedBehavior &&
    hasPlanningContract &&
    nestedContractMatches &&
    !executableGenerationRequired
  );
}
function buildConcreteImplementationPlanningTask() {
  return {
    task: "Improve concrete implementation planning",
    priority: "high",
    source: "autonomous-self-improvement",
    work: ["self-evolution", "implementation-planning", "execution"],
    implementationType: "runtime-improvement",
    strategy: "concrete-implementation-planning",
    recommendedOperation: "replace",
    confidence: "high",
    targetFile: "ash/runtime/task-discovery-runtime.js",
    reason: [
      "Resolve a concrete target symbol before code generation.",
      "Describe the target symbol type and expected behavior.",
      "Provide concrete planning metadata used by downstream runtimes.",
      "Delegate executable implementation generation to the configured provider.",
      "Preserve patch-validator safety requirements."
    ],
    targetSymbol: "buildConcreteImplementationPlanningTask",
    symbolType: "function",
    expectedBehavior: [
      "Resolve a concrete target symbol before code generation.",
      "Describe the target symbol type and expected behavior.",
      "Provide concrete planning metadata used by downstream runtimes.",
      "Delegate executable implementation generation to the configured provider.",
      "Preserve patch-validator safety requirements."
    ],
    implementationTemplate: {
      targetSymbol: "buildConcreteImplementationPlanningTask",
      symbolType: "function",
      expectedBehavior: [
        "Resolve a concrete target symbol before code generation.",
        "Describe the target symbol type and expected behavior.",
        "Provide concrete planning metadata used by downstream runtimes.",
        "Delegate executable implementation generation to the configured provider.",
        "Preserve patch-validator safety requirements."
      ],
      implementationTemplate: null,
      executableCodeTemplate: null,
      confidence: "high",
      reason: [
        "Resolve a concrete target symbol before code generation.",
        "Describe the target symbol type and expected behavior.",
        "Provide concrete planning metadata used by downstream runtimes.",
        "Delegate executable implementation generation to the configured provider.",
        "Preserve patch-validator safety requirements."
      ]
    },
    generateExecutableImplementation: function(context) {
      const targetSymbol = context.resolveTargetSymbol();
      if (!targetSymbol) {
        throw new Error("Failed to resolve concrete target symbol.");
      }

      const symbolType = context.getSymbolType(targetSymbol);
      const expectedBehavior = context.getExpectedBehavior(targetSymbol);

      const planningMetadata = {
        targetSymbol,
        symbolType,
        expectedBehavior,
        strategy: this.strategy,
        recommendedOperation: this.recommendedOperation
      };

      const implementationProvider = context.getImplementationProvider();
      if (!implementationProvider) {
        throw new Error("No implementation provider configured.");
      }

      const implementation = implementationProvider.generateImplementation(planningMetadata);

      if (!context.validatePatch(implementation)) {
        throw new Error("Generated implementation failed patch validation.");
      }

      return implementation;
    }
  };
}
function discoverTaskFromRepository({
  observation = null,
  excludedTask = null,
  excludedTasks = []
} = {}) {
  const concretePlanningTask =
    buildConcreteImplementationPlanningTask();

  const concretePlanningSatisfied =
    isConcreteImplementationPlanningSatisfied(
      concretePlanningTask
    );
  const finding = observation?.nextTask || null;
  const repositoryHealth = observation?.repositoryHealth || null;
  const excludedIdentities =
    new Set(
      [
        buildTaskIdentity(
          excludedTask
        ),
        ...(
          Array.isArray(
            excludedTasks
          )
            ? excludedTasks.map(
                buildTaskIdentity
              )
            : []
        )
      ].filter(Boolean)
    );

  const concretePlanningIdentity =
    buildTaskIdentity(
      concretePlanningTask
    );

  const concretePlanningExcluded =
    excludedIdentities.has(
      concretePlanningIdentity
    );

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

    if (
      !excludedIdentities.has(
        buildTaskIdentity(
          cleanupTask
        )
      )
    ) {
      return {
        mode: "task-discovery-runtime",
        version: "ash-local-runtime-v0.2-report-only-repeat-suppression",
        success: true,
        discovered: true,
        task: cleanupTask,
        discoveredAt: new Date().toISOString()
      };
    }

    if (
      concretePlanningSatisfied ||
      concretePlanningExcluded
    ) {
      return {
        mode: "task-discovery-runtime",
        version: "ash-local-runtime-v0.3-completion-aware-fallback",
        success: true,
        discovered: false,
        task: null,
        suppressedTask: cleanupTask,
        suppressionReason:
          "The same report-only cleanup task completed successfully in the previous cycle.",
        reason:
          concretePlanningSatisfied
            ? "Concrete implementation planning is already satisfied; no fallback development task is required."
            : "The completed autonomous self-improvement task is suppressed.",
        discoveredAt: new Date().toISOString()
      };
    }

    return {
      mode: "task-discovery-runtime",
      version: "ash-local-runtime-v0.3-completion-aware-fallback",
      success: true,
      discovered: true,
      task: concretePlanningTask,
      suppressedTask: cleanupTask,
      suppressionReason:
        "The same report-only cleanup task completed successfully in the previous cycle.",
      discoveredAt: new Date().toISOString()
    };
  }

  if (!finding) {
    if (
      concretePlanningSatisfied ||
      concretePlanningExcluded
    ) {
      return {
        mode: "task-discovery-runtime",
        version: "ash-local-runtime-v0.3-completion-aware-fallback",
        success: true,
        discovered: false,
        task: null,
        reason:
          concretePlanningSatisfied
            ? "No repository findings were detected and concrete implementation planning is already satisfied."
            : "No repository findings were detected and the completed autonomous self-improvement task is suppressed.",
        discoveredAt: new Date().toISOString()
      };
    }

    return {
      mode: "task-discovery-runtime",
      version: "ash-local-runtime-v0.3-completion-aware-fallback",
      success: true,
      discovered: true,
      task: concretePlanningTask,
      reason:
        "No repository findings detected; selected incomplete autonomous self-improvement.",
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
  buildConcreteImplementationPlanningTask,
  isConcreteImplementationPlanningSatisfied
};

