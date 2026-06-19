function observeConversation(input = "") {
  const text = String(input || "").toLowerCase();

  const signals = [];

  if (text.includes("corecheck")) signals.push("corecheck");
  if (text.includes("runtime")) signals.push("runtime-change");
  if (text.includes("architecture") || text.includes("設計")) signals.push("architecture-change");
  if (text.includes("save") || text.includes("保存")) signals.push("save-required");
  if (text.includes("handover") || text.includes("引継ぎ")) signals.push("handover-required");
  if (text.includes("patch") || text.includes("修正") || text.includes("実装")) signals.push("development-task");
  if (text.includes("market") || text.includes("市場") || text.includes("競合")) signals.push("market-observation");
  if (text.includes("finance") || text.includes("財務") || text.includes("売上") || text.includes("利益")) signals.push("finance-observation");

  return {
    type: "conversation",
    input,
    signals,
    observedAt: new Date().toISOString()
  };
}

module.exports = { observeConversation };
