const { execSync } = require("child_process");

function runCommand(command, cwd) {
  try {
    const output = execSync(command, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });

    return {
      command,
      success: true,
      output,
      error: null
    };
  } catch (error) {
    return {
      command,
      success: false,
      output: error.stdout ? String(error.stdout) : "",
      error: error.stderr ? String(error.stderr) : error.message
    };
  }
}

function verifyPatch({ projectRoot = process.cwd(), files = [], requireCleanDiff = false }) {
  const fileChecks = [];

  for (const file of files) {
    if (file.endsWith(".js")) {
      fileChecks.push(runCommand(`node --check "${file}"`, projectRoot));
    }
  }

  const diffCheck = runCommand("git diff --check", projectRoot);
  const fileChecksPassed = fileChecks.every((check) => check.success);

  return {
    capability: "verify_patch",
    success: requireCleanDiff
      ? fileChecksPassed && diffCheck.success
      : fileChecksPassed,
    fileChecksPassed,
    diffCheckPassed: diffCheck.success,
    requireCleanDiff,
    checks: [
      ...fileChecks,
      diffCheck
    ],
    verifiedAt: new Date().toISOString()
  };
}

module.exports = {
  verifyPatch
};
