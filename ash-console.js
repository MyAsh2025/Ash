"use strict";

const { spawnSync } = require("child_process");

function runAsh() {
  const result = spawnSync("node", [".\\ash-auto-dev.js", "--cycles", "1", "--dry-run"], {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: true
  });

  try {
    return JSON.parse(result.stdout);
  } catch {
    return {
      success: false,
      error: result.stderr || result.stdout || "Unknown Ash output"
    };
  }
}

function draw(state, cycle) {
  console.clear();

  console.log("╔════════════════════════════════════════════╗");
  console.log("║                ASH AI OS                  ║");
  console.log("╚════════════════════════════════════════════╝");
  console.log("");
  console.log(`Status     : ${state.success ? "RUNNING" : "ERROR"}`);
  console.log(`Cycle      : ${cycle}`);
  console.log(`Mode       : Autonomous Development`);
  console.log(`Apply      : DRY-RUN SAFE MODE`);
  console.log("");
  console.log("Current Task");
  console.log("------------");
  console.log(state.selectedTask?.task || "(none)");
  console.log("");
  console.log("Target File");
  console.log("-----------");
  console.log(state.selectedTask?.file || "(none)");
  console.log("");
  console.log("Pipeline");
  console.log("--------");
  console.log(`[${state.capabilityLoop ? "✓" : " "}] Capability Loop`);
  console.log(`[${state.pipelineSuccess ? "✓" : " "}] Development Pipeline`);
  console.log(`[${state.coreCheck ? "✓" : " "}] CoreCheck`);
  console.log(`[${state.applied ? "✓" : " "}] Applied`);
  console.log("");
  console.log(`Stop Reason : ${state.stopReason || "(none)"}`);
  console.log(`Log         : ${state.logPath || "(none)"}`);
  console.log("");
  console.log("Press Ctrl+C to stop Ash.");
}

let cycle = 0;

while (true) {
  cycle += 1;
  const state = runAsh();
  draw(state, cycle);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10000);
}
