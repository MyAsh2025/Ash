function buildPlan(intent, task) {
  const steps = [];

  if (intent.requiresCoreCheck) {
    steps.push({
      type: "powershell",
      name: "corecheck",
      script: ".\\scripts\\runtime-corecheck.ps1",
      args: [
        "-Intent", task || intent.primary,
        "-RuntimeChange",
      ],
    });
  }

  if (intent.requiresCheckpoint) {
    steps.push({
      type: "powershell",
      name: "checkpoint",
      script: ".\\scripts\\runtime-checkpoint.ps1",
      args: [
        "-CommitMessage", `Ash runtime checkpoint: ${task || intent.primary}`,
        "-ExpectedAuditKey", "sectionMergeValidationRuntime",
      ],
    });
  }

  return {
    mode: "planning-runtime",
    version: "ash-local-runtime-v0.1",
    intent,
    steps,
  };
}

module.exports = { buildPlan };
