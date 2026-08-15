"use strict";

const assert = require("assert");

const {
  evaluateDestructiveReplace,
  extractLocalDeclarationNames
} = require("./patch-validator");

const original = `
function target() {
  const alpha = 1;
  const beta = 2;
  const gamma = 3;
  const delta = 4;
  const epsilon = 5;
  const zeta = 6;
  const eta = 7;
  const theta = 8;
  const iota = 9;
  const kappa = 10;

  if (alpha) {
    return { beta, gamma, delta, epsilon, zeta };
  }

  return { eta, theta, iota, kappa };
}
`;

const behaviorRemovingReplacement = `
function target() {
  const alpha = 1;
  const beta = 2;
  const gamma = 3;

  return { alpha, beta, gamma };
}
`;

assert.deepStrictEqual(
  extractLocalDeclarationNames(original),
  ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa", "target"],
  "Local declaration extraction is a directly verified part of contract-retention analysis."
);

const destructive =
  evaluateDestructiveReplace({
    operation: "replace",
    anchorPattern: original,
    generatedCode:
      behaviorRemovingReplacement
  });

assert.strictEqual(
  destructive.checked,
  true
);

assert.strictEqual(
  destructive.destructive,
  true,
  "Substantial verified local behavior loss must be rejected."
);

assert.strictEqual(
  destructive.severeLocalContractLoss,
  true
);

const legitimateShorterRefactor = `
function target() {
  const alpha = 1;
  const beta = 2;
  const gamma = 3;
  const delta = 4;
  const epsilon = 5;
  const zeta = 6;
  const eta = 7;
  const theta = 8;
  const iota = 9;
  const kappa = 10;

  return {
    alpha, beta, gamma, delta, epsilon,
    zeta, eta, theta, iota, kappa
  };
}
`;

const legitimate =
  evaluateDestructiveReplace({
    operation: "replace",
    anchorPattern: original,
    generatedCode:
      legitimateShorterRefactor
  });

assert.strictEqual(
  legitimate.destructive,
  false,
  "Shorter contract-preserving refactor must remain allowed."
);

assert.strictEqual(
  legitimate.severeLocalContractLoss,
  false
);

console.log(
  JSON.stringify(
    {
      success: true,
      destructiveBehaviorLossRejected:
        destructive.destructive,
      legitimateShorterRefactorAccepted:
        !legitimate.destructive,
      destructiveMetrics:
        destructive,
      legitimateMetrics:
        legitimate
    },
    null,
    2
  )
);
