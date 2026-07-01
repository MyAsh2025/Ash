"use strict";

function routeCommand(intentResult = {}) {
  const intent = intentResult.intent || "planning";

  if (intent === "git") {
    return {
      mode: "command-router",
      version: "ash-local-runtime-v0.1",
      route: "git-only",
      patchAllowed: false,
      reportOnly: false,
      stopBeforeDevelopmentPipeline: true
    };
  }

  if (intent === "corecheck") {
    return {
      mode: "command-router",
      version: "ash-local-runtime-v0.1",
      route: "corecheck-only",
      patchAllowed: false,
      reportOnly: false,
      stopBeforeDevelopmentPipeline: true
    };
  }

  if (intentResult.reportOnly) {
    return {
      mode: "command-router",
      version: "ash-local-runtime-v0.1",
      route: "intent-report-only",
      patchAllowed: false,
      reportOnly: true,
      stopBeforeDevelopmentPipeline: true
    };
  }

  return {
    mode: "command-router",
    version: "ash-local-runtime-v0.1",
    route: "development-pipeline",
    patchAllowed: true,
    reportOnly: false,
    stopBeforeDevelopmentPipeline: false
  };
}

module.exports = {
  routeCommand
};

