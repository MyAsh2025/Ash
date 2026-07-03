"use strict";

const { buildTargetLocator } = require("./target-locator");
const { buildEditPlanner } = require("./edit-planner");

function buildPatchTargetRuntime({
  patchPlanner = null
} = {}) {
  const targetLocator = buildTargetLocator({
    patchPlanner
  });

  const editPlanner = buildEditPlanner({
    patchPlanner,
    targetLocator
  });

  return {
    mode: "patch-target-runtime",
    version: "ash-local-runtime-v0.1",
    success: Boolean(targetLocator.located && editPlanner.planReady),
    patchPlanner,
    targetLocator,
    editPlanner,
    readyForPatchGeneration: Boolean(editPlanner.planReady),
    builtAt: new Date().toISOString()
  };
}

module.exports = {
  buildPatchTargetRuntime
};
