"use strict";

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const PROJECT_ROOT = __dirname;
const AUTO_DEV_PATH = path.join(PROJECT_ROOT, "ash-auto-dev.js");
const LOG_DIR = path.join(PROJECT_ROOT, "ash", "logs");

const state = {
  running: false,
  stopping: false,
  cycle: 0,
  currentProcess: null,
  startedAt: null,
  lastCompletedAt: null,
  lastResult: null,
  consecutiveFailures: 0,
  nextTimer: null
};

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: PROJECT_ROOT,
    encoding: "utf8"
  });

  return (result.stdout || "").trim();
}

function gitStatus() {
  const branch = runGit(["branch", "--show-current"]) || "unknown";
  const status = runGit(["status", "--short"]);
  const latest = runGit(["log", "-1", "--pretty=format:%h%x09%s"]);
  const [latestCommit = "unknown", ...messageParts] = latest.split("\t");

  return {
    branch,
    status,
    clean: status.length === 0,
    latestCommit,
    latestMessage: messageParts.join("\t")
  };
}

function latestAutoDevLog() {
  if (!fs.existsSync(LOG_DIR)) {
    return null;
  }

  const files = fs.readdirSync(LOG_DIR)
    .filter((file) =>
      file.startsWith("ash-auto-dev-") &&
      file.endsWith(".json")
    )
    .map((file) => {
      const fullPath = path.join(LOG_DIR, file);

      return {
        file,
        fullPath,
        modifiedAt: fs.statSync(fullPath).mtimeMs
      };
    })
    .sort((a, b) => b.modifiedAt - a.modifiedAt);

  if (files.length === 0) {
    return null;
  }

  try {
    return {
      ...files[0],
      data: JSON.parse(fs.readFileSync(files[0].fullPath, "utf8"))
    };
  } catch (error) {
    return {
      ...files[0],
      data: null,
      error: error.message
    };
  }
}

function extractLatestSummary() {
  const latest = latestAutoDevLog();

  if (!latest?.data) {
    return null;
  }

  const data = latest.data;
  const firstCycle = Array.isArray(data.cycles)
    ? data.cycles[0]
    : null;

  return {
    success: data.success === true,
    stopReason: data.stopReason || null,
    failureStage: data.failureStage || null,
    errorMessage: data.errorMessage || null,
    failedAction: data.failedAction || null,
    selectedTask:
      data.selectedTask?.task ||
      firstCycle?.selectedTask?.task ||
      null,
    logPath: latest.fullPath
  };
}

function printHeader() {
  const git = gitStatus();

  console.clear();
  console.log("==============================================");
  console.log("              PC Ash Controller");
  console.log("==============================================");
  console.log("");
  console.log(`Project       Ash`);
  console.log(`Branch        ${git.branch}`);
  console.log(`Repository    ${git.clean ? "Clean" : "Dirty"}`);
  console.log(`Latest        ${git.latestCommit} ${git.latestMessage}`);
  console.log(`Agent         ${state.running ? "RUNNING" : "STOPPED"}`);
  console.log(`Cycle         ${state.cycle}`);
  console.log("");
  console.log("----------------------------------------------");
  console.log("Commands");
  console.log("----------------------------------------------");
  console.log("auto         Start continuous autonomous development");
  console.log("stop         Stop after the current process");
  console.log("run          Run one autonomous development cycle");
  console.log("status       Show agent and repository state");
  console.log("corecheck    Run the CoreCheck route once");
  console.log("git          Show repository state");
  console.log("clear        Refresh controller display");
  console.log("exit         Stop and exit controller");
  console.log("");
}

function printStatus() {
  const git = gitStatus();
  const latest = extractLatestSummary();

  console.log("");
  console.log("Agent");
  console.log("----------------------------------------------");
  console.log(`Running       ${state.running}`);
  console.log(`Stopping      ${state.stopping}`);
  console.log(`Cycle         ${state.cycle}`);
  console.log(`Started       ${state.startedAt || "-"}`);
  console.log(`Last complete ${state.lastCompletedAt || "-"}`);
  console.log(`Failures      ${state.consecutiveFailures}`);

  console.log("");
  console.log("Repository");
  console.log("----------------------------------------------");
  console.log(`Branch        ${git.branch}`);
  console.log(`Clean         ${git.clean}`);
  console.log(`Latest        ${git.latestCommit} ${git.latestMessage}`);

  if (git.status) {
    console.log("");
    console.log(git.status);
  }

  console.log("");
  console.log("Latest autonomous result");
  console.log("----------------------------------------------");

  if (!latest) {
    console.log("No autonomous-development log found.");
  } else {
    console.log(`Success       ${latest.success}`);
    console.log(`Stop reason   ${latest.stopReason || "-"}`);
    console.log(`Task          ${latest.selectedTask || "-"}`);
    console.log(`Failure stage ${latest.failureStage || "-"}`);
    console.log(`Failed action ${latest.failedAction || "-"}`);
    console.log(`Error         ${latest.errorMessage || "-"}`);
    console.log(`Log           ${latest.logPath}`);
  }

  console.log("");
}

