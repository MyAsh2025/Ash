const path = require("path");
const { spawnSync } = require("child_process");
const { resolveProject } = require("./project-context");
const { runAction } = require("../actions/action-runtime");
const { resolveDependencies } = require("./dependency-resolver");

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

  return {
    ...result,
    originalAction: actionName,
    stepId: step.stepId || null,
    taskId: step.taskId || null,
    manager: step.manager || null,
    phase: step.phase || null,
    priority: step.priority ?? null,
    required: Boolean(step.required),
    dependencies: step.dependencies || []
  };
}

function normalizeSteps(plan = {}) {
  if (Array.isArray(plan.steps)) {
    return plan.steps;
  }

  if (Array.isArray(plan.executionPlan?.steps)) {
    return plan.executionPlan.steps.map((step) => ({
      type: "action",
      ...step
    }));
  }

  return [];
}

function executePlan(plan, context = {}) {
  const executionContext = resolveExecutionContext(plan, context);
  const normalizedSteps = normalizeSteps(plan);
  let dependencyResolution = resolveDependencies(
    { steps: normalizedSteps },
    context.executionResults || []
  );
  const steps = dependencyResolution.readySteps;

  console.log("== Ash Executor Runtime ==");
  console.log(`Project: ${executionContext.project.id || "unknown"}`);
  console.log(`Project path: ${executionContext.projectPath}`);
  console.log(`Plan steps: ${normalizedSteps.length}`);
  console.log(`Ready steps: ${steps.length}`);
  console.log(`Blocked steps: ${dependencyResolution.blockedSteps.length}`);

  const results = [...(context.executionResults || [])];
  const executedStepIds = new Set(results.map((result) => result.stepId).filter(Boolean));
  const loopHistory = [];
  let iteration = 0;

  while (true) {
    iteration += 1;

    const currentResolution = resolveDependencies(
      { steps: normalizedSteps.filter((step) => !executedStepIds.has(step.stepId)) },
      results
    );

    const readySteps = currentResolution.readySteps.filter(
      (step) => !executedStepIds.has(step.stepId)
    );

    loopHistory.push({
      iteration,
      ready: readySteps.map((step) => step.action),
      blocked: currentResolution.blockedSteps.map((step) => step.action),
      completed: results
        .filter((result) => result.success)
        .map((result) => result.originalAction || result.action),
      evaluatedAt: new Date().toISOString()
    });

    if (readySteps.length === 0) {
      dependencyResolution = currentResolution;
      break;
    }

    for (const step of readySteps) {
      console.log(`== Execute: ${step.name || step.action || step.type} ==`);

      if (step.type === "powershell") {
        const result = runPowerShellStep(step, executionContext);
        results.push(result);
        if (result.stepId) executedStepIds.add(result.stepId);
        continue;
      }

      if (step.type === "action" || step.action) {
        const result = runActionStep(step, executionContext);
        results.push(result);
        if (result.stepId) executedStepIds.add(result.stepId);
        continue;
      }

      throw new Error(`Unknown step type: ${step.type}`);
    }

    if (iteration > normalizedSteps.length + 1) {
      throw new Error("Execution loop exceeded safe iteration limit.");
    }
  }

  console.log("== Ash Executor Runtime complete ==");

  return {
    mode: "executor-runtime",
    version: "ash-local-runtime-v0.6-execution-loop",
    success: dependencyResolution.blockedSteps.length === 0,
    task: executionContext.task,
    projectContext: executionContext.projectContext,
    dependencyResolution,
    loopHistory,
    results,
    executedAt: new Date().toISOString()
  };
}

module.exports = { executePlan, resolveExecutionContext, normalizeSteps };





