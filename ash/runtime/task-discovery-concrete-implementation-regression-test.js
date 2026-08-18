"use strict";

const assert = require("assert");
const {
  buildConcreteImplementationPlanningTask,
  isConcreteImplementationPlanningSatisfied,
  discoverTaskFromRepository
} = require("./task-discovery-runtime");

const task = buildConcreteImplementationPlanningTask();
const executableCodeTemplate =
  "function buildConcreteImplementationPlanningTask() { return {}; }";
let providerInput = null;
let validatedImplementation = null;

const result = task.generateExecutableImplementation({
  resolveTargetSymbol: () => task.targetSymbol,
  getSymbolType: (targetSymbol) => {
    assert.strictEqual(targetSymbol, task.targetSymbol);
    return "function";
  },
  getExpectedBehavior: (targetSymbol) => {
    assert.strictEqual(targetSymbol, task.targetSymbol);
    return task.expectedBehavior;
  },
  getImplementationProvider: () => ({
    generateImplementation: (planningMetadata) => {
      providerInput = planningMetadata;
      return {
        executableCodeTemplate,
        implementationTemplate: "verified-template",
        confidence: "verified",
        reason: ["Verified implementation generated."]
      };
    }
  }),
  validatePatch: (implementation) => {
    validatedImplementation = implementation;
    return true;
  }
});

assert.strictEqual(result, task, "Generation must update and return the planning task.");
assert.deepStrictEqual(providerInput, {
  targetSymbol: task.targetSymbol,
  symbolType: "function",
  expectedBehavior: task.expectedBehavior,
  strategy: task.strategy,
  recommendedOperation: task.recommendedOperation
});
assert.ok(validatedImplementation, "Generated implementation must be validated.");
assert.strictEqual(
  task.implementationTemplate.executableCodeTemplate,
  executableCodeTemplate
);
assert.strictEqual(
  task.implementationTemplate.implementationTemplate,
  "verified-template"
);
assert.strictEqual(task.implementationTemplate.confidence, "verified");

const completedPlanningTask =
  buildConcreteImplementationPlanningTask();

assert.strictEqual(
  isConcreteImplementationPlanningSatisfied(completedPlanningTask),
  true,
  "A concrete planning task with a verified executable-generation function must not be rediscovered as incomplete."
);

const completedPlanningDiscovery =
  discoverTaskFromRepository({
    observation: {
      nextTask: null,
      repositoryHealth: {
        attentionReasons: []
      }
    }
  });

assert.strictEqual(completedPlanningDiscovery.discovered, false);
assert.strictEqual(completedPlanningDiscovery.task, null);

assert.throws(
  () => buildConcreteImplementationPlanningTask()
    .generateExecutableImplementation({
      resolveTargetSymbol: () => task.targetSymbol,
      getSymbolType: () => "function",
      getExpectedBehavior: () => task.expectedBehavior,
      getImplementationProvider: () => null,
      validatePatch: () => true
    }),
  /No implementation provider configured/
);

assert.throws(
  () => buildConcreteImplementationPlanningTask()
    .generateExecutableImplementation({
      resolveTargetSymbol: () => task.targetSymbol,
      getSymbolType: () => "function",
      getExpectedBehavior: () => task.expectedBehavior,
      getImplementationProvider: () => ({
        generateImplementation: () => ({ executableCodeTemplate })
      }),
      validatePatch: () => false
    }),
  /failed patch validation/
);

console.log(JSON.stringify({
  mode: "task-discovery-concrete-implementation-regression-test",
  success: true,
  targetSymbol: task.targetSymbol,
  providerDelegated: providerInput !== null,
  patchValidated: validatedImplementation !== null,
  executableTemplateStored:
    task.implementationTemplate.executableCodeTemplate ===
    executableCodeTemplate,
  completedPlanningSuppressed:
    completedPlanningDiscovery.discovered === false
}, null, 2));
