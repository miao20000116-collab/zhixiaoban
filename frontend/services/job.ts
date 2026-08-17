import { API_URL, ApiError, apiHeaders, jsonHeaders, readApiError } from "./api";
import type { JobAnalyzeResponse, JobAnalysisListItem } from "@/types";

export async function analyzeJob(payload: {
  jd_text?: string;
  position?: string;
  company?: string;
  conversation_id?: string;
}): Promise<JobAnalyzeResponse> {
  const response = await fetch(`${API_URL}/job/analyze`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await readApiError(response, `分析失败: ${response.statusText}`);
    throw new ApiError(err.message, response.status, err.code);
  }
  return response.json() as Promise<JobAnalyzeResponse>;
}

export async function analyzeJobUpload(
  file: File,
  options?: { conversation_id?: string; position?: string; company?: string },
): Promise<JobAnalyzeResponse> {
  const form = new FormData();
  form.append("file", file);
  if (options?.conversation_id) form.append("conversation_id", options.conversation_id);
  if (options?.position) form.append("position", options.position);
  if (options?.company) form.append("company", options.company);

  const response = await fetch(`${API_URL}/job/analyze/upload`, {
    method: "POST",
    headers: apiHeaders(),
    body: form,
  });
  if (!response.ok) {
    const err = await readApiError(response, `文件分析失败: ${response.statusText}`);
    throw new ApiError(err.message, response.status, err.code);
  }
  return response.json() as Promise<JobAnalyzeResponse>;
}

export async function listJobAnalyses(limit = 20): Promise<JobAnalysisListItem[]> {
  const response = await fetch(`${API_URL}/job/analyses?limit=${limit}`, {
    headers: apiHeaders(),
  });
  if (!response.ok) {
    throw new Error(`加载分析历史失败: ${response.statusText}`);
  }
  return response.json() as Promise<JobAnalysisListItem[]>;
}