function calculateDelay() {
  if (state.consecutiveFailures === 0) {
    return 2000;
  }

  return Math.min(
    30000,
    5000 * state.consecutiveFailures
  );
}

function scheduleNextCycle() {
  if (!state.running || state.stopping) {
    state.running = false;
    state.stopping = false;
    console.log("");
    console.log("PC Ash autonomous agent stopped.");
    console.log("");
    return;
  }

  const delay = calculateDelay();

  console.log("");
  console.log(`Next autonomous cycle starts in ${delay / 1000} seconds.`);
  console.log("Type 'stop' to stop after the current cycle.");
  console.log("");

  state.nextTimer = setTimeout(() => {
    state.nextTimer = null;
    runAutonomousCycle();
  }, delay);
}

function runAutonomousCycle() {
  if (state.currentProcess) {
    console.log("An autonomous-development process is already running.");
    return;
  }

  state.cycle += 1;

  console.log("");
  console.log("==============================================");
  console.log(`Autonomous development cycle ${state.cycle}`);
  console.log("==============================================");
  console.log("");

  const child = spawn(
    process.execPath,
    [
      AUTO_DEV_PATH,
      "--cycles",
      "10",
      "--apply"
    ],
    {
      cwd: PROJECT_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: false
    }
  );

  state.currentProcess = child;

  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
  });

  child.on("error", (error) => {
    console.error("");
    console.error(`Unable to run PC Ash: ${error.message}`);
  });

  child.on("close", (code) => {
    state.currentProcess = null;
    state.lastCompletedAt = new Date().toISOString();

    const summary = extractLatestSummary();
    state.lastResult = summary;

    if (summary?.success === true) {
      state.consecutiveFailures = 0;
    } else {
      state.consecutiveFailures += 1;
    }

    console.log("");
    console.log("----------------------------------------------");
    console.log(`Cycle ${state.cycle} completed with process code ${code}.`);

    if (summary) {
      console.log(`Success       ${summary.success}`);
      console.log(`Task          ${summary.selectedTask || "-"}`);
      console.log(`Failure stage ${summary.failureStage || "-"}`);
      console.log(`Error         ${summary.errorMessage || "-"}`);
    }

    console.log("----------------------------------------------");

    if (state.running) {
      scheduleNextCycle();
    }
  });
}

function startAutonomousAgent() {
  if (state.running) {
    console.log("PC Ash autonomous agent is already running.");
    return;
  }

  state.running = true;
  state.stopping = false;
  state.startedAt = new Date().toISOString();
  state.cycle = 0;
  state.consecutiveFailures = 0;

  console.log("");
  console.log("PC Ash autonomous agent started.");
  console.log("It will continue until 'stop' or 'exit' is entered.");
  console.log("");

  runAutonomousCycle();
}

function stopAutonomousAgent() {
  if (!state.running && !state.currentProcess) {
    console.log("PC Ash autonomous agent is already stopped.");
    return;
  }

  state.stopping = true;

  if (state.nextTimer) {
    clearTimeout(state.nextTimer);
    state.nextTimer = null;
  }

  if (!state.currentProcess) {
    state.running = false;
    state.stopping = false;
    console.log("PC Ash autonomous agent stopped.");
    return;
  }

  console.log("Stop requested. The current cycle will finish safely.");
}

function runOnce(args = ["--cycles", "1", "--apply"]) {
  if (state.currentProcess) {
    console.log("PC Ash is already running.");
    return;
  }

  const child = spawn(
    process.execPath,
    [AUTO_DEV_PATH, ...args],
    {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
      windowsHide: false
    }
  );

  state.currentProcess = child;

  child.on("close", () => {
    state.currentProcess = null;
    console.log("");
    console.log("One-time execution completed.");
    console.log("");
  });
}

function main() {
  printHeader();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "ash> "
  });

  rl.prompt();

  rl.on("line", (line) => {
    const command = line.trim().toLowerCase();

    switch (command) {
      case "":
        break;

      case "auto":
      case "start":
        startAutonomousAgent();
        break;

      case "stop":
        stopAutonomousAgent();
        break;

      case "run":
        runOnce();
        break;

      case "corecheck":
        runOnce(["--task", "corecheck"]);
        break;

      case "status":
      case "git":
        printStatus();
        break;

      case "clear":
        printHeader();
        break;

      case "exit":
      case "quit":
        stopAutonomousAgent();

        if (state.currentProcess) {
          console.log("Exit requested. Close after the current cycle completes.");
        } else {
          rl.close();
        }
        break;

      default:
        console.log(`Unknown command: ${command}`);
        break;
    }

    rl.prompt();
  });

  rl.on("close", () => {
    stopAutonomousAgent();
    console.log("");
    console.log("PC Ash Controller closed.");
    process.exit(0);
  });
}

main();
