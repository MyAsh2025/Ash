"use strict";

function detectIntent(task = "") {
  const text = String(task || "").toLowerCase();

  if (/(inventory|inspect|investigate|調査|確認|棚卸し)/.test(text)) {
    return "investigation";
  }

  if (/(plan|planning|計画|設計)/.test(text)) {
    return "planning";
  }

  if (/(corecheck|core check)/.test(text)) {
    return "corecheck";
  }

  if (/(verify|verification|test|check|検証|テスト)/.test(text)) {
    return "verification";
  }

  if (/(git|commit|push|checkpoint)/.test(text)) {
    return "git";
  }

  if (/(handover|引継ぎ|引き継ぎ)/.test(text)) {
    return "handover";
  }

  if (/(resume|再開)/.test(text)) {
    return "resume";
  }

  if (/(self evolution|self-evolution|自己進化|pc ash)/.test(text)) {
    return "self_evolution";
  }

  if (/(implement|create|add|modify|fix|実装|作成|追加|修正)/.test(text)) {
    return "implementation";
  }

  return "planning";
}

function classifyIntent(task = "") {
  const intent = detectIntent(task);

  return {
    mode: "intent-runtime",
    version: "ash-local-runtime-v0.1",
    success: true,
    task,
    intent,
    route: intent,
    patchAllowed: intent === "implementation",
    reportOnly: ["investigation", "planning"].includes(intent),
    classifiedAt: new Date().toISOString()
  };
}

module.exports = {
  classifyIntent,
  detectIntent
};

