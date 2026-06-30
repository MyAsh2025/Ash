const capabilityMap = {
  node_check: {
    capability: "syntax_verification",
    preferredAgent: "verification-agent",
    fallbackAgents: []
  },
  runtime_corecheck: {
    capability: "runtime_verification",
    preferredAgent: "verification-agent",
    fallbackAgents: ["development-agent"]
  },
  git_diff_check: {
    capability: "repository_diff_verification",
    preferredAgent: "verification-agent",
    fallbackAgents: ["development-agent"]
  },
  audit_check: {
    capability: "audit_verification",
    preferredAgent: "verification-agent",
    fallbackAgents: []
  },
  inspect_repository: {
    capability: "repository_inspection",
    preferredAgent: "development-agent",
    fallbackAgents: ["verification-agent"]
  },
  prepare_patch_plan: {
    capability: "patch_planning",
    executableCapability: "generate_patch",
    preferredAgent: "development-agent",
    fallbackAgents: []
  },
  generate_patch: {
    capability: "patch_generation",
    executableCapability: "generate_patch",
    preferredAgent: "development-agent",
    fallbackAgents: ["verification-agent"]
  },
  apply_safe_patch: {
    capability: "patch_application",
    executableCapability: "apply_safe_patch",
    preferredAgent: "development-agent",
    fallbackAgents: ["verification-agent"]
  },
  verify_patch: {
    capability: "patch_verification",
    executableCapability: "verify_patch",
    preferredAgent: "verification-agent",
    fallbackAgents: ["development-agent"]
  },
  repair_patch: {
    capability: "patch_repair",
    executableCapability: "repair_patch",
    preferredAgent: "development-agent",
    fallbackAgents: ["verification-agent"]
  },
  minimal_core_gate: {
    capability: "core_gate_evaluation",
    executableCapability: "minimal_core_gate",
    preferredAgent: "verification-agent",
    fallbackAgents: ["development-agent"]
  },
  development_pipeline: {
    capability: "development_pipeline",
    executableCapability: "development_pipeline",
    preferredAgent: "development-agent",
    fallbackAgents: ["verification-agent"]
  },
  run_corecheck: {
    capability: "runtime_verification",
    preferredAgent: "verification-agent",
    fallbackAgents: ["development-agent"]
  },
  classify_save_scope: {
    capability: "save_classification",
    preferredAgent: "save-agent",
    fallbackAgents: ["development-agent"]
  },
  prepare_handover: {
    capability: "handover_preparation",
    preferredAgent: "save-agent",
    fallbackAgents: ["development-agent"]
  },
  prepare_ash_core_save: {
    capability: "save_preparation",
    preferredAgent: "save-agent",
    fallbackAgents: ["development-agent"]
  },
  prepare_memory_save: {
    capability: "save_preparation",
    preferredAgent: "save-agent",
    fallbackAgents: ["development-agent"]
  },
  run_checkpoint_when_needed: {
    capability: "checkpoint_execution",
    preferredAgent: "development-agent",
    fallbackAgents: ["verification-agent"]
  }
};

function resolveCapabilityForAction(action) {
  return capabilityMap[action] || {
    capability: "unknown",
    preferredAgent: null,
    fallbackAgents: []
  };
}

function enrichStepWithCapability(step) {
  const resolved = resolveCapabilityForAction(step.action);

  return {
    ...step,
    capability: resolved.capability,
    executableCapability: resolved.executableCapability || null,
    assignedAgent: resolved.preferredAgent,
    fallbackAgents: resolved.fallbackAgents
  };
}

function resolveCapabilities(executionPlan = {}) {
  const steps = executionPlan.steps || [];
  const enrichedSteps = steps.map(enrichStepWithCapability);

  return {
    mode: "capability-resolver-runtime",
    version: "ash-local-runtime-v0.2-executable-capability",
    steps: enrichedSteps,
    capabilities: [
      ...new Set(enrichedSteps.map((step) => step.capability))
    ],
    executableCapabilities: [
      ...new Set(
        enrichedSteps
          .map((step) => step.executableCapability)
          .filter(Boolean)
      )
    ],
    unresolvedSteps: enrichedSteps.filter((step) => step.capability === "unknown"),
    resolvedAt: new Date().toISOString()
  };
}

module.exports = {
  resolveCapabilities,
  resolveCapabilityForAction,
  enrichStepWithCapability
};





