"use strict";

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const PROJECT_ROOT = process.env.ASH_CONTROLLER_PROJECT_ROOT
  ? path.resolve(process.env.ASH_CONTROLLER_PROJECT_ROOT)
  : __dirname;
const AUTO_DEV_PATH = process.env.ASH_CONTROLLER_AUTO_DEV_PATH
  ? path.resolve(process.env.ASH_CONTROLLER_AUTO_DEV_PATH)
  : path.join(PROJECT_ROOT, "ash-auto-dev.js");
const LOG_DIR = path.join(PROJECT_ROOT, "ash", "logs");
const LOCK_NAME = "ash-autonomous-supervisor.lock.json";
const IDLE_DELAY_MS = 5 * 60 * 1000;
const TRANSIENT_DELAY_BASE_MS = 15000;
const TRANSIENT_DELAY_MAX_MS = 15 * 60 * 1000;

const state = {
  running: false,
  stopping: false,
  cycle: 0,
  currentProcess: null,
  startedAt: null,
  lastCompletedAt: null,
  lastResult: null,
  consecutiveFailures: 0,
  nextTimer: null,
  lockPath: null,
  lockRecord: null,
  exitWhenStopped: false,
  readline: null,
  exitCallback: null,
  controllerExitCompleted: false
};

function createOwnerToken() {
  return `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function resolveRepositoryLockPath(projectRoot = PROJECT_ROOT) {
  const result = spawnSync("git", ["rev-parse", "--git-path", LOCK_NAME], {
    cwd: projectRoot,
    encoding: "utf8",
    shell: false
  });

  if (result.status !== 0 || !String(result.stdout || "").trim()) {
    return null;
  }

  const gitPath = String(result.stdout).trim();
  return path.isAbsolute(gitPath)
    ? gitPath
    : path.resolve(projectRoot, gitPath);
}

function readLockRecord(lockPath) {
  try {
    const record = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    if (
      !record ||
      !Number.isInteger(record.pid) ||
      typeof record.ownerToken !== "string" ||
      record.ownerToken.length === 0
    ) {
      return { success: false, reason: "lock_state_unverifiable", record: null };
    }
    return { success: true, reason: "lock_state_read", record };
  } catch (error) {
    return {
      success: false,
      reason: "lock_state_unverifiable",
      record: null,
      errorMessage: error?.message || "Unable to read repository lock."
    };
  }
}

function lockRecordIsLive(record, processAlive = isProcessAlive) {
  return (
    processAlive(record?.pid) ||
    processAlive(record?.activeChildPid)
  );
}

function writeNewLock(lockPath, record) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const handle = fs.openSync(lockPath, "wx");
  try {
    fs.writeFileSync(handle, JSON.stringify(record, null, 2), "utf8");
  } finally {
    fs.closeSync(handle);
  }
}

function acquireRepositoryLock({
  lockPath = resolveRepositoryLockPath(),
  ownerKind = "ash-controller",
  inheritedOwnerToken = null,
  processAlive = isProcessAlive
} = {}) {
  if (!lockPath) {
    return { success: false, reason: "repository_lock_path_unavailable", record: null };
  }

  let staleLockRecovered = false;
  if (fs.existsSync(lockPath)) {
    const existing = readLockRecord(lockPath);
    if (!existing.success) return existing;

    if (
      inheritedOwnerToken &&
      existing.record.ownerToken === inheritedOwnerToken &&
      lockRecordIsLive(existing.record, processAlive)
    ) {
      return {
        success: true,
        reason: "inherited_lock_authorized",
        inherited: true,
        staleLockRecovered: false,
        record: existing.record
      };
    }

    if (lockRecordIsLive(existing.record, processAlive)) {
      return {
        success: false,
        reason: "live_lock_conflict",
        record: existing.record
      };
    }

    const stalePath = `${lockPath}.stale-${process.pid}-${Date.now()}`;
    try {
      fs.renameSync(lockPath, stalePath);
      fs.unlinkSync(stalePath);
      staleLockRecovered = true;
    } catch (error) {
      return {
        success: false,
        reason: "stale_lock_recovery_failed",
        record: existing.record,
        errorMessage: error?.message || "Unable to recover stale repository lock."
      };
    }
  }

  const record = {
    version: 1,
    repository: PROJECT_ROOT,
    pid: process.pid,
    activeChildPid: null,
    ownerKind,
    ownerToken: createOwnerToken(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
    writeNewLock(lockPath, record);
    return {
      success: true,
      reason: "repository_lock_acquired",
      inherited: false,
      staleLockRecovered,
      record
    };
  } catch (error) {
    return {
      success: false,
      reason: error?.code === "EEXIST" ? "live_lock_conflict" : "repository_lock_acquire_failed",
      record: null,
      errorMessage: error?.message || "Unable to acquire repository lock."
    };
  }
}

function updateRepositoryLock({ lockPath, ownerToken, activeChildPid = null } = {}) {
  if (!lockPath || !fs.existsSync(lockPath)) return false;
  const current = readLockRecord(lockPath);
  if (!current.success || current.record.ownerToken !== ownerToken) return false;

  const next = {
    ...current.record,
    activeChildPid: Number.isInteger(activeChildPid) ? activeChildPid : null,
    updatedAt: new Date().toISOString()
  };
  const temporaryPath = `${lockPath}.update-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporaryPath, JSON.stringify(next, null, 2), "utf8");
  fs.renameSync(temporaryPath, lockPath);
  return true;
}

