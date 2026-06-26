const fs = require("fs");
const path = require("path");

const { observeConversation } = require("./sensors/conversation");
const { observeRepository } = require("./sensors/repository");
const { mergeObservations } = require("./runtime/observation");
const { classifyIntent } = require("./runtime/intent");
const { makeDecision } = require("./runtime/decision");
const { applyPolicy } = require("./runtime/policy");
const { makeExecutiveDecision } = require("./runtime/executive");
const { applyGovernance } = require("./runtime/governance");
const { buildPlan } = require("./runtime/planner");
const { buildWorkflow } = require("./runtime/workflow");
const { coordinateManagers } = require("./runtime/coordinator");
const { buildTasksFromCoordinator } = require("./runtime/task-runtime");
const { selectAgents } = require("./runtime/agent-selector");
const { runAgentBus } = require("./runtime/agent-bus");
const { resolveProject } = require("./runtime/project-context");
const { evaluateConversationHealth } = require("./runtime/conversation-health");
const { writeHandover } = require("./runtime/handover");
const { executePlan } = require("./runtime/executor");

function getArgValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function main() {
  const task = getArgValue("--task", "general ash runtime task");
  const dryRun = process.argv.includes("--dry-run");

  console.log("== Ash Local Runtime v0.1 ==");
  console.log(`Task: ${task}`);
  console.log(`DryRun: ${dryRun}`);

  const projectContext = resolveProject(task);
  const conversation = observeConversation(task);
  const repository = observeRepository();
  const observation = mergeObservations({ conversation, repository });
  const decision = makeDecision(observation);
  const policy = applyPolicy(observation, decision);
  const executive = makeExecutiveDecision({ observation, policy, repository });
  const governance = applyGovernance({ observation, policy, executive });
  const intent = classifyIntent(observation, decision, policy);
  const plan = buildPlan(intent, task);
  const workflow = buildWorkflow({ governance, plan });
  const coordinator = coordinateManagers({ task, intent, workflow, repository });
  const taskRuntime = buildTasksFromCoordinator({ task, coordinator, intent, workflow });
  const agentSelection = selectAgents({ task, intent, workflow, coordinator, taskRuntime });
  const logDir = path.join(process.cwd(), "ash", "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const logCount = fs.readdirSync(logDir).filter((name) => name.endsWith(".json")).length;

  const agentBus = workflow.autoExecutable
    ? runAgentBus(agentSelection, { task, projectContext })
    : {
        mode: "agent-bus-runtime",
        version: "ash-local-runtime-v0.1",
        executedAgents: [],
        skippedAgents: agentSelection.selectedAgents || [],
        results: [],
        blocked: true,
        reason: workflow.message,
        completedAt: new Date().toISOString()
      };

  const conversationHealth = evaluateConversationHealth({
    observation,
    repository,
    runtimeResult: { logCount }
  });

  const handover = conversationHealth.shouldPrepareHandover
    ? writeHandover({
        task,
        observation,
        repository,
        decision,
        policy,
        executive,
        governance,
        workflow,
        agentSelection,
        agentBus,
        conversationHealth
      })
    : null;

  const runtimeResult = {
    mode: "ash-local-runtime",
    version: "v0.1",
    task,
    dryRun,
    projectContext,
    conversation,
    repository,
    observation,
    decision,
    policy,
    executive,
    governance,
    intent,
    plan,
    workflow,
    coordinator,
    taskRuntime,
    agentSelection,
    agentBus,
    conversationHealth,
    handover,
    createdAt: new Date().toISOString(),
  };

  const logPath = path.join(
    logDir,
    `ash-runtime-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );

  fs.writeFileSync(logPath, JSON.stringify(runtimeResult, null, 2), "utf8");

  console.log("== Project Context ==");
  console.log(JSON.stringify(projectContext, null, 2));

  console.log("== Observation ==");
  console.log(JSON.stringify(observation, null, 2));

  console.log("== Repository ==");
  console.log(JSON.stringify(repository, null, 2));

  console.log("== Decision ==");
  console.log(JSON.stringify(decision, null, 2));

  console.log("== Policy ==");
  console.log(JSON.stringify(policy, null, 2));

  console.log("== Executive ==");
  console.log(JSON.stringify(executive, null, 2));

  console.log("== Governance ==");
  console.log(JSON.stringify(governance, null, 2));

  console.log("== Intent ==");
  console.log(JSON.stringify(intent, null, 2));

  console.log("== Plan ==");
  console.log(JSON.stringify(plan, null, 2));

  console.log("== Workflow ==");
  console.log(JSON.stringify(workflow, null, 2));

  console.log("== Coordinator ==");
  console.log(JSON.stringify(coordinator, null, 2));

  console.log("== Task Runtime ==");
  console.log(JSON.stringify(taskRuntime, null, 2));

  console.log("== Agent Selection ==");
  console.log(JSON.stringify(agentSelection, null, 2));

  console.log("== Agent Bus ==");
  console.log(JSON.stringify(agentBus, null, 2));

  console.log("== Conversation Health ==");
  console.log(JSON.stringify(conversationHealth, null, 2));

  if (handover) {
    console.log("== Handover Prepared ==");
    console.log(JSON.stringify({ path: handover.path, prepared: handover.prepared }, null, 2));
  }

  console.log(`Log: ${logPath}`);

  if (!dryRun) {
    if (workflow.autoExecutable) {
      executePlan({
        ...plan,
        steps: workflow.executableSteps
      });
    } else {
      console.log("== Execution blocked by Governance ==");
      console.log(workflow.message);
    }
  }

  console.log("== Ash Local Runtime complete ==");
}

main();



