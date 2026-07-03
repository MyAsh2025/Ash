function classifyApprovalRisk({ task, repository, startupGate, governance, workflow }) {
  const text = String(task || "").toLowerCase();

  const highRiskSignals = [
    "release",
    "deploy",
    "production",
    "finance",
    "payment",
    "delete",
    "remove",
    "reset",
    "force",
    "business decision",
    "permission",
    "credential",
    "secret"
  ];

  if (highRiskSignals.some((signal) => text.includes(signal))) {
    return "high";
  }

  if (repository?.clean === false || startupGate?.gates?.saveVerificationRequired) {
    return "medium";
  }

  if (startupGate?.gates?.coreCheckRequired || workflow?.autoExecutable) {
    return "low";
  }

  return "low";
}

function resolveApprovalPolicy(risk) {
  if (risk === "high") {
    return {
      allowed: false,
      approvalRequired: true,
      postExecutionReviewRequired: false,
      checkpointReviewRequired: false,
      reason: "Explicit user approval required for high-risk execution."
    };
  }

  if (risk === "medium") {
    return {
      allowed: true,
      approvalRequired: false,
      postExecutionReviewRequired: true,
      checkpointReviewRequired: true,
      reason: "Medium-risk execution allowed with post-execution review."
    };
  }

  return {
    allowed: true,
    approvalRequired: false,
    postExecutionReviewRequired: false,
    checkpointReviewRequired: false,
    reason: "Low-risk execution allowed automatically."
  };
}

function applyApprovalRuntime({ task, repository, startupGate, governance, workflow, dryRun }) {
  const risk = classifyApprovalRisk({ task, repository, startupGate, governance, workflow });
  const policy = resolveApprovalPolicy(risk);

  const allowed =
    dryRun ||
    policy.allowed ||
    Boolean(governance?.autoApproved);

  const approvalRequired =
    risk === "high" && !Boolean(governance?.autoApproved);

  return {
    mode: "approval-runtime",
    version: "ash-local-runtime-v0.2-medium-auto-review",
    risk,
    allowed,
    approvalRequired,
    executionAllowed: allowed && !approvalRequired,
    postExecutionReviewRequired: policy.postExecutionReviewRequired,
    checkpointReviewRequired: policy.checkpointReviewRequired,
    reason: approvalRequired
      ? policy.reason
      : policy.reason,
    policy: {
      lowRisk: "auto-execute",
      mediumRisk: "auto-execute-with-review",
      highRisk: "explicit-user-approval-required"
    },
    evaluatedAt: new Date().toISOString()
  };
}

module.exports = {
  applyApprovalRuntime,
  classifyApprovalRisk,
  resolveApprovalPolicy
};
