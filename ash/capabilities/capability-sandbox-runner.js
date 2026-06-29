const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { generatePatch } = require("./generate-patch");
const { applySafePatch } = require("./apply-safe-patch");
const { verifyPatch } = require("./verify-patch");
const { repairPatch } = require("./repair-patch");
const { evaluateMinimalCoreGate } = require("./core-gate");

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

function runCapabilitySandbox({
  projectRoot = process.cwd(),
  instruction = null
} = {}) {
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

  const generateResult = generatePatch({ instruction: effectiveInstruction });

  const patchResult = applySafePatch({
    projectRoot,
    patch: generateResult.patch
  });

  const verifyResult = verifyPatch({
    projectRoot,
    files: [effectiveInstruction.targetFile]
  });

  const repairResult = repairPatch({ patchResult, verifyResult });

  const minimalCoreGate = evaluateMinimalCoreGate({
    capabilityChanged: true,
    gitDirty: isGitDirty(projectRoot)
  });

  return {
    mode: "capability-sandbox-runner",
    version: "ash-capability-v0.1",
    success:
      generateResult.success &&
      patchResult.success &&
      verifyResult.success &&
      repairResult.success,
    targetFile: effectiveInstruction.targetFile,
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

  if (!result.success) {
    process.exit(1);
  }
}



