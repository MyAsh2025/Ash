const {
  shouldAttemptAutoHandover,
  runAutoHandover,
  rebuildPreconditionStateAfterHandover
} = require("../runtime/executor");

const enforcementDecision = {
  shouldBlock: true,
  diagnostic: {
    missing: ["handoverPrepared"]
  }
};

const context = {
  autoHandover: true,
  corePreconditions: {
    handoverPrepared: false
  }
};

const shouldAttempt = shouldAttemptAutoHandover(enforcementDecision, context);

const fakeAutoHandoverResult = {
  success: true
};

const rebuilt = rebuildPreconditionStateAfterHandover(
  context,
  {
    guardedActions: [
      {
        action: "handover",
        requiredRules: ["coreCheckBeforeHandover"]
      }
    ]
  },
  fakeAutoHandoverResult
);

const result = {
  mode: "executor-self-repair-smoke-test",
  shouldAttempt,
  handoverPrepared:
    rebuilt.corePreconditions.handoverPrepared === true &&
    rebuilt.context.handoverResult.prepared === true &&
    rebuilt.context.saveVerificationResult.verification.handoverPrepared === true,
  exportedRunAutoHandover: typeof runAutoHandover === "function"
};

console.log(JSON.stringify(result, null, 2));

if (
  result.shouldAttempt !== true ||
  result.handoverPrepared !== true ||
  result.exportedRunAutoHandover !== true
) {
  process.exit(1);
}

