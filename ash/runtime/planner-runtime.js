"use strict";

const { resolveProject } = require("./project-context");
const { evaluateRules } = require("./rule-evaluator");

function inferIntent(task = "") {
  const text = String(task || "").toLowerCase();

  if (
    text.includes("すすめて") ||
    text.includes("develop") ||
    text.includes("development") ||
    text.includes("capability") ||
    text.includes("runtime")
  ) {
    return "development";
  }

  if (text.includes("corecheck") || text.includes("save") || text.includes("handover")) {
    return "governance";
  }

  return "general";
}

function planTask({
  task = "",
  context = {}
} = {}) {
  const ruleEvaluation = evaluateRules({ bootstrap: context.bootstrap || null });
  const planningRules = ruleEvaluation.planning || {};
  const intent = inferIntent(task);
  const projectContext =
    context.projectContext ||
    resolveProject(task);

  const steps = [];

  if (intent === "development") {
    steps.push(
      {
        action: "minimal_core_gate",
        capabilityChanged: true,
        gitDirty: true,
        reason: "Verify Core Gate before continuing autonomous development."
      }
    );
  } else if (intent === "governance") {
    steps.push(
      { action: "minimal_core_gate", reason: "Run governance gate for corecheck/save/handover flow." }
    );
  } else {
    steps.push(
      { action: "inspect_repository", reason: "Inspect repository before deciding next action." },
      { action: "minimal_core_gate", reason: "Verify Core Gate after inspection." }
    );
  }

  return {
    mode: "planner-runtime",
    version: "ash-local-runtime-v0.1",
    task,
    intent,
    ruleEvaluatorAware: true,
    coreContextAware: ruleEvaluation.coreContextAware,
    planningRules,
    projectContext,
    steps,
    plannedAt: new Date().toISOString()
  };
}

module.exports = {
  inferIntent,
  planTask
};


