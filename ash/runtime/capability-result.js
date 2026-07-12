"use strict";

function resolveSelectedTask(classificationContext = {}) {
  return (
    classificationContext?.generatedTask?.nextTask ||
    classificationContext?.nextTask ||
    classificationContext?.selectedTask ||
    null
  );
}

function isReportOnlyTask(task = null) {
  if (!task) {
    return false;
  }

  const work = Array.isArray(task.work)
    ? task.work
    : [];

  return (
    task.reportOnly === true ||
    work.includes("cleanup-review")
  );
}

function classifyCapabilityResult({
  action = "unknown",
  executableCapability = null,
  dispatchResult = null,
  classificationContext = {}
} = {}) {
  const innerResult = dispatchResult?.result?.result || dispatchResult?.result || dispatchResult;

  if (!dispatchResult) {
    return {
      mode: "capability-result-runtime",
      version: "ash-local-runtime-v0.1",
      action,
      executableCapability,
      success: false,
      classification: "missing_result",
      nextAction: "stop",
      reason: "No dispatch result was provided."
    };
  }

  if (dispatchResult.success === false) {
    return {
      mode: "capability-result-runtime",
      version: "ash-local-runtime-v0.1",
      action,
      executableCapability,
      success: false,
      classification: "dispatch_failed",
      nextAction: "stop",
      reason: dispatchResult.reason || "Dispatch failed."
    };
  }

  if (
    executableCapability === null &&
    dispatchResult?.route === "registered-executor"
  ) {
    const registeredResult = dispatchResult.result || {};
    const success = Boolean(registeredResult.success);

    return {
      mode: "capability-result-runtime",
      version: "ash-local-runtime-v0.2-registered-executor",
      action,
      executableCapability,
      success,
      classification: success
        ? "registered_executor_success"
        : "registered_executor_failed",
      nextAction: success ? "continue" : "stop",
      reason: success
        ? "Registered executor completed successfully."
        : registeredResult.reason || "Registered executor failed.",
      registeredAction: registeredResult.action || action,
      executor: registeredResult.executor || null
    };
  }

  if (executableCapability === "verify_patch") {
    if (innerResult?.fileChecksPassed === false) {
      return {
        mode: "capability-result-runtime",
        version: "ash-local-runtime-v0.1",
        action,
        executableCapability,
        success: false,
        classification: "verification_failed",
        nextAction: "repair_patch",
        reason: "Patch verification failed."
      };
    }

    if (innerResult?.diffCheckPassed === false && innerResult?.requireCleanDiff === true) {
      return {
        mode: "capability-result-runtime",
        version: "ash-local-runtime-v0.1",
        action,
        executableCapability,
        success: false,
        classification: "diff_check_failed",
        nextAction: "repair_patch",
        reason: "Diff check failed while clean diff was required."
      };
    }

    return {
      mode: "capability-result-runtime",
      version: "ash-local-runtime-v0.1",
      action,
      executableCapability,
      success: true,
      classification: "verification_passed",
      nextAction: "continue",
      reason: "Patch verification passed."
    };
  }

  if (executableCapability === "repair_patch") {
    const repairType = innerResult?.classification?.type || null;

    return {
      mode: "capability-result-runtime",
      version: "ash-local-runtime-v0.1",
      action,
      executableCapability,
      success: Boolean(innerResult?.success),
      classification: repairType || "repair_evaluated",
      nextAction: innerResult?.repaired ? "verify_patch" : "continue",
      reason: innerResult?.reason || "Repair result evaluated."
    };
  }

  if (executableCapability === "minimal_core_gate") {
    const required = innerResult?.required || {};
    const selectedTask =
      resolveSelectedTask(classificationContext);
    const reportOnly =
      isReportOnlyTask(selectedTask);

    if (reportOnly) {
      return {
        mode: "capability-result-runtime",
        version:
          "ash-local-runtime-v0.2-report-only-routing",
        action,
        executableCapability,
        success: true,
        classification:
          "report_only_task_complete",
        nextAction: "report_only",
        required,
        reportOnly: true,
        selectedTask,
        reason:
          "Report-only task completed without entering the development pipeline."
      };
    }

    if (selectedTask?.repairAction === "repair_patch") {
      return {
        mode: "capability-result-runtime",
        version:
          "ash-local-runtime-v0.3-repair-task-routing",
        action,
        executableCapability,
        success: true,
        classification:
          "repair_task_ready",
        nextAction: "repair_patch",
        required,
        reportOnly: false,
        selectedTask,
        reason:
          "Repair task requested direct repair_patch execution."
      };
    }

    return {
      mode: "capability-result-runtime",
      version:
        "ash-local-runtime-v0.2-report-only-routing",
      action,
      executableCapability,
      success: true,
      classification: innerResult?.triggered
        ? "core_gate_triggered"
        : "core_gate_clear",
      nextAction: innerResult?.triggered
        ? "corecheck_or_save_gate"
        : "run_development_pipeline",
      required,
      reportOnly: false,
      selectedTask,
      reason: innerResult?.triggered
        ? "Minimal Core Gate requires follow-up."
        : "Minimal Core Gate did not trigger."
    };
  }

  return {
    mode: "capability-result-runtime",
    version: "ash-local-runtime-v0.1",
    action,
    executableCapability,
    success: Boolean(innerResult?.success ?? dispatchResult?.success),
    classification: Boolean(innerResult?.success ?? dispatchResult?.success)
      ? "success"
      : "failed",
    nextAction: Boolean(innerResult?.success ?? dispatchResult?.success)
      ? "continue"
      : "stop",
    reason: innerResult?.reason || "Capability result classified."
  };
}

module.exports = {
  classifyCapabilityResult
};

