const { spawnSync } = require("child_process");

function runPowerShellStep(step) {
  const command = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    step.script,
    ...step.args,
  ];

  const result = spawnSync("powershell", command, {
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error(`Step failed: ${step.name}`);
  }
}

function executePlan(plan) {
  console.log("== Ash Executor Runtime ==");
  console.log(`Plan steps: ${plan.steps.length}`);

  for (const step of plan.steps) {
    console.log(`== Execute: ${step.name} ==`);

    if (step.type === "powershell") {
      runPowerShellStep(step);
    } else {
      throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  console.log("== Ash Executor Runtime complete ==");
}

module.exports = { executePlan };
