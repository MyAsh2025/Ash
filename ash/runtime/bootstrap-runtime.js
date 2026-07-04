const { runStartupGate } = require("./startup-gate");

function buildBootstrapContext({ task, projectContext, repository, dryRun }) {
  const startupGate = runStartupGate({
    task,
    projectContext,
    repository,
    dryRun
  });

  return {
    mode: "bootstrap-runtime",
    version: "ash-local-runtime-v0.1-ash-core-startup",
    task,
    dryRun,
    projectContext,
    repository,
    startupGate,
    ashCore: startupGate?.ashCore || null,
    ready: Boolean(startupGate),
    bootstrappedAt: new Date().toISOString()
  };
}

module.exports = {
  buildBootstrapContext
};
