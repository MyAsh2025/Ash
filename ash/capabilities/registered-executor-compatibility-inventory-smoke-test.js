"use strict";

const { registry } = require("../runtime/executor-registry");
const { resolveCapabilityForAction } = require("../runtime/capability-resolver");

const actions = Object.keys(registry).sort();

const rows = actions.map((action) => {
  const resolved = resolveCapabilityForAction(action);
  const hasExecutableCapability = Boolean(resolved.executableCapability);

  return {
    action,
    capability: resolved.capability || "unknown",
    executableCapability: resolved.executableCapability || null,
    routeClass: hasExecutableCapability
      ? "capability-route"
      : "registered-executor-compatibility",
    shouldPreferExecutorPlan: true
  };
});

const summary = {
  mode: "registered-executor-compatibility-inventory",
  success: true,
  totalRegisteredExecutors: rows.length,
  capabilityRouteCount: rows.filter((row) => row.routeClass === "capability-route").length,
  compatibilityRouteCount: rows.filter((row) => row.routeClass === "registered-executor-compatibility").length,
  compatibilityActions: rows
    .filter((row) => row.routeClass === "registered-executor-compatibility")
    .map((row) => row.action),
  rows
};

console.log(JSON.stringify(summary, null, 2));

if (summary.totalRegisteredExecutors < 1) {
  process.exitCode = 1;
}
