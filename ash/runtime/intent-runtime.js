"use strict";

function detectIntent(task = "") {
  const text = String(task || "").toLowerCase();

  if (/^\s*implementation\b/i.test(task) || /(implementation|implement|create|add|modify|fix|実装|作成|追加|修正)/.test(text)) {
    return "implementation";
  }

  if (/^\s*resume\b/i.test(task) || /^(resume|再開)\b/i.test(String(task || "").trim())) {
    return "resume";
  }

  if (/(self evolution|self-evolution|自己進化|pc ash)/.test(text)) {
    return "self_evolution";
  }

  if (/(corecheck|core check)/.test(text)) {
    return "corecheck";
  }

  if (/(git|commit|push|checkpoint|保存)/.test(text)) {
    return "git";
  }

  if (/(verify|verification|test|検証|テスト)/.test(text)) {
    return "verification";
  }

  if (/(handover|引継ぎ|引き継ぎ)/.test(text)) {
    return "handover";
  }

  if (/(inventory|inspect|investigate|check|調査|確認|棚卸し)/.test(text)) {
    return "investigation";
  }

  if (/(plan|planning|計画|設計)/.test(text)) {
    return "planning";
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

