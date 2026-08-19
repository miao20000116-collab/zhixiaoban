export type ScriptQAPair = {
  title?: string;
  question?: string;
  answer?: string;
  optimizedAnswer?: string;
  type?: string;
  why?: string;
  structure?: string;
  followUp?: string;
  priority?: string;
  source?: string;
  generating?: boolean;
};

export function normalizeScriptQA(raw: unknown): ScriptQAPair {
  const q = raw as Record<string, unknown>;
  const rawAnswer = String(q?.answer || "").trim();
  const rawStructure = String(q?.structure || "").trim();
  const structure = rawStructure || rawAnswer;
  // 从押题同步时可能只有框架；不要把框架误当作完整回答
  const answer = rawAnswer && rawAnswer !== structure ? rawAnswer : "";
  return {
    title: String(q?.title || ""),
    question: String(q?.question || ""),
    answer,
    optimizedAnswer: String(q?.optimizedAnswer || ""),
    type: String(q?.type || "逐字稿"),
    why: String(q?.why || ""),
    structure,
    followUp: String(q?.followUp || ""),
    priority: String(q?.priority || "中"),
    source: String(q?.source || "逐字稿"),
  };
}

export function parseScriptQaPairs(text?: string): ScriptQAPair[] {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeScriptQA).filter((q) => q.question || q.title || q.answer || q.structure);
  } catch {
    return [];
  }
}

export function priorityClass(priority: string) {
  if (priority === "高") return "bg-red-50 text-red-700 border-red-200";
  if (priority === "中") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-page-bg text-text-secondary border-border";
}

export function qaCardText(qa: ScriptQAPair): string {
  return `【${qa.type || "逐字稿"}｜优先级：${qa.priority || "中"}】${qa.title || ""}\n问题：${qa.question || ""}\n${qa.why ? `为什么会问：${qa.why}\n` : ""}${qa.structure ? `回答框架：\n${qa.structure}\n` : ""}${qa.followUp ? `可能追问：${qa.followUp}\n` : ""}${qa.answer ? `\n参考回答：\n${qa.answer}` : ""}${qa.optimizedAnswer ? `\n\n优化版：\n${qa.optimizedAnswer}` : ""}`;
}
