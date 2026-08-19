"use client";

const CURRENT_MODEL_KEY = "ai_current_model";
const TASK_MODEL_MAP_KEY = "ai_task_model_map";

export const AI_MODELS = [
  { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash（简历优化推荐）", desc: "简历优化专用，效果优秀" },
  { id: "zhipu-glm4-flash", name: "智谱 GLM-4-Flash（免费）", desc: "日常优先，速度快" },
  { id: "siliconflow-deepseek", name: "硅基流动 DeepSeek-R1", desc: "复杂推理，深度分析" },
  { id: "doubao", name: "火山引擎豆包 Lite（速度快）", desc: "推荐优先使用，速度快" },
] as const;

export const TASK_LABELS: Record<string, string> = {
  resume: "简历优化",
  jd: "JD解析",
  predict: "面试押题",
  script: "逐字稿生成",
  research: "行业调研",
  score: "答题打分",
  transcribe: "语音转写",
  builder: "经历采集",
};

export const DEFAULT_TASK_MODELS: Record<string, string> = {
  resume: "deepseek-v4-flash",
  jd: "deepseek-v4-flash",
  predict: "deepseek-v4-flash",
  script: "zhipu-glm4-flash",
  research: "deepseek-v4-flash",
  score: "siliconflow-deepseek",
  transcribe: "siliconflow-deepseek",
  builder: "deepseek-v4-flash",
};

export function getCurrentModel(): string {
  if (typeof window === "undefined") return "deepseek-v4-flash";
  return localStorage.getItem(CURRENT_MODEL_KEY) || "deepseek-v4-flash";
}

export function setCurrentModel(model: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CURRENT_MODEL_KEY, model);
}

export function getTaskModelMap(): Record<string, string> {
  if (typeof window === "undefined") return { ...DEFAULT_TASK_MODELS };
  try {
    const raw = localStorage.getItem(TASK_MODEL_MAP_KEY);
    if (!raw) return { ...DEFAULT_TASK_MODELS };
    return { ...DEFAULT_TASK_MODELS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_TASK_MODELS };
  }
}

export function setTaskModel(task: string, model: string) {
  if (typeof window === "undefined") return;
  const map = getTaskModelMap();
  if (model) map[task] = model;
  else delete map[task];
  localStorage.setItem(TASK_MODEL_MAP_KEY, JSON.stringify(map));
}

export function getModelForTask(task: string): string {
  const map = getTaskModelMap();
  return map[task] || getCurrentModel();
}
