"use strict";

const { generatePatch } = require("../capabilities/generate-patch");
const { applySafePatch } = require("../capabilities/apply-safe-patch");
const { verifyPatch } = require("../capabilities/verify-patch");
const { repairPatch } = require("../capabilities/repair-patch");
const { evaluateMinimalCoreGate } = require("../capabilities/core-gate");
const { runDevelopmentPipelineCapability } = require("../capabilities/development-pipeline");

function createCapabilityRegistry() {
  const capabilities = {
    generate_patch: {
      capability: "generate_patch",
      domain: "development",
      implemented: true,
      risk: "medium",
      description: "Generate code changes from edit instructions.",
      run: generatePatch
    },
    apply_safe_patch: {
      capability: "apply_safe_patch",
      domain: "development",
      implemented: true,
      risk: "medium",
      description: "Apply generated patches with anchor verification.",
      run: applySafePatch
    },
    verify_patch: {
      capability: "verify_patch",
      domain: "verification",
      implemented: true,
      risk: "low",
      description: "Verify patched files with syntax checks and diff checks.",
      run: verifyPatch
    },
    repair_patch: {
      capability: "repair_patch",
      domain: "development",
      implemented: true,
      risk: "medium",
      description: "Classify and repair failed patch attempts.",
      run: repairPatch
    },
    minimal_core_gate: {
      capability: "minimal_core_gate",
      domain: "governance",
      implemented: true,
      risk: "low",
      description: "Evaluate minimal core gate requirements for autonomous development.",
      run: evaluateMinimalCoreGate
    },
    development_pipeline: {
      capability: "development_pipeline",
      domain: "development",
      implemented: true,
      risk: "medium",
      description: "Run the development pipeline through dry-run patch application.",
      run: runDevelopmentPipelineCapability
    }
  };

  return {
    mode: "capability-registry-runtime",
    version: "ash-local-runtime-v0.2",
    capabilities,
    names: Object.keys(capabilities)
  };
}

function resolveCapability(registry, name) {
  return registry?.capabilities?.[name] || null;
}

function runCapability(registry, name, input = {}) {
  const capability = resolveCapability(registry, name);

  if (!capability) {
    return {
      success: false,
      capability: name,
      reason: "Capability not found."
    };
  }

  if (typeof capability.run !== "function") {
    return {
      success: false,
      capability: name,
      reason: "Capability has no executable run function."
    };
  }

  const result = capability.run(input);

  return {
    success: true,
    capability: name,
    result
  };
}

module.exports = {
  createCapabilityRegistry,
  resolveCapability,
  runCapability
};