function releaseRepositoryLock({ lockPath, ownerToken } = {}) {
  if (!lockPath || !fs.existsSync(lockPath)) return true;
  const current = readLockRecord(lockPath);
  if (!current.success || current.record.ownerToken !== ownerToken) return false;
  fs.unlinkSync(lockPath);
  return true;
}

function evaluateSafeStartup({ repositoryClean, lockAuthorized } = {}) {
  if (lockAuthorized !== true) {
    return { success: false, blocked: true, reason: "live_lock_conflict", retryAutomatically: false };
  }
  if (repositoryClean !== true) {
    return { success: false, blocked: true, reason: "dirty_repository", retryAutomatically: false };
  }
  return { success: true, blocked: false, reason: "safe_startup_ready", retryAutomatically: true };
}

function recordControllerEvent(event, logDir = LOG_DIR) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    const eventPath = path.join(
      logDir,
      `ash-controller-${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}.json`
    );
    fs.writeFileSync(eventPath, JSON.stringify({
      mode: "ash-controller-event",
      ...event,
      recordedAt: new Date().toISOString()
    }, null, 2), "utf8");
    return eventPath;
  } catch {
    return null;
  }
}

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

function identifyRunResult({
  logDir = LOG_DIR,
  runId,
  childExitCode
} = {}) {
  if (!runId || !fs.existsSync(logDir)) {
    return {
      success: false,
      reason: "run_result_missing",
      runId: runId || null,
      childExitCode,
      data: null,
      logPath: null
    };
  }

  const matches = [];
  for (const file of fs.readdirSync(logDir)) {
    if (!file.startsWith("ash-auto-dev-") || !file.endsWith(".json")) continue;
    const fullPath = path.join(logDir, file);
    try {
      const data = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      if (data?.controllerRunId === runId) matches.push({ fullPath, data });
    } catch {
      // A malformed or unrelated log is never accepted as this run's result.
    }
  }

  if (matches.length !== 1) {
    return {
      success: false,
      reason: matches.length === 0 ? "run_result_missing" : "run_result_ambiguous",
      runId,
      childExitCode,
      data: null,
      logPath: null
    };
  }

  const match = matches[0];
  const exitSucceeded = childExitCode === 0;
  const resultSucceeded = match.data.success === true;
  if (exitSucceeded !== resultSucceeded) {
    return {
      success: false,
      reason: "run_result_exit_mismatch",
      runId,
      childExitCode,
      data: match.data,
      logPath: match.fullPath
    };
  }

  return {
    success: true,
    reason: "run_result_verified",
    runId,
    childExitCode,
    data: match.data,
    logPath: match.fullPath
  };
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

function classifyCycleOutcome({ childExitCode, runResult } = {}) {
  if (!runResult || typeof runResult !== "object") {
    return { classification: "invalid_result", retryAutomatically: false, reason: "run_result_missing" };
  }

  const stopReason = String(runResult.stopReason || "").toLowerCase();
  const failureStage = String(runResult.failureStage || "").toLowerCase();
  const errorMessage = String(runResult.errorMessage || "").toLowerCase();
  const combined = `${stopReason} ${failureStage} ${errorMessage}`;

  if (childExitCode === 0 && runResult.success === true && stopReason === "no_repository_task") {
    return { classification: "idle", retryAutomatically: true, reason: "no_repository_task" };
  }

  if (
    /approval[_ -]required|explicit user approval/.test(combined) ||
    /safety gate|safety rejection|startup-gate|dirty_repository|live_lock_conflict|target[_ -]symbol[_ -](?:ambiguity|unresolved)/.test(combined)
  ) {
    return { classification: "manual_block", retryAutomatically: false, reason: "manual_or_safety_block" };
  }

  if (
    /implementation-provider|provider/.test(combined) &&
    /network|connect|timeout|timed out|econn|429|rate limit|temporar|unavailable/.test(combined)
  ) {
    return { classification: "transient_failure", retryAutomatically: true, reason: "transient_provider_failure" };
  }

  if (childExitCode === 0 && runResult.success === true) {
    return { classification: "success", retryAutomatically: true, reason: stopReason || "completed" };
  }

  return { classification: "terminal_failure", retryAutomatically: true, reason: stopReason || "terminal_failure" };
}

function calculateDelay({ classification = "success", consecutiveFailures = 0 } = {}) {
  if (classification === "idle") return IDLE_DELAY_MS;
  if (classification === "transient_failure") {
    const exponent = Math.max(0, Math.min(10, consecutiveFailures - 1));
    return Math.min(TRANSIENT_DELAY_MAX_MS, TRANSIENT_DELAY_BASE_MS * (2 ** exponent));
  }
  if (classification === "terminal_failure") return 5000;
  return 2000;
}

function shouldScheduleNextCycle({ running, stopping, retryAutomatically } = {}) {
  return running === true && stopping !== true && retryAutomatically === true;
}

function createGracefulShutdownRequester({ requestStop } = {}) {
  let shutdownRequested = false;

  return (signal = "shutdown") => {
    if (shutdownRequested) return false;
    shutdownRequested = true;
    if (typeof requestStop === "function") requestStop(signal);
    return true;
  };
}

function installGracefulSignalHandlers({
  processTarget = process,
  requestShutdown
} = {}) {
  if (!processTarget || typeof processTarget.on !== "function") return false;
  if (typeof requestShutdown !== "function") return false;

  processTarget.on("SIGINT", () => requestShutdown("SIGINT"));
  processTarget.on("SIGTERM", () => requestShutdown("SIGTERM"));
  return true;
}

function completeControllerExit() {
  if (state.controllerExitCompleted || state.currentProcess) return false;

  if (state.lockRecord) {
    releaseRepositoryLock({
      lockPath: state.lockPath,
      ownerToken: state.lockRecord.ownerToken
    });
    state.lockPath = null;
    state.lockRecord = null;
  }

  if (state.readline) {
    const rl = state.readline;
    state.readline = null;
    rl.close();
    return true;
  }

  state.controllerExitCompleted = true;
  console.log("");
  console.log("PC Ash Controller closed.");
  if (typeof state.exitCallback === "function") state.exitCallback();
  return true;
}

function scheduleNextCycle(outcome = { classification: "success", retryAutomatically: true }) {
  if (!shouldScheduleNextCycle({
    running: state.running,
    stopping: state.stopping,
    retryAutomatically: outcome.retryAutomatically
  })) {
    state.running = false;
    const wasStopping = state.stopping;
    state.stopping = false;
    console.log("");
    console.log("PC Ash autonomous agent stopped.");
    console.log("");
    if (state.lockRecord) {
      releaseRepositoryLock({
        lockPath: state.lockPath,
        ownerToken: state.lockRecord.ownerToken
      });
      state.lockPath = null;
      state.lockRecord = null;
    }
    if ((wasStopping || state.exitWhenStopped) && state.exitWhenStopped) {
      completeControllerExit();
    }
    return;
  }

  const delay = calculateDelay({
    classification: outcome.classification,
    consecutiveFailures: state.consecutiveFailures
  });

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

  const git = gitStatus();
  const startup = evaluateSafeStartup({
    repositoryClean: git.clean,
    lockAuthorized: Boolean(state.lockRecord)
  });

  if (!startup.success) {
    state.lastResult = {
      success: false,
      stopReason: startup.reason,
      failureStage: "controller-startup-gate",
      errorMessage: `Autonomous apply blocked: ${startup.reason}.`
    };
    recordControllerEvent({
      event: "startup-blocked",
      ...state.lastResult,
      repository: git
    });
    scheduleNextCycle({
      classification: "manual_block",
      retryAutomatically: false,
      reason: startup.reason
    });
    return;
  }

  state.cycle += 1;
  const runId = `controller-${process.pid}-${Date.now()}-${state.cycle}`;

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
      "--apply",
      "--run-id",
      runId
    ],
    {
      cwd: PROJECT_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: false,
      env: {
        ...process.env,
        ASH_AUTONOMOUS_LOCK_TOKEN: state.lockRecord.ownerToken
      }
    }
  );

  state.currentProcess = child;
  if (!updateRepositoryLock({
    lockPath: state.lockPath,
    ownerToken: state.lockRecord.ownerToken,
    activeChildPid: child.pid
  })) {
    state.stopping = true;
    recordControllerEvent({
      event: "lock-update-failed",
      success: false,
      stopReason: "repository_lock_update_failed",
      failureStage: "controller-lock"
    });
  }

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
    updateRepositoryLock({
      lockPath: state.lockPath,
      ownerToken: state.lockRecord?.ownerToken,
      activeChildPid: null
    });

    const identified = identifyRunResult({
      logDir: LOG_DIR,
      runId,
      childExitCode: code
    });
    const summary = identified.success ? identified.data : {
      success: false,
      stopReason: identified.reason,
      failureStage: "controller-run-result",
      errorMessage: `Unable to verify result for controller run ${runId}.`
    };
    state.lastResult = summary;
    const outcome = identified.success
      ? classifyCycleOutcome({ childExitCode: code, runResult: summary })
      : {
          classification: "invalid_result",
          retryAutomatically: false,
          reason: identified.reason
        };

    if (outcome.classification === "success" || outcome.classification === "idle") {
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

    recordControllerEvent({
      event: "cycle-completed",
      runId,
      childExitCode: code,
      resultIdentification: identified.reason,
      outcome,
      result: summary
    });

    if (state.running) {
      scheduleNextCycle(outcome);
    }
  });
}

