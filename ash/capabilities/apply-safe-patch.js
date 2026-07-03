const fs = require("fs");
const path = require("path");

function applySafePatch({ projectRoot = process.cwd(), patch }) {
  if (!patch) {
    return {
      capability: "apply_safe_patch",
      success: false,
      reason: "No patch provided."
    };
  }

  const targetPath = path.join(projectRoot, patch.targetFile || "");

  if (!fs.existsSync(targetPath)) {
    return {
      capability: "apply_safe_patch",
      success: false,
      reason: "Target file does not exist.",
      targetFile: patch.targetFile
    };
  }

  const original = fs.readFileSync(targetPath, "utf8");

  if (!patch.anchorPattern || !original.includes(patch.anchorPattern)) {
    return {
      capability: "apply_safe_patch",
      success: false,
      reason: "Anchor pattern not found.",
      targetFile: patch.targetFile,
      anchorPattern: patch.anchorPattern
    };
  }

  if (!patch.insertText) {
    return {
      capability: "apply_safe_patch",
      success: false,
      reason: "No insertText provided.",
      targetFile: patch.targetFile
    };
  }

  const backupPath = `${targetPath}.backup.${Date.now()}`;
  fs.copyFileSync(targetPath, backupPath);

  const updated = original.replace(
    patch.anchorPattern,
    `${patch.anchorPattern}\n${patch.insertText}`
  );

  fs.writeFileSync(targetPath, updated, "utf8");

  return {
    capability: "apply_safe_patch",
    success: true,
    targetFile: patch.targetFile,
    backupPath,
    anchorPattern: patch.anchorPattern,
    appliedAt: new Date().toISOString()
  };
}

module.exports = {
  applySafePatch
};
