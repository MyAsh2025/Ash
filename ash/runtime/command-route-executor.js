"use strict";

const { execFileSync } = require("child_process");
const { runCoreCheck } = require("./corecheck-runtime");

function runGitOnly({ requestedTask, commandRoute }) {
  const statusShort = execFileSync("git", ["status", "--short"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  const latestCommit = execFileSync("git", ["log", "-1", "--oneline"], {
    cwd: process.cwd(),
    encoding: "utf8"
  }).trim();

  return {
    handled: true,
    exitCode: 0,
    output: {
      mode: "ash-auto-dev-runner",
      route: "git-only",
      commandRoute,
      success: true,
      requestedTask,
      patchAllowed: false,
      applied: false,
      git: {
        clean: statusShort.trim().length === 0,
        latestCommit,
        statusShort
      },
      note: "Git route completed without patch planning.",
      ranAt: new Date().toISOString()
    }
  };
}

function runCoreCheckOnly({ requestedTask, commandRoute }) {
  const coreCheck = runCoreCheck({
    files: [
      "./ash-auto-dev.js",
      "./ash/runtime/intent-runtime.js",
      "./ash/runtime/command-router.js",
      "./ash/runtime/command-route-executor.js",
      "./ash/runtime/autonomous-development-manager.js",
      "./ash/runtime/development-pipeline-runtime.js",
      "./ash/runtime/capability-loop.js",
      "./ash/capabilities/development-pipeline.js"
    ]
  });

  return {
    handled: true,
    exitCode: coreCheck.success ? 0 : 1,
    output: {
      mode: "ash-auto-dev-runner",
      route: "corecheck-only",
      commandRoute,
      success: coreCheck.success,
      requestedTask,
      patchAllowed: false,
      applied: false,
      coreCheck,
      note: "CoreCheck route completed without patch planning.",
      ranAt: new Date().toISOString()
    }
  };
}

function runReportOnly({ requestedTask, intentResult, commandRoute }) {
  return {
    handled: true,
    exitCode: 0,
    output: {
      mode: "ash-auto-dev-runner",
      route: commandRoute.route,
      commandRoute,
      success: true,
      requestedTask,
      intent: intentResult.intent,
      patchAllowed: false,
      applied: false,
      reportOnly: true,
      note: "Command Route Executor stopped before patch planning.",
      ranAt: new Date().toISOString()
    }
  };
}

function executeCommandRoute({ requestedTask, intentResult, commandRoute }) {
  if (!commandRoute || commandRoute.route === "development-pipeline") {
    return { handled: false };
  }

  if (commandRoute.route === "git-only") {
    return runGitOnly({ requestedTask, commandRoute });
  }

  if (commandRoute.route === "corecheck-only") {
    return runCoreCheckOnly({ requestedTask, commandRoute });
  }

  if (commandRoute.route === "intent-report-only") {
    return runReportOnly({ requestedTask, intentResult, commandRoute });
  }

  if (commandRoute.route === "handover-only") {
    return runReportOnly({ requestedTask, intentResult, commandRoute });
  }

  return {
    handled: true,
    exitCode: 1,
    output: {
      mode: "ash-auto-dev-runner",
      route: commandRoute.route,
      commandRoute,
      success: false,
      requestedTask,
      patchAllowed: false,
      applied: false,
      note: "Unknown command route. Stopped before patch planning.",
      ranAt: new Date().toISOString()
    }
  };
}

module.exports = {
  executeCommandRoute
};
