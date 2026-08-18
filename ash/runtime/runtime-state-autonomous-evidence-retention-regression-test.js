"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  getLatestRuntimeStatePath,
  writeRuntimeState
} = require("./runtime-state");

const projectPath = fs.mkdtempSync(
  path.join(os.tmpdir(), "ash-runtime-state-retention-")
);
const statePath = getLatestRuntimeStatePath(projectPath);
fs.mkdirSync(path.dirname(statePath), { recursive: true });
const autonomousDevelopment = {
  mode: "autonomous-development-completion-state",
  version: "fixture",
  completedTasks: [{ identity: "completed-task" }],
  runtimeEvidence: [
    { recordKind: "terminal-failure", unresolved: true },
    { recordKind: "formal-completion" }
  ]
};
fs.writeFileSync(
  statePath,
  JSON.stringify({
    mode: "persistent-runtime-state",
    latestRuntime: { task: "old ordinary runtime" },
    autonomousDevelopment,
    obsoleteTopLevelState: true
  }, null, 2),
  "utf8"
);

const previousCwd = process.cwd();
try {
  process.chdir(projectPath);
  writeRuntimeState({
    task: "new ordinary runtime",
    projectContext: {
      project: { id: "fixture-project", path: projectPath }
    },
    saveVerification: { saveCompleted: true },
    shutdownRuntime: { shutdownCompleted: true }
  }, { projectPath });
} finally {
  process.chdir(previousCwd);
}

const saved = JSON.parse(fs.readFileSync(statePath, "utf8"));
assert.deepStrictEqual(
  saved.autonomousDevelopment.completedTasks,
  autonomousDevelopment.completedTasks
);
assert.deepStrictEqual(
  saved.autonomousDevelopment.runtimeEvidence,
  autonomousDevelopment.runtimeEvidence
);
assert.strictEqual(
  saved.autonomousDevelopment.runtimeEvidence.some(
    (record) => record.recordKind === "formal-completion"
  ),
  true
);
assert.strictEqual(
  saved.autonomousDevelopment.runtimeEvidence.some(
    (record) => record.recordKind === "terminal-failure" && record.unresolved === true
  ),
  true
);
assert.strictEqual(saved.latestRuntime.task, "new ordinary runtime");
assert.strictEqual(saved.latestRuntime.project, "fixture-project");
assert.strictEqual(saved.latestRuntime.saveCompleted, true);
assert.strictEqual(saved.latestRuntime.shutdownCompleted, true);
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(saved, "obsoleteTopLevelState"),
  false
);

const malformedPath = getLatestRuntimeStatePath(
  fs.mkdtempSync(path.join(os.tmpdir(), "ash-runtime-state-malformed-"))
);
fs.mkdirSync(path.dirname(malformedPath), { recursive: true });
const malformed = "{ malformed runtime state";
fs.writeFileSync(malformedPath, malformed, "utf8");
const malformedRoot = path.resolve(path.dirname(malformedPath), "../..");
assert.throws(
  () => writeRuntimeState(
    { task: "must-not-overwrite" },
    { projectPath: malformedRoot }
  ),
  /JSON/
);
assert.strictEqual(fs.readFileSync(malformedPath, "utf8"), malformed);

console.log(JSON.stringify({
  mode: "runtime-state-autonomous-evidence-retention-regression-test",
  success: true,
  completedTasksPreserved: true,
  runtimeEvidencePreserved: true,
  ordinaryRuntimeUpdated: true,
  obsoleteOrdinaryStateDropped: true,
  malformedStatePreserved: true
}, null, 2));
