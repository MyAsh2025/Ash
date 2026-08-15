"use strict";

const { runCoreCheck } = require("./ash/runtime/corecheck-runtime");

function runAshDevelopmentVerification({
  projectPath = process.cwd()
} = {}) {
  const coreCheck = runCoreCheck({
    projectPath
  });

  return {
    mode: "ash-development-verification",
    version: "ash-local-runtime-v0.1-permanent-verification",
    success: coreCheck.success === true,
    coreCheck,
    verifiedAt: new Date().toISOString()
  };
}

if (require.main === module) {
  const result = runAshDevelopmentVerification();

  console.log(
    JSON.stringify(result, null, 2)
  );

  if (!result.success) {
    process.exitCode = 1;
  }
}

module.exports = {
  runAshDevelopmentVerification
};
