"use strict";

const { resolveCapabilityForAction } = require("./capability-resolver");
const { executeRegisteredAction } = require("./executor-registry");
const { classifyAction } = require("./action-classification");
const {
  createCapabilityRegistry,
  runCapability
} = require("./capability-registry");
const { classifyCapabilityResult } = require("./capability-result");

function resolveExecutorPlanPolicy(context = {}) {
  const disabled = context.disableExecutorPlan === true;

  return {
    mode: "executor-plan-policy",
    version: "executor-plan-policy-v0.2-standard-route",
    enabled: !disabled,
    explicitOptIn: context.useExecutorPlan === true,
    defaultEnabled: context.defaultExecutorPlan === true,
    standardRoute: !disabled,
    disabled
  };
}

function shouldRouteThroughExecutorPlan(step = {}, context = {}) {
  const executorPlanPolicy = resolveExecutorPlanPolicy(context);

  return (
    executorPlanPolicy.enabled &&
    classifyAction(step.action).classification !== "executor-internal"
  );
}

function runExecutorPlanRoute(step = {}, context = {}) {
  const action = step.action || "unknown";
  const executorPlanResult = executeRegisteredAction(
    {
      action: "execute_plan",
      plan: {
        task: context.task || step.task || action,
        steps: [
          {
            ...step,
            stepId: step.stepId || `executor-plan-${action}`,
            context: {
              ...(step.context || {}),
              useExecutorPlan: false
            }
          }
        ]
      }
    },
    {
      ...context,
      useExecutorPlan: false
    }
  );

  const classification = classifyCapabilityResult({
    action,
    executableCapability: null,
    dispatchResult: {
      success: Boolean(executorPlanResult.success),
      route: "executor-plan",
      result: executorPlanResult
    }
  });

  return {
    mode: "capability-dispatcher-runtime",
    version: "ash-local-runtime-v0.4-executor-plan-opt-in",
    success: Boolean(executorPlanResult.success),
    action,
    capability: "executor_plan",
    executableCapability: null,
    dispatched: true,
    route: "executor-plan",
    classification,
    result: executorPlanResult,
    dispatchedAt: new Date().toISOString()
  };
}

function dispatchAction(step = {}, context = {}) {
  const action = step.action || "unknown";

  if (shouldRouteThroughExecutorPlan(step, context)) {
    return runExecutorPlanRoute(step, context);
  }

  const resolved = resolveCapabilityForAction(action);

  if (!resolved.executableCapability) {
    const registeredResult = executeRegisteredAction(step, context);

    if (!registeredResult?.skipped) {
      const classification = classifyCapabilityResult({
        action,
        executableCapability: null,
        dispatchResult: {
          success: Boolean(registeredResult.success),
          route: "registered-executor",
          result: registeredResult
        }
      });

      return {
        mode: "capability-dispatcher-runtime",
        version: "ash-local-runtime-v0.4-standard-route-fallback-observed",
        success: Boolean(registeredResult.success),
        action,
        capability: resolved.capability,
        executableCapability: null,
        dispatched: true,
        route: "registered-executor",
        fallback: {
          mode: "registered-executor-fallback",
          version: "registered-executor-fallback-v0.1-observed",
          action,
          reason: "Executor Plan was disabled or unavailable, so dispatcher used a registered executor fallback.",
          executorRegistered: true,
          observedAt: new Date().toISOString()
        },
        classification,
        result: registeredResult,
        dispatchedAt: new Date().toISOString()
      };
    }

    return {
      mode: "capability-dispatcher-runtime",
      version: "ash-local-runtime-v0.2-registered-fallback",
      success: false,
      action,
      capability: resolved.capability,
      executableCapability: null,
      dispatched: false,
      route: "unresolved",
      reason: "No executable capability or registered executor mapped for action."
    };
  }

  const registry = createCapabilityRegistry();

  const input = {
    ...context,
    ...step,
    action,
    capability: resolved.capability,
    executableCapability: resolved.executableCapability
  };

  const result = runCapability(
    registry,
    resolved.executableCapability,
    input
  );

  const classification = classifyCapabilityResult({
    action,
    executableCapability: resolved.executableCapability,
    dispatchResult: result
  });

  return {
    mode: "capability-dispatcher-runtime",
    version: "ash-local-runtime-v0.1",
    success: Boolean(result.success),
    action,
    capability: resolved.capability,
    executableCapability: resolved.executableCapability,
    dispatched: true,
    classification,
    result,
    dispatchedAt: new Date().toISOString()
  };
}

module.exports = {
  dispatchAction,
  resolveExecutorPlanPolicy,
  shouldRouteThroughExecutorPlan,
  runExecutorPlanRoute
};













