import { API_URL, ApiError, jsonHeaders } from "./api";

export interface DashboardMetrics {
  period_days: number;
  agent_success_rate: number;
  total_agent_runs: number;
  success_runs: number;
  error_runs: number;
  evaluation_count: number;
  hallucination_rate: number;
  high_risk_count: number;
  medium_risk_count: number;
  avg_evaluation_score: number;
  user_score_proxy: number;
  bad_case_open: number;
  bad_case_total: number;
  agent_stats: Array<{
    agent_name: string;
    evaluations: number;
    avg_score: number;
    high_risk: number;
    hallucination_rate: number;
  }>;
  active_prompts: Array<{
    id: string;
    agent_name: string;
    version: string;
    status: string;
    created_at?: string | null;
  }>;
}

export interface EvaluationRecord {
  id: string;
  agent_name: string;
  task_type: string;
  score?: number | null;
  risk_level: string;
  feedback?: Record<string, unknown> | null;
  trace_id?: string | null;
  created_at: string;
}

export interface BadCase {
  id: string;
  agent_name: string;
  problem_type: string;
  description: string;
  solution?: string | null;
  status: string;
  evaluation_record_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PromptTemplate {
  id: string;
  agent_name: string;
  version: string;
  status: string;
  created_at: string;
  content_preview?: string | null;
  content?: string | null;
}

export interface PromptDetail {
  id: string;
  agent_name: string;
  version: string;
  status: string;
  created_at: string;
  content: string;
}

export interface DatasetInfo {
  id: string;
  name: string;
  description: string;
  case_count: number;
}

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

export async function fetchDashboard(days = 30): Promise<DashboardMetrics> {
  return request(`/evaluation/dashboard?days=${days}`);
}

export async function fetchEvaluationRecords(limit = 30): Promise<EvaluationRecord[]> {
  return request(`/evaluation/records?limit=${limit}`);
}

export async function fetchBadCases(status?: string): Promise<BadCase[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return request(`/evaluation/bad-cases${qs}`);
}

export async function updateBadCase(
  id: string,
  body: { status?: string; solution?: string },
): Promise<BadCase> {
  return request(`/evaluation/bad-cases/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function fetchPrompts(full = true): Promise<PromptTemplate[]> {
  const qs = full ? "?full=true" : "";
  return request(`/evaluation/prompts${qs}`);
}

export async function fetchPromptDetail(id: string): Promise<PromptDetail> {
  return request(`/evaluation/prompts/${id}`);
}

export async function seedPrompts(): Promise<{ seeded: number }> {
  return request("/evaluation/prompts/seed", { method: "POST" });
}

export async function activatePrompt(id: string): Promise<PromptTemplate> {
  return request(`/evaluation/prompts/${id}/activate`, { method: "POST" });
}

export async function fetchDatasets(): Promise<DatasetInfo[]> {
  return request("/evaluation/datasets");
}

export async function runDataset(
  id: string,
  limit?: number,
): Promise<{
  dataset_id: string;
  name: string;
  total: number;
  passed: number;
  failed: number;
  pass_rate: number;
  results: Array<Record<string, unknown>>;
}> {
  return request(`/evaluation/datasets/${id}/run`, {
    method: "POST",
    body: JSON.stringify({ limit: limit ?? null }),
  });
}