function startAutonomousAgent() {
  if (state.running) {
    console.log("PC Ash autonomous agent is already running.");
    return false;
  }

  const lockPath = resolveRepositoryLockPath(PROJECT_ROOT);
  const lock = acquireRepositoryLock({
    lockPath,
    ownerKind: "ash-controller"
  });
  if (!lock.success) {
    state.lastResult = {
      success: false,
      stopReason: lock.reason,
      failureStage: "controller-lock",
      errorMessage: "Autonomous apply did not start because the repository lock is unavailable."
    };
    recordControllerEvent({ event: "startup-blocked", ...state.lastResult, lock: lock.record });
    console.log(`PC Ash did not start: ${lock.reason}.`);
    return false;
  }

  const git = gitStatus();
  const startup = evaluateSafeStartup({ repositoryClean: git.clean, lockAuthorized: true });
  if (!startup.success) {
    releaseRepositoryLock({ lockPath, ownerToken: lock.record.ownerToken });
    state.lastResult = {
      success: false,
      stopReason: startup.reason,
      failureStage: "controller-startup-gate",
      errorMessage: "Autonomous apply did not start because the repository is not clean."
    };
    recordControllerEvent({ event: "startup-blocked", ...state.lastResult, repository: git });
    console.log(`PC Ash did not start: ${startup.reason}.`);
    return false;
  }

  state.lockPath = lockPath;
  state.lockRecord = lock.record;
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
  return true;
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
    if (state.lockRecord) {
      releaseRepositoryLock({
        lockPath: state.lockPath,
        ownerToken: state.lockRecord.ownerToken
      });
      state.lockPath = null;
      state.lockRecord = null;
    }
    console.log("PC Ash autonomous agent stopped.");
    if (state.exitWhenStopped) completeControllerExit();
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

function main({ args = process.argv.slice(2) } = {}) {
  printHeader();

  state.exitCallback = () => process.exit(0);
  const requestShutdown = createGracefulShutdownRequester({
    requestStop: (signal) => {
      console.log(`Graceful shutdown requested by ${signal}.`);
      state.exitWhenStopped = true;
      stopAutonomousAgent();
      if (!state.currentProcess && !state.running) completeControllerExit();
    }
  });
  installGracefulSignalHandlers({ processTarget: process, requestShutdown });

  if (args.includes("--auto")) {
    const started = startAutonomousAgent();
    if (!started) completeControllerExit();
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "ash> "
  });
  state.readline = rl;

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
        requestShutdown("interactive-exit");

        if (state.currentProcess) {
          console.log("Exit requested. Close after the current cycle completes.");
        }
        break;

      default:
        console.log(`Unknown command: ${command}`);
        break;
    }

    rl.prompt();
  });

  rl.on("close", () => {
    if (state.currentProcess) return;
    state.readline = null;
    completeControllerExit();
  });
}

if (require.main === module && process.env.ASH_CONTROLLER_MODULE_ONLY !== "1") {
  main();
}

module.exports = {
  acquireRepositoryLock,
  releaseRepositoryLock,
  updateRepositoryLock,
  evaluateSafeStartup,
  identifyRunResult,
  classifyCycleOutcome,
  calculateDelay,
  shouldScheduleNextCycle,
  createGracefulShutdownRequester,
  installGracefulSignalHandlers,
  resolveRepositoryLockPath,
  isProcessAlive
};
