export type Season = "spring" | "summer" | "autumn" | "winter";

export const SEASONS: { id: Season; label: string; hint: string }[] = [
  { id: "spring", label: "春", hint: "新芽与轻声开始" },
  { id: "summer", label: "夏", hint: "明亮而从容" },
  { id: "autumn", label: "秋", hint: "沉淀与温柔确认" },
  { id: "winter", label: "冬", hint: "安静地蓄力" },
];

export const SEASON_STORAGE_KEY = "ai-career.season.v1";

/** 顶部舒缓文案：求职励志 / 安抚心情，定时轮换 */
export const CALM_QUOTES = [
  "慢一点没关系，把下一步想清楚就很好。",
  "你已经在行动了，这比完美的计划更重要。",
  "求职不是考试，是找到彼此合适的过程。",
  "今天只要比昨天更清楚一点，就已经够了。",
  "卡住了也没关系，我们拆开一步一步来。",
  "每一次准备，都是在给未来的自己铺路。",
  "先照顾好呼吸，再谈简历和面试。",
  "被拒不是否定你，只是这次还没对上。",
  "你值得被认真看见，从一段真实经历开始。",
  "不必一次做完所有事，先完成眼前这一小步。",
  "合适的机会会来，你现在要做的是准备好。",
  "紧张是正常的，说明你在乎这件事。",
  "把焦虑换成清单：今天只推进一件事。",
  "你的故事里，有比你想象中更多的力量。",
  "休息也是进度，养足精神再出发。",
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
