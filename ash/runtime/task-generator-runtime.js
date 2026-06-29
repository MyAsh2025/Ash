"use strict";

function generateNextTask({
  executive = null,
  goalProgress = null,
  execution = null
} = {}) {
  const reflection = execution?.reflection || {};
  const completed = Boolean(goalProgress?.completed);

  if (!completed) {
    return {
      mode: "task-generator-runtime",
      version: "ash-local-runtime-v0.1",
      success: true,
      nextTask: {
        task: "Resolve remaining goal objectives",
        priority: "high",
        reason: "Goal is not yet complete."
      }
    };
  }

  if (reflection.coreGateTriggered && !reflection.coreCheckSucceeded) {
    return {
      mode: "task-generator-runtime",
      version: "ash-local-runtime-v0.1",
      success: true,
      nextTask: {
        task: "Run CoreCheck",
        priority: "critical",
        reason: "Core Gate requires verification."
      }
    };
  }

  if (reflection.coreGateTriggered && !reflection.savePrepared) {
    return {
      mode: "task-generator-runtime",
      version: "ash-local-runtime-v0.1",
      success: true,
      nextTask: {
        task: "Prepare Ash_Core save",
        priority: "high",
        reason: "Save preparation missing."
      }
    };
  }

  if (reflection.coreGateTriggered && !reflection.handoverPrepared) {
    return {
      mode: "task-generator-runtime",
      version: "ash-local-runtime-v0.1",
      success: true,
      nextTask: {
        task: "Prepare handover",
        priority: "high",
        reason: "Handover preparation missing."
      }
    };
  }

  return {
    mode: "task-generator-runtime",
    version: "ash-local-runtime-v0.1",
    success: true,
    nextTask: {
      task: "Continue autonomous development",
      priority: "normal",
      reason: executive?.decision || "continue"
    }
  };
}

module.exports = {
  generateNextTask
};
