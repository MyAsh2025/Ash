"use strict";

const { execFileSync, spawnSync } = require("child_process");
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


function hasUnsafeShellCharacters(command) {
  return /[;&|<>`]/.test(command);
}

function isLocalReadVerifyCommand(command) {
  const trimmed = String(command || "").trim();

  if (!trimmed || trimmed.includes("\n") || hasUnsafeShellCharacters(trimmed)) {
    return false;
  }

  return (
    /^Get-Content\s+/i.test(trimmed) ||
    /^Select-String\s+/i.test(trimmed) ||
    /^git\s+status\b/i.test(trimmed) ||
    /^git\s+diff\b/i.test(trimmed) ||
    /^node\s+--check\s+/i.test(trimmed)
  );
}

function executeLocalReadVerifyCommand(command) {
  const trimmed = String(command || "").trim();

  let result;

  if (/^(Get-Content|Select-String)\s+/i.test(trimmed)) {
    result = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", trimmed],
      { cwd: process.cwd(), encoding: "utf8" }
    );
  } else {
    const parts = trimmed.split(/\s+/);
    result = spawnSync(parts[0], parts.slice(1), {
      cwd: process.cwd(),
      encoding: "utf8"
    });
  }

  const exitCode = typeof result.status === "number" ? result.status : 1;

  return {
    handled: true,
    exitCode,
    output: {
      mode: "command-route-executor",
      route: "local-read-verify",
      success: exitCode === 0,
      requestedTask: command,
      patchAllowed: false,
      applied: false,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      exitCode,
      note: "Executed allowlisted local read/verify command without patching.",
      ranAt: new Date().toISOString()
    }
  };
}
function executeCommandRoute({ requestedTask, intentResult, commandRoute }) {
  if (isLocalReadVerifyCommand(requestedTask)) {
    return executeLocalReadVerifyCommand(requestedTask);
  }

  if (/do not patch/i.test(String(requestedTask || ""))) {
    return {
      handled: true,
      exitCode: 0,
      output: {
        mode: "command-route-executor",
        route: "no-patch-report",
        success: true,
        requestedTask,
        intent: intentResult?.intent || null,
        patchAllowed: false,
        applied: false,
        reportOnly: true,
        note: "Stopped because request explicitly contains do not patch.",
        ranAt: new Date().toISOString()
      }
    };
  }
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

  if (commandRoute.route === "resume-only") {
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

