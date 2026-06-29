"use strict";

function evaluateMinimalCoreGate(input = {}) {
  const signals = {
    conversationHeavy: Boolean(input.conversationHeavy),
    runtimeChanged: Boolean(input.runtimeChanged),
    capabilityChanged: Boolean(input.capabilityChanged),
    indexBroken: Boolean(input.indexBroken),
    rollbackDetected: Boolean(input.rollbackDetected),
    handoverCreated: Boolean(input.handoverCreated),
    gitDirty: Boolean(input.gitDirty),
    longConversationDriftRisk: Boolean(input.longConversationDriftRisk),
  };

  const triggered =
    signals.conversationHeavy ||
    signals.runtimeChanged ||
    signals.capabilityChanged ||
    signals.indexBroken ||
    signals.rollbackDetected ||
    signals.handoverCreated ||
    signals.gitDirty ||
    signals.longConversationDriftRisk;

  return {
    version: "minimal-core-gate-v0.1",
    triggered,
    signals,
    required: {
      coreCheckRequired: triggered,
      ashCoreSaveRequired: triggered,
      handoverRequired: triggered,
      nextChatCoreCheckRequired: triggered,
    },
  };
}

module.exports = {
  evaluateMinimalCoreGate,
};
