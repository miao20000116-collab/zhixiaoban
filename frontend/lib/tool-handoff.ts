/** Cross-tool handoff (JD 定向优化 → 面试押题等) */

export const PREDICT_HANDOFF_KEY = "zhixiaoban_predict_handoff";

export type PredictHandoffPayload = {
  resumeText?: string;
  jdText?: string;
  company?: string;
  position?: string;
  source?: string;
  createdAt: number;
};

export function savePredictHandoff(payload: Omit<PredictHandoffPayload, "createdAt">) {
  if (typeof window === "undefined") return;
  const data: PredictHandoffPayload = { ...payload, createdAt: Date.now() };
  sessionStorage.setItem(PREDICT_HANDOFF_KEY, JSON.stringify(data));
}

export function consumePredictHandoff(): PredictHandoffPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PREDICT_HANDOFF_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PREDICT_HANDOFF_KEY);
    return JSON.parse(raw) as PredictHandoffPayload;
  } catch {
    return null;
  }
}
