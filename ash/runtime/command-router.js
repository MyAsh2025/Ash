"use strict";

function routeCommand(intentResult = {}) {
  const intent = intentResult.intent || "planning";

  if (intent === "resume") {
    return {
      mode: "command-router",
      version: "ash-local-runtime-v0.1",
      route: "resume-only",
      patchAllowed: false,
      reportOnly: true,
      stopBeforeDevelopmentPipeline: true
    };
  }

  if (intent === "handover") {
    return {
      mode: "command-router",
      version: "ash-local-runtime-v0.1",
      route: "handover-only",
      patchAllowed: false,
      reportOnly: false,
      stopBeforeDevelopmentPipeline: true
    };
  }

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

