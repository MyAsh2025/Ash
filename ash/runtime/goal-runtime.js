"use strict";

function inferGoal(task = "") {
  const text = String(task || "").toLowerCase();

  if (
    text.includes("自律開発") ||
    text.includes("すすめて") ||
    text.includes("capability") ||
    text.includes("runtime")
  ) {
    return {
      id: "autonomous-development",
      title: "Advance autonomous development capability",
      domain: "development",
      completionConditions: [
        "Planner creates executable steps",
        "Capability Loop executes steps",
        "Core Gate runs when required",
        "Reflection confirms completion",
        "Executive Runtime decides continue or stop"
      ]
    };
  }

  return {
    id: "general-task",
    title: "Complete requested task",
    domain: "general",
    completionConditions: [
      "Task is planned",
      "Task is executed",
      "Result is reflected"
    ]
  };
}

function buildGoalRuntime({
  task = "",
  execution = null,
  reflection = null
} = {}) {
  const goal = inferGoal(task);
  const completed = Boolean(reflection?.completed || execution?.reflection?.completed);

  return {
    mode: "goal-runtime",
    version: "ash-local-runtime-v0.1",
    task,
    goal,
    completed,
    remainingWork: completed
      ? []
      : goal.completionConditions,
    nextRecommendedAction: completed
      ? "continue_planning"
      : "execute_task",
    evaluatedAt: new Date().toISOString()
  };
}

module.exports = {
  inferGoal,
  buildGoalRuntime
};
