"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const {
  createCapabilityRegistry,
  runCapability
} = require("../runtime/capability-registry");

function isGitDirty(projectRoot) {
  try {
    const output = execSync("git status --porcelain", {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });

    return output.trim().length > 0;
  } catch (error) {
    return true;
  }
}

function ensureSandbox(projectRoot) {
  const sandboxDir = path.join(projectRoot, "ash", "capabilities", ".sandbox");
  fs.mkdirSync(sandboxDir, { recursive: true });
  return sandboxDir;
}

function unwrapCapabilityResult(result) {
  if (!result?.success) {
    return result;
  }

  return result.result;
}

function runCapabilitySandbox({
  projectRoot = process.cwd(),
  instruction = null
} = {}) {
  const registry = createCapabilityRegistry();
  const sandboxDir = ensureSandbox(projectRoot);
  const testFile = path.join("ash", "capabilities", ".sandbox", "capability-sandbox-target.js");
  const testPath = path.join(projectRoot, testFile);

  fs.writeFileSync(
    testPath,
    [
      "function sandboxTarget() {",
      "  return true;",
      "}",
      "",
      "module.exports = { sandboxTarget };",
      ""
    ].join("\n"),
    "utf8"
  );

  const effectiveInstruction = instruction || {
    instructionId: "sandbox-0001",
    targetFile: testFile.replace(/\\/g, "/"),
    operation: "insert-after",
    anchorPattern: "function sandboxTarget() {",
    purpose: "Verify autonomous development capability loop in sandbox."
  };

  const generateCall = runCapability(registry, "generate_patch", {
    instruction: effectiveInstruction
  });
  const generateResult = unwrapCapabilityResult(generateCall);

  const patchCall = runCapability(registry, "apply_safe_patch", {
    projectRoot,
    patch: generateResult.patch
  });
  const patchResult = unwrapCapabilityResult(patchCall);

  const verifyCall = runCapability(registry, "verify_patch", {
    projectRoot,
    files: [effectiveInstruction.targetFile]
  });
  const verifyResult = unwrapCapabilityResult(verifyCall);

  const repairCall = runCapability(registry, "repair_patch", {
    patchResult,
    verifyResult
  });
  const repairResult = unwrapCapabilityResult(repairCall);

  const gateCall = runCapability(registry, "minimal_core_gate", {
    capabilityChanged: true,
    gitDirty: isGitDirty(projectRoot)
  });
  const minimalCoreGate = unwrapCapabilityResult(gateCall);

  return {
    mode: "capability-sandbox-runner",
    version: "ash-capability-v0.2-registry",
    success:
      generateResult.success &&
      patchResult.success &&
      verifyResult.success &&
      repairResult.success,
    targetFile: effectiveInstruction.targetFile,
    registry: {
      version: registry.version,
      names: registry.names
    },
    calls: {
      generate_patch: generateCall.success,
      apply_safe_patch: patchCall.success,
      verify_patch: verifyCall.success,
      repair_patch: repairCall.success,
      minimal_core_gate: gateCall.success
    },
    generateResult,
    patchResult,
    verifyResult,
    repairResult,
    minimalCoreGate,
    ranAt: new Date().toISOString()
  };
}

module.exports = {
  runCapabilitySandbox
};

if (require.main === module) {
  const result = runCapabilitySandbox();
  console.log(JSON.stringify(result, null, 2));
}
