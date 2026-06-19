function buildWorkflow({ governance, plan }) {
  const level = governance?.level || "level2";
  const steps = plan?.steps || [];

  let state = "approval_required";
  let executableSteps = [];
  let blockedSteps = steps;
  let message = "Approval required before execution.";

  if (level === "level0") {
    state = "auto_execute";
    executableSteps = steps;
    blockedSteps = [];
    message = "Fully automatic execution is allowed.";
  }

  if (level === "level1") {
    state = "auto_execute_with_notification";
    executableSteps = steps;
    blockedSteps = [];
    message = "Automatic execution is allowed; notify after completion.";
  }

  if (level === "level2") {
    state = "approval_required";
    executableSteps = [];
    blockedSteps = steps;
    message = "Approval required before execution.";
  }

  if (level === "level3") {
    state = "owner_decision_required";
    executableSteps = [];
    blockedSteps = steps;
    message = "Owner decision required before execution.";
  }

  return {
    mode: "workflow-runtime",
    version: "ash-local-runtime-v0.1",
    state,
    permissionLevel: level,
    autoExecutable: state === "auto_execute" || state === "auto_execute_with_notification",
    requiresApproval: state === "approval_required" || state === "owner_decision_required",
    executableSteps,
    blockedSteps,
    message,
    createdAt: new Date().toISOString()
  };
}

module.exports = { buildWorkflow };
