function classifyFailure(result, step = {}) {
  if (result.success) {
    return {
      failed: false,
      policy: "none",
      reason: "Step succeeded."
    };
  }

  if (step.required) {
    return {
      failed: true,
      policy: "stop",
      reason: "Required step failed."
    };
  }

  return {
    failed: true,
    policy: "skip",
    reason: "Optional step failed."
  };
}

function applyFailurePolicy({ result, step }) {
  const classification = classifyFailure(result, step);

  return {
    mode: "failure-policy-runtime",
    version: "ash-local-runtime-v0.1",
    stepId: step?.stepId || null,
    action: step?.action || result?.originalAction || result?.action || null,
    phase: step?.phase || null,
    manager: step?.manager || null,
    required: Boolean(step?.required),
    success: Boolean(result?.success),
    failed: classification.failed,
    policy: classification.policy,
    reason: classification.reason,
    decidedAt: new Date().toISOString()
  };
}

module.exports = {
  classifyFailure,
  applyFailurePolicy
};
