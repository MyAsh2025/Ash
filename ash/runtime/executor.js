const path = require("path");
const { spawnSync } = require("child_process");
const { resolveProject } = require("./project-context");
const { runAction } = require("../actions/action-runtime");

function resolveExecutionContext(plan = {}, context = {}) {
  const task =
    context.task ||
    plan.task ||
    plan.intent ||
    plan.name ||
    "ash executor runtime";

  const projectContext =
    context.projectContext ||
    plan.projectContext ||
    resolveProject(task);

  const project = projectContext.project || {};
  const projectPath = project.path || process.cwd();

  return {
    ...context,
    task,
    projectContext,
    project,
    projectPath
  };
}

function resolveScriptPath(step, executionContext) {
  const projectPath = executionContext.projectPath || process.cwd();
  const script = step.script || "";

  if (path.isAbsolute(script)) {
    return script;
  }

  return path.join(projectPath, script);
}

function runPowerShellStep(step, executionContext) {
  const scriptPath = resolveScriptPath(step, executionContext);
  const cwd = step.cwd || executionContext.projectPath || process.cwd();

  const command = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    ...(step.args || []),
  ];

  const result = spawnSync("powershell", command, {
    cwd,
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error(`Step failed: ${step.name || scriptPath}`);
  }

  return {
    step: step.name || scriptPath,
    type: "powershell",
    cwd,
    script: scriptPath,
    status: result.status,
    success: true,
    executedAt: new Date().toISOString()
  };
}

function runActionStep(step, executionContext) {
  const actionName = step.action || step.name;

  if (!actionName) {
    throw new Error("Action step is missing action/name.");
  }

  const result = runAction(actionName, {
    ...executionContext,
    task: executionContext.task
  });

  if (!result.success) {
    throw new Error(`Action failed: ${actionName}`);
  }

  return result;
}

function executePlan(plan, context = {}) {
  const executionContext = resolveExecutionContext(plan, context);
  const steps = Array.isArray(plan.steps) ? plan.steps : [];

  console.log("== Ash Executor Runtime ==");
  console.log(`Project: ${executionContext.project.id || "unknown"}`);
  console.log(`Project path: ${executionContext.projectPath}`);
  console.log(`Plan steps: ${steps.length}`);

  const results = [];

  for (const step of steps) {
    console.log(`== Execute: ${step.name || step.action || step.type} ==`);

    if (step.type === "powershell") {
      results.push(runPowerShellStep(step, executionContext));
      continue;
    }

    if (step.type === "action" || step.action) {
      results.push(runActionStep(step, executionContext));
      continue;
    }

    throw new Error(`Unknown step type: ${step.type}`);
  }

  console.log("== Ash Executor Runtime complete ==");

  return {
    mode: "executor-runtime",
    version: "ash-local-runtime-v0.2-project-context",
    success: true,
    task: executionContext.task,
    projectContext: executionContext.projectContext,
    results,
    executedAt: new Date().toISOString()
  };
}

module.exports = { executePlan, resolveExecutionContext };
