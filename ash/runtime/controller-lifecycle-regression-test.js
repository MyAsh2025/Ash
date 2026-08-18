"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const PROCESS_TIMEOUT_MS = 10000;

process.env.ASH_CONTROLLER_MODULE_ONLY = "1";

const controller = require("../../ash-controller");

const {
  acquireRepositoryLock,
  releaseRepositoryLock,
  evaluateSafeStartup,
  identifyRunResult,
  classifyCycleOutcome,
  calculateDelay,
  shouldScheduleNextCycle,
  createGracefulShutdownRequester,
  installGracefulSignalHandlers,
  requestCooperativeStop,
  evaluateCooperativeStopRequest
} = controller;

for (const [name, value] of Object.entries({
  acquireRepositoryLock,
  releaseRepositoryLock,
  evaluateSafeStartup,
  identifyRunResult,
  classifyCycleOutcome,
  calculateDelay,
  shouldScheduleNextCycle,
  createGracefulShutdownRequester,
  installGracefulSignalHandlers,
  requestCooperativeStop,
  evaluateCooperativeStopRequest
})) {
  assert.strictEqual(typeof value, "function", `${name} must be exported.`);
}

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "ash-controller-lifecycle-"));
const gitInit = spawnSync("git", ["init", "--quiet"], {
  cwd: fixture,
  encoding: "utf8"
});
assert.strictEqual(gitInit.status, 0, gitInit.stderr);
const lockPath = path.join(fixture, ".git", "ash-autonomous-supervisor.lock.json");
const logDir = path.join(fixture, "logs");
const autoLogDir = path.join(fixture, "ash", "logs");
fs.mkdirSync(logDir, { recursive: true });

const lockHolderScript = [
  "process.env.ASH_CONTROLLER_MODULE_ONLY='1';",
  "const c=require(process.argv[1]);",
  "const result=c.acquireRepositoryLock({lockPath:process.argv[2],ownerKind:'regression-holder'});",
  "if(!result.success){process.exit(2);}",
  "process.stdout.write(JSON.stringify(result.record)+'\\n');",
  "setTimeout(()=>{c.releaseRepositoryLock({lockPath:process.argv[2],ownerToken:result.record.ownerToken});process.exit(0);},1500);"
].join("");

const holder = spawn(process.execPath, [
  "-e",
  lockHolderScript,
  path.join(process.cwd(), "ash-controller.js"),
  lockPath
], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "inherit"],
  timeout: PROCESS_TIMEOUT_MS
});

let holderOutput = "";
holder.stdout.on("data", (chunk) => { holderOutput += chunk; });

function waitForHolder() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 1000;
    const poll = () => {
      if (holderOutput.includes("\n")) return resolve();
      if (holder.exitCode != null) return reject(new Error("Lock holder exited early."));
      if (Date.now() >= deadline) return reject(new Error("Lock holder did not acquire lock."));
      setTimeout(poll, 10);
    };
    poll();
  });
}

