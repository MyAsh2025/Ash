"use strict";

const fs = require("fs");
const path = require("path");
const { runAutonomousDevelopmentManager } = require("./ash/runtime/autonomous-development-manager");

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

const maxCycles = Number(getArg("--cycles", "1"));
const requestedTask = getArg("--task", "run fully autonomous Ash development");
const dryRun = process.argv.includes("--dry-run");
const allowApply = process.argv.includes("--apply");

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


