"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { runAutonomousDevelopmentManager } = require("./ash/runtime/autonomous-development-manager");
const { classifyIntent } = require("./ash/runtime/intent-runtime");
const { routeCommand } = require("./ash/runtime/command-router");

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

const maxCycles = Number(getArg("--cycles", "1"));
const requestedTask = getArg("--task", "run fully autonomous Ash development");
const dryRun = process.argv.includes("--dry-run");
const allowApply = process.argv.includes("--apply");

const intentResult = classifyIntent(requestedTask);
const commandRoute = routeCommand(intentResult);

if (intentResult.intent === "corecheck") {
  const { runCoreCheck } = require("./ash/runtime/corecheck-runtime");

  const coreCheck = runCoreCheck({
    files: [
      "./ash-auto-dev.js",
      "./ash/runtime/intent-runtime.js",
      "./ash/runtime/autonomous-development-manager.js",
      "./ash/runtime/development-pipeline-runtime.js",
      "./ash/runtime/capability-loop.js",
      "./ash/capabilities/development-pipeline.js"
    ]
  });

  console.log(JSON.stringify({
    mode: "ash-auto-dev-runner",
    route: commandRoute.route,
    commandRoute,
    success: coreCheck.success,
    requestedTask,
    intent: intentResult.intent,
    patchAllowed: false,
    applied: false,
    coreCheck,
    note: "CoreCheck route completed without patch planning.",
    ranAt: new Date().toISOString()
  }, null, 2));

  process.exit(coreCheck.success ? 0 : 1);
}

if (intentResult.reportOnly && !/repository inventory only/i.test(requestedTask)) {
  console.log(JSON.stringify({
    mode: "ash-auto-dev-runner",
    route: commandRoute.route,
    commandRoute,
    success: true,
    requestedTask,
    intent: intentResult.intent,
    patchAllowed: false,
    applied: false,
    reportOnly: true,
    note: "Intent Runtime stopped before patch planning.",
    ranAt: new Date().toISOString()
  }, null, 2));
  process.exit(0);
}

function classifyRepositoryEntry(line) {
  const file = line.slice(3).trim();
  const status = line.slice(0, 2).trim();

  let classification = "necessary";
  let recommendation = "KEEP";

  if (
    file.includes(".backup") ||
    file.includes(".broken") ||
    file.includes(".sandbox") ||
    file.endsWith(".diff.txt")
  ) {
    classification = "temporary";
    recommendation = "ARCHIVE";
  } else if (
    file.includes("handover-") ||
    file.includes("save-drafts") ||
    file.includes("runtime-state")
  ) {
    classification = "temporary";
    recommendation = "REVIEW";
  } else if (
    file.includes("ash-ui-server.js") ||
    file.includes("ash-window.ps1") ||
    file.includes("repository-manager.js") ||
    file.includes("agent-selector.js") ||
    file.includes("code-generator.js") ||
    file.includes("patch-apply-engine.js") ||
    file.includes("patch-planner.js") ||
    file.includes("task-runtime.js")
  ) {
    classification = "self-evolution";
    recommendation = "REVIEW_FOR_COMMIT";
  }

  return {
    status,
    file,
    classification,
    recommendation
  };
}

if (/repository inventory only/i.test(requestedTask)) {
  const statusShort = execFileSync("git", ["status", "--short"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  const entries = statusShort
    .split(/\r?\n/)
    .filter(Boolean)
    .map(classifyRepositoryEntry);

  const report = {
    mode: "ash-auto-dev-runner",
    route: "repository-inventory-only",
    success: true,
    requestedTask,
    modifiedOrUntrackedCount: entries.length,
    entries,
    note: "Inventory route completed without patch planning or file modification.",
    ranAt: new Date().toISOString()
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const result = runAutonomousDevelopmentManager({
  task: requestedTask,
  context: {
    projectPath: process.cwd(),
    dryRun: dryRun || !allowApply
  },
  maxCycles,
  dryRun: dryRun || !allowApply
});

const logDir = path.join(process.cwd(), "ash", "logs");
fs.mkdirSync(logDir, { recursive: true });

const logPath = path.join(
  logDir,
  `ash-auto-dev-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
);

fs.writeFileSync(logPath, JSON.stringify(result, null, 2), "utf8");

const firstCycle = result.cycles?.[0] || null;
const pipelineStep = firstCycle?.capabilityLoop?.steps?.find((step) => step.action === "development_pipeline");
const pipeline = pipelineStep?.dispatchResult?.result?.result || null;

console.log(JSON.stringify({
  mode: "ash-auto-dev-runner",
  success: result.success,
  stopReason: result.stopReason,
  cycles: result.cycles?.length || 0,
  requestedTask,
  selectedTask: firstCycle?.selectedTask || null,
  capabilityLoop: firstCycle?.capabilityLoop?.success || null,
  pipelineSuccess: pipeline?.success || null,
  applyMode: pipeline?.applyMode || null,
  effectiveDryRun: pipeline?.effectiveDryRun,
  applied: pipeline?.patchApplyEngine?.applied || false,
  coreCheck: firstCycle?.coreCheck?.success || null,
  checkpointRecommended: firstCycle?.coreCheck?.checkpointRecommended || false,
  logPath
}, null, 2));

if (!result.success) {
  process.exit(1);
}






