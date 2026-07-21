"use strict";

const { runStartupGate } = require("./startup-gate");

function buildBootstrapContext({
  task,
  projectContext,
  repository,
  dryRun,
  ashCorePath = null
} = {}) {
  const startupGate = runStartupGate({
    task,
    projectContext,
    repository,
    dryRun,
    ashCorePath
  });

  return {
    mode: "bootstrap-runtime",
    version:
      "ash-local-runtime-v0.2-core-path-forwarding",
    task,
    dryRun,
    projectContext,
    repository,
    startupGate,
    ashCore: startupGate?.ashCore || null,
    ready: Boolean(
      startupGate &&
      startupGate.runtimeExecutionAllowed === true
    ),
    bootstrappedAt: new Date().toISOString()
  };
}

module.exports = {
  buildBootstrapContext
};