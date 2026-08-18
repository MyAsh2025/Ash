"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

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
  installGracefulSignalHandlers
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
  installGracefulSignalHandlers
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
], { cwd: process.cwd(), stdio: ["ignore", "pipe", "inherit"] });

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

  await new Promise((resolve) => holder.once("close", resolve));

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
    '},350);'
  ].join("\n"), "utf8");
  assert.strictEqual(spawnSync("git", ["add", "fake-auto-dev.js"], { cwd: controllerFixture }).status, 0);
  assert.strictEqual(spawnSync("git", [
    "-c", "user.name=Ash Regression",
    "-c", "user.email=ash-regression@example.invalid",
    "commit", "--quiet", "-m", "fixture"
  ], { cwd: controllerFixture }).status, 0);

  const controllerPath = path.join(process.cwd(), "ash-controller.js");
  const headlessProcess = spawn(process.execPath, [controllerPath, "--auto"], {
    cwd: controllerFixture,
    env: {
      ...process.env,
      ASH_CONTROLLER_MODULE_ONLY: "0",
      ASH_CONTROLLER_PROJECT_ROOT: controllerFixture,
      ASH_CONTROLLER_AUTO_DEV_PATH: fakeAutoDev
    },
    stdio: ["pipe", "pipe", "pipe"]
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
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.strictEqual(headlessProcess.exitCode, null, "stdin EOF must not stop a headless Controller.");
  assert.strictEqual(
    fs.readFileSync(invocationPath, "utf8").trim().split(/\r?\n/).length,
    1,
    "--auto must start autonomous mode exactly once."
  );
  headlessProcess.kill();
  await new Promise((resolve) => headlessProcess.once("close", resolve));
  assert.strictEqual(spawnSync("git", ["add", "-A"], { cwd: controllerFixture }).status, 0);
  assert.strictEqual(spawnSync("git", [
    "-c", "user.name=Ash Regression",
    "-c", "user.email=ash-regression@example.invalid",
    "commit", "--quiet", "-m", "headless result fixture"
  ], { cwd: controllerFixture }).status, 0);
  if (fs.existsSync(startedPath)) fs.unlinkSync(startedPath);

  const controllerProcess = spawn(process.execPath, [controllerPath], {
    cwd: controllerFixture,
    env: {
      ...process.env,
      ASH_CONTROLLER_MODULE_ONLY: "0",
      ASH_CONTROLLER_PROJECT_ROOT: controllerFixture,
      ASH_CONTROLLER_AUTO_DEV_PATH: fakeAutoDev
    },
    stdio: ["pipe", "pipe", "pipe"]
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
  const gracefulExitCode = await new Promise((resolve) => controllerProcess.once("close", resolve));
  assert.strictEqual(gracefulExitCode, 0, controllerOutput);
  const producedLogs = fs.readdirSync(path.join(controllerFixture, "ash", "logs"))
    .filter((file) => file.startsWith("ash-auto-dev-"));
  assert.strictEqual(producedLogs.length, 2);
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
    stdio: ["pipe", "pipe", "pipe"]
  });
  let dirtyOutput = "";
  dirtyController.stdout.on("data", (chunk) => { dirtyOutput += chunk; });
  dirtyController.stderr.on("data", (chunk) => { dirtyOutput += chunk; });
  dirtyController.stdin.write("auto\nexit\n");
  const dirtyExitCode = await new Promise((resolve) => dirtyController.once("close", resolve));
  assert.strictEqual(dirtyExitCode, 0, dirtyOutput);
  assert.match(dirtyOutput, /dirty_repository/);
  assert.strictEqual(
    fs.readFileSync(invocationPath, "utf8").trim().split(/\r?\n/).length,
    2,
    "Dirty startup must not spawn another autonomous child."
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
    verifiedRuntimeEvidenceDiscoveryPreserved: true
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
