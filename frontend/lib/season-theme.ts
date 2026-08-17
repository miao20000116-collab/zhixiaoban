export type Season = "spring" | "summer" | "autumn" | "winter";

export const SEASONS: { id: Season; label: string; hint: string }[] = [
  { id: "spring", label: "春", hint: "新芽与轻声开始" },
  { id: "summer", label: "夏", hint: "明亮而从容" },
  { id: "autumn", label: "秋", hint: "沉淀与温柔确认" },
  { id: "winter", label: "冬", hint: "安静地蓄力" },
];

export const SEASON_STORAGE_KEY = "ai-career.season.v1";

/** Calm / grounding lines for job seekers — rotate every few minutes. */
export const CALM_QUOTES = [
  "先把目标岗位说清楚，再决定下一步。",
  "一次只推进一件事：JD、简历或面试。",
  "没有真实经历就先标记约束，不要硬写。",
  "被拒可以复盘，把短板变成下一次练习题。",
  "先补一段可验证事实，画像才会真正可用。",
  "匹配分只是线索，证据才是可信的依据。",
  "卡住了就说卡在哪一步，我们拆开做。",
  "今天只要比昨天更清楚一点，就已经够了。",
  "虚构履历会被拦下——这是保护，不是刁难。",
  "语音面试：直接说即可，停顿后自动进入下一问。",
];

export function defaultSeasonByMonth(date = new Date()): Season {
  const m = date.getMonth() + 1;
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "summer";
  if (m >= 9 && m <= 11) return "autumn";
  return "winter";
}

export function isSeason(value: string | null | undefined): value is Season {
  return value === "spring" || value === "summer" || value === "autumn" || value === "winter";
}