function waitForClose(child, label, timeoutMs = PROCESS_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    if (child.exitCode != null) return resolve(child.exitCode);
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${label} did not close within ${timeoutMs}ms.`));
    }, timeoutMs);
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

async function main() {
  await waitForHolder();

  const competing = acquireRepositoryLock({
    lockPath,
    ownerKind: "regression-competitor"
  });
  assert.strictEqual(competing.success, false);
  assert.strictEqual(competing.reason, "live_lock_conflict");
  assert.strictEqual(fs.existsSync(lockPath), true, "A live lock must not be reclaimed.");

  const blockedApply = spawnSync(process.execPath, [
    path.join(process.cwd(), "ash-auto-dev.js"),
    "--cycles",
    "0",
    "--apply",
    "--run-id",
    "controller-lock-conflict-regression"
  ], { cwd: fixture, encoding: "utf8" });
  assert.strictEqual(blockedApply.status, 1);
  const blockedLog = fs.readdirSync(autoLogDir)
    .map((file) => path.join(autoLogDir, file))
    .map((file) => JSON.parse(fs.readFileSync(file, "utf8")))
    .find((entry) => entry.controllerRunId === "controller-lock-conflict-regression");
  assert.strictEqual(blockedLog?.stopReason, "live_lock_conflict");
  assert.strictEqual(blockedLog?.applied, false);

  await waitForClose(holder, "Lock holder");

  fs.writeFileSync(lockPath, JSON.stringify({
    pid: 99999999,
    activeChildPid: null,
    ownerToken: "stale-owner",
    createdAt: new Date(0).toISOString()
  }), "utf8");

  const recovered = acquireRepositoryLock({
    lockPath,
    ownerKind: "regression-recovery"
  });
  assert.strictEqual(recovered.success, true);
  assert.strictEqual(recovered.staleLockRecovered, true);
  releaseRepositoryLock({ lockPath, ownerToken: recovered.record.ownerToken });

  fs.writeFileSync(lockPath, "not-json", "utf8");
  const malformed = acquireRepositoryLock({ lockPath, ownerKind: "regression-malformed" });
  assert.strictEqual(malformed.success, false);
  assert.strictEqual(malformed.reason, "lock_state_unverifiable");
  fs.unlinkSync(lockPath);

  assert.deepStrictEqual(
    evaluateSafeStartup({ repositoryClean: false, lockAuthorized: true }),
    {
      success: false,
      blocked: true,
      reason: "dirty_repository",
      retryAutomatically: false
    }
  );
  assert.strictEqual(
    evaluateSafeStartup({ repositoryClean: true, lockAuthorized: false }).reason,
    "live_lock_conflict"
  );

  const oldLog = path.join(logDir, "ash-auto-dev-old.json");
  fs.writeFileSync(oldLog, JSON.stringify({
    success: true,
    stopReason: "completed",
    controllerRunId: "old-run"
  }), "utf8");

  const missing = identifyRunResult({
    logDir,
    runId: "current-run",
    childExitCode: 1
  });
  assert.strictEqual(missing.success, false);
  assert.strictEqual(missing.reason, "run_result_missing");

  const currentLog = path.join(logDir, "ash-auto-dev-current.json");
  fs.writeFileSync(currentLog, JSON.stringify({
    success: true,
    stopReason: "completed",
    controllerRunId: "current-run"
  }), "utf8");

  const contradictory = identifyRunResult({
    logDir,
    runId: "current-run",
    childExitCode: 1
  });
  assert.strictEqual(contradictory.success, false);
  assert.strictEqual(contradictory.reason, "run_result_exit_mismatch");

  const idle = classifyCycleOutcome({
    childExitCode: 0,
    runResult: { success: true, stopReason: "no_repository_task" }
  });
  assert.strictEqual(idle.classification, "idle");
  assert.strictEqual(idle.retryAutomatically, true);
  assert.ok(calculateDelay({ classification: "idle" }) >= 60000);

  const transient = classifyCycleOutcome({
    childExitCode: 1,
    runResult: {
      success: false,
      failureStage: "implementation-provider",
      errorMessage: "Provider network connection timed out."
    }
  });
  assert.strictEqual(transient.classification, "transient_failure");
  const firstDelay = calculateDelay({ classification: "transient_failure", consecutiveFailures: 1 });
  const largeDelay = calculateDelay({ classification: "transient_failure", consecutiveFailures: 100 });
  assert.ok(firstDelay > 0);
  assert.ok(largeDelay >= firstDelay);
  assert.ok(largeDelay <= 15 * 60 * 1000);

  for (const runResult of [
    { success: false, stopReason: "approval_required" },
    { success: false, stopReason: "target_symbol_ambiguity" },
    { success: false, failureStage: "startup-gate", errorMessage: "Safety gate blocked execution." }
  ]) {
    const blocked = classifyCycleOutcome({ childExitCode: 1, runResult });
    assert.strictEqual(blocked.classification, "manual_block");
    assert.strictEqual(blocked.retryAutomatically, false);
  }

  assert.strictEqual(shouldScheduleNextCycle({ running: true, stopping: true, retryAutomatically: true }), false);
  assert.strictEqual(shouldScheduleNextCycle({ running: true, stopping: false, retryAutomatically: true }), true);

  const requestedSignals = [];
  const shutdownRequester = createGracefulShutdownRequester({
    requestStop: (signal) => requestedSignals.push(signal)
  });
  const fakeProcess = new (require("events").EventEmitter)();
  installGracefulSignalHandlers({ processTarget: fakeProcess, requestShutdown: shutdownRequester });
  fakeProcess.emit("SIGTERM");
  fakeProcess.emit("SIGTERM");
  fakeProcess.emit("SIGINT");
  assert.deepStrictEqual(
    requestedSignals,
    ["SIGTERM"],
    "SIGINT/SIGTERM must share one idempotent graceful shutdown request."
  );

  const controllerFixture = fs.mkdtempSync(path.join(os.tmpdir(), "ash-controller-process-"));
  assert.strictEqual(
    spawnSync("git", ["init", "--quiet"], { cwd: controllerFixture }).status,
    0
  );
  fs.writeFileSync(
    path.join(controllerFixture, ".gitignore"),
    "ash/logs/*.json\n",
    "utf8"
  );
  const fakeAutoDev = path.join(controllerFixture, "fake-auto-dev.js");
  const invocationPath = path.join(controllerFixture, ".git", "fake-invocations.txt");
  const startedPath = path.join(controllerFixture, ".git", "fake-started.txt");
  fs.writeFileSync(fakeAutoDev, [
    '"use strict";',
    'const fs=require("fs");',
    'const path=require("path");',
    'const runIndex=process.argv.indexOf("--run-id");',
    'const runId=runIndex>=0?process.argv[runIndex+1]:null;',
    `const invocationPath=${JSON.stringify(invocationPath)};`,
    `const startedPath=${JSON.stringify(startedPath)};`,
    'fs.appendFileSync(invocationPath,"run\\n","utf8");',
    'fs.writeFileSync(startedPath,"started","utf8");',
    'setTimeout(()=>{',
    ' const logDir=path.join(process.cwd(),"ash","logs");',
    ' fs.mkdirSync(logDir,{recursive:true});',
    ' fs.writeFileSync(path.join(logDir,`ash-auto-dev-${runId}.json`),JSON.stringify({success:true,stopReason:"completed",controllerRunId:runId,evidenceSaved:true}),"utf8");',
    ' process.exit(0);',
    '},800);'
  ].join("\n"), "utf8");
  assert.strictEqual(spawnSync("git", ["add", ".gitignore", "fake-auto-dev.js"], { cwd: controllerFixture }).status, 0);
  assert.strictEqual(spawnSync("git", [
    "-c", "user.name=Ash Regression",
    "-c", "user.email=ash-regression@example.invalid",
    "commit", "--quiet", "-m", "fixture"
  ], { cwd: controllerFixture }).status, 0);
  assert.strictEqual(
    spawnSync("git", ["check-ignore", "ash/logs/controller-fixture.json"], {
      cwd: controllerFixture,
      encoding: "utf8"
    }).status,
    0,
    "The Controller fixture must reproduce the production runtime-log ignore contract."
  );

  const stopContractFixture = fs.mkdtempSync(path.join(os.tmpdir(), "ash-controller-stop-contract-"));
  assert.strictEqual(spawnSync("git", ["init", "--quiet"], { cwd: stopContractFixture }).status, 0);
  const stopContractLockPath = path.join(stopContractFixture, ".git", "ash-autonomous-supervisor.lock.json");
  const stopContractRequestPath = path.join(stopContractFixture, ".git", "ash-autonomous-supervisor.stop.json");
  fs.writeFileSync(stopContractLockPath, JSON.stringify({
    version: 1,
    repository: stopContractFixture,
    pid: process.pid,
    activeChildPid: null,
    ownerKind: "ash-controller",
    ownerToken: "stop-contract-owner",
    createdAt: new Date(Date.now() - 1000).toISOString(),
    updatedAt: new Date().toISOString()
  }), "utf8");
  const pendingStop = requestCooperativeStop({ projectRoot: stopContractFixture });
  const repeatedPendingStop = requestCooperativeStop({ projectRoot: stopContractFixture });
  assert.strictEqual(pendingStop.reason, "cooperative_stop_requested");
  assert.strictEqual(repeatedPendingStop.reason, "cooperative_stop_already_requested");
  fs.unlinkSync(stopContractRequestPath);
  const stopAfterConsumption = requestCooperativeStop({ projectRoot: stopContractFixture });
  assert.strictEqual(
    stopAfterConsumption.reason,
    "cooperative_stop_requested",
    "A verified live owner may safely receive a new request after consuming the prior request."
  );

  const controllerPath = path.join(process.cwd(), "ash-controller.js");
  const stopRequestPath = path.join(
    controllerFixture,
    ".git",
    "ash-autonomous-supervisor.stop.json"
  );
  fs.writeFileSync(stopRequestPath, JSON.stringify({
    version: 1,
    repository: controllerFixture,
    controllerPid: process.pid,
    ownerToken: "stale-owner-token",
    requestType: "graceful-stop",
    requestedAt: new Date(0).toISOString()
  }), "utf8");

  const headlessProcess = spawn(process.execPath, [controllerPath, "--auto"], {
    cwd: controllerFixture,
    env: {
      ...process.env,
      ASH_CONTROLLER_MODULE_ONLY: "0",
      ASH_CONTROLLER_PROJECT_ROOT: controllerFixture,
      ASH_CONTROLLER_AUTO_DEV_PATH: fakeAutoDev
    },
    stdio: ["pipe", "pipe", "pipe"],
    timeout: PROCESS_TIMEOUT_MS
  });
  let headlessOutput = "";
  headlessProcess.stdout.on("data", (chunk) => { headlessOutput += chunk; });
  headlessProcess.stderr.on("data", (chunk) => { headlessOutput += chunk; });
  headlessProcess.stdin.end();

  await new Promise((resolve, reject) => {
    const deadline = Date.now() + 2000;
    const poll = () => {
      if (fs.existsSync(startedPath)) return resolve();
      if (headlessProcess.exitCode != null) return reject(new Error(headlessOutput));
      if (Date.now() >= deadline) return reject(new Error("--auto did not start autonomously."));
      setTimeout(poll, 10);
    };
    poll();
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.strictEqual(headlessProcess.exitCode, null, "stdin EOF must not stop a headless Controller.");
  assert.strictEqual(
    fs.readFileSync(invocationPath, "utf8").trim().split(/\r?\n/).length,
    1,
    "--auto must start autonomous mode exactly once."
  );
  const firstStop = requestCooperativeStop({ projectRoot: controllerFixture });
  assert.strictEqual(firstStop.success, true);
  assert.strictEqual(firstStop.reason, "cooperative_stop_requested");
  const headlessExitCode = await waitForClose(headlessProcess, "Headless Controller");
  assert.strictEqual(headlessExitCode, 0, headlessOutput);
  assert.match(headlessOutput, /Graceful shutdown requested by cooperative-stop\./);
  assert.strictEqual(
    (headlessOutput.match(/Graceful shutdown requested by cooperative-stop\./g) || []).length,
    1,
    "Cooperative stop must execute the shutdown requester exactly once."
  );
  assert.strictEqual(fs.existsSync(stopRequestPath), false);
  assert.strictEqual(fs.existsSync(path.join(controllerFixture, ".git", "ash-autonomous-supervisor.lock.json")), false);
  assert.strictEqual(spawnSync("git", [
    "status", "--short"
  ], { cwd: controllerFixture, encoding: "utf8" }).stdout.trim(), "");
  if (fs.existsSync(startedPath)) fs.unlinkSync(startedPath);

  const idleHeadless = spawn(process.execPath, [controllerPath, "--auto"], {
    cwd: controllerFixture,
    env: {
      ...process.env,
      ASH_CONTROLLER_MODULE_ONLY: "0",
      ASH_CONTROLLER_PROJECT_ROOT: controllerFixture,
      ASH_CONTROLLER_AUTO_DEV_PATH: fakeAutoDev
    },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: PROCESS_TIMEOUT_MS
  });
  let idleOutput = "";
  idleHeadless.stdout.on("data", (chunk) => { idleOutput += chunk; });
  idleHeadless.stderr.on("data", (chunk) => { idleOutput += chunk; });
  await new Promise((resolve, reject) => {
    const deadline = Date.now() + 2000;
    const poll = () => {
      if (fs.existsSync(startedPath)) return resolve();
      if (idleHeadless.exitCode != null) return reject(new Error(idleOutput));
      if (Date.now() >= deadline) return reject(new Error("Idle Controller did not start."));
      setTimeout(poll, 10);
    };
    poll();
  });
  await new Promise((resolve) => setTimeout(resolve, 1000));
  assert.strictEqual(idleHeadless.exitCode, null, "Controller must remain alive in scheduled idle.");
  const stopCli = spawnSync(process.execPath, [controllerPath, "--stop"], {
    cwd: controllerFixture,
    env: {
      ...process.env,
      ASH_CONTROLLER_MODULE_ONLY: "0",
      ASH_CONTROLLER_PROJECT_ROOT: controllerFixture
    },
    encoding: "utf8",
    timeout: PROCESS_TIMEOUT_MS
  });
  assert.strictEqual(stopCli.status, 0, stopCli.stderr);
  assert.strictEqual(JSON.parse(stopCli.stdout).reason, "cooperative_stop_requested");
  const idleExitCode = await waitForClose(idleHeadless, "Idle headless Controller");
  assert.strictEqual(idleExitCode, 0, idleOutput);
  assert.match(idleOutput, /Graceful shutdown requested by cooperative-stop\./);
  assert.strictEqual(fs.existsSync(stopRequestPath), false);
  assert.strictEqual(fs.existsSync(path.join(controllerFixture, ".git", "ash-autonomous-supervisor.lock.json")), false);
  assert.strictEqual(spawnSync("git", [
    "status", "--short"
  ], { cwd: controllerFixture, encoding: "utf8" }).stdout.trim(), "");
  if (fs.existsSync(startedPath)) fs.unlinkSync(startedPath);

  const controllerProcess = spawn(process.execPath, [controllerPath], {
    cwd: controllerFixture,
    env: {
      ...process.env,
      ASH_CONTROLLER_MODULE_ONLY: "0",
      ASH_CONTROLLER_PROJECT_ROOT: controllerFixture,
      ASH_CONTROLLER_AUTO_DEV_PATH: fakeAutoDev
    },
    stdio: ["pipe", "pipe", "pipe"],
    timeout: PROCESS_TIMEOUT_MS
  });
  let controllerOutput = "";
  controllerProcess.stdout.on("data", (chunk) => { controllerOutput += chunk; });
  controllerProcess.stderr.on("data", (chunk) => { controllerOutput += chunk; });
  controllerProcess.stdin.write("auto\n");

  await new Promise((resolve, reject) => {
    const deadline = Date.now() + 2000;
    const poll = () => {
      if (fs.existsSync(startedPath)) return resolve();
      if (controllerProcess.exitCode != null) return reject(new Error(controllerOutput));
      if (Date.now() >= deadline) return reject(new Error("Controller child did not start."));
      setTimeout(poll, 10);
    };
    poll();
  });

  controllerProcess.stdin.write("exit\n");
  const gracefulExitCode = await waitForClose(controllerProcess, "Interactive Controller");
  assert.strictEqual(gracefulExitCode, 0, controllerOutput);
  const producedLogs = fs.readdirSync(path.join(controllerFixture, "ash", "logs"))
    .filter((file) => file.startsWith("ash-auto-dev-"));
  assert.strictEqual(producedLogs.length, 3);
  const producedResult = JSON.parse(fs.readFileSync(
    path.join(controllerFixture, "ash", "logs", producedLogs[producedLogs.length - 1]),
    "utf8"
  ));
  assert.strictEqual(producedResult.evidenceSaved, true);
  assert.match(controllerOutput, /Stop requested\. The current cycle will finish safely\./);
  assert.strictEqual(fs.existsSync(path.join(controllerFixture, ".git", "ash-autonomous-supervisor.lock.json")), false);

  fs.writeFileSync(path.join(controllerFixture, "dirty.txt"), "preserve me", "utf8");
  const dirtyController = spawn(process.execPath, [controllerPath], {
    cwd: controllerFixture,
    env: {
      ...process.env,
      ASH_CONTROLLER_MODULE_ONLY: "0",
      ASH_CONTROLLER_PROJECT_ROOT: controllerFixture,
      ASH_CONTROLLER_AUTO_DEV_PATH: fakeAutoDev
    },
    stdio: ["pipe", "pipe", "pipe"],
    timeout: PROCESS_TIMEOUT_MS
  });
  let dirtyOutput = "";
  dirtyController.stdout.on("data", (chunk) => { dirtyOutput += chunk; });
  dirtyController.stderr.on("data", (chunk) => { dirtyOutput += chunk; });
  dirtyController.stdin.write("auto\nexit\n");
  const dirtyExitCode = await waitForClose(dirtyController, "Dirty-repository Controller");
  assert.strictEqual(dirtyExitCode, 0, dirtyOutput);
  assert.match(dirtyOutput, /dirty_repository/);
  assert.strictEqual(
    fs.readFileSync(invocationPath, "utf8").trim().split(/\r?\n/).length,
    3,
    "Dirty startup must not spawn another autonomous child."
  );

  const noControllerStop = spawnSync(process.execPath, [controllerPath, "--stop"], {
    cwd: controllerFixture,
    env: {
      ...process.env,
      ASH_CONTROLLER_MODULE_ONLY: "0",
      ASH_CONTROLLER_PROJECT_ROOT: controllerFixture
    },
    encoding: "utf8",
    timeout: PROCESS_TIMEOUT_MS
  });
  assert.strictEqual(noControllerStop.status, 1);
  assert.strictEqual(JSON.parse(noControllerStop.stdout).reason, "no_active_controller");
  assert.doesNotMatch(
    requestCooperativeStop.toString(),
    /process\.kill|SIGTERM|SIGINT/,
    "Cooperative stop must not use process signals or process kill."
  );

  const evidenceRegression = spawnSync(process.execPath, [
    "./ash/runtime/verified-runtime-evidence-discovery-integration-regression-test.js"
  ], { cwd: process.cwd(), encoding: "utf8" });
  assert.strictEqual(
    evidenceRegression.status,
    0,
    `Verified runtime evidence discovery regressed: ${evidenceRegression.stderr}`
  );

  console.log(JSON.stringify({
    mode: "controller-lifecycle-regression-test",
    success: true,
    liveLockRejected: true,
    staleLockRecovered: true,
    dirtyRepositoryBlocked: true,
    runResultBoundToRunId: true,
    idleBackoff: true,
    transientBackoffBounded: true,
    gracefulStopScheduling: true,
    headlessAutoStart: true,
    stdinEofPreserved: true,
    signalShutdownIdempotent: true,
    cooperativeStop: true,
    staleStopIgnored: true,
    repeatedStopSafe: true,
    idleStopResponsive: true,
    verifiedRuntimeEvidenceDiscoveryPreserved: true
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
