import { API_URL, ApiError, jsonHeaders } from "./api";
import type { CareerGapResult, CareerTask } from "@/types";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: jsonHeaders(options?.headers),
    ...options,
  });

  if (!response.ok) {
    throw new ApiError(`API error: ${response.statusText}`, response.status);
  }

  return response.json() as Promise<T>;
}

export async function getLatestGap(): Promise<{ gap: CareerGapResult | null }> {
  return request("/career/gap");
}

export async function analyzeGap(body: {
  target_position?: string;
  company?: string;
  target_jd?: string;
}): Promise<{ gap: CareerGapResult; markdown: string }> {
  return request("/career/gap/analyze", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getActiveTask(conversationId?: string | null): Promise<{
  task: CareerTask | null;
}> {
  const q = conversationId ? `?conversation_id=${conversationId}` : "";
  return request(`/career/tasks/active${q}`);
}

export async function getIntelligenceSnapshot(): Promise<{
  latest_gap: CareerGapResult | null;
  active_task: CareerTask | null;
  career_status: Record<string, unknown>;
}> {
  return request("/career/intelligence");
}
