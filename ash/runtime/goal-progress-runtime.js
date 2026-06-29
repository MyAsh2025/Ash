"use strict";

function buildGoalProgressRuntime({
  task = "",
  goalRuntime = null,
  execution = null
} = {}) {
  const completedSignals = [];
  const remainingObjectives = [];

  const reflection = execution?.reflection || {};
  const plan = execution?.plan || {};
  const loop = execution?.loop || {};

  if (plan.steps?.length > 0) completedSignals.push("Planner created executable steps");
  else remainingObjectives.push("Planner must create executable steps");

  if (loop.steps?.length > 0) completedSignals.push("Capability Loop executed steps");
  else remainingObjectives.push("Capability Loop must execute steps");

  if (reflection.coreGateTriggered) completedSignals.push("Core Gate evaluated required follow-up");
  else remainingObjectives.push("Core Gate trigger path not yet exercised");

  if (reflection.coreCheckSucceeded) completedSignals.push("CoreCheck succeeded");
  else remainingObjectives.push("CoreCheck success must be verified when required");

  if (reflection.savePrepared) completedSignals.push("Ash_Core save draft prepared");
  else remainingObjectives.push("Ash_Core save preparation must be verified when required");

  if (reflection.handoverPrepared) completedSignals.push("Handover draft prepared");
  else remainingObjectives.push("Handover preparation must be verified when required");

  if (goalRuntime?.completed) completedSignals.push("Goal Runtime marked current execution complete");
  else remainingObjectives.push("Goal Runtime must confirm completion");

  const total = completedSignals.length + remainingObjectives.length;
  const progressPercent = total === 0
    ? 0
    : Math.round((completedSignals.length / total) * 100);

  return {
    mode: "goal-progress-runtime",
    version: "ash-local-runtime-v0.1",
    task,
    goal: goalRuntime?.goal || null,
    progressPercent,
    completed: remainingObjectives.length === 0,
    completedSignals,
    remainingObjectives,
    nextPlanningTarget:
      remainingObjectives[0] || "continue_autonomous_development",
    evaluatedAt: new Date().toISOString()
  };
}

module.exports = {
  buildGoalProgressRuntime
};
