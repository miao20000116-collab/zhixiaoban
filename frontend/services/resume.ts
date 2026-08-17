import { API_URL, ApiError, apiHeaders, jsonHeaders, readApiError } from "./api";
import type { ResumeTaskResponse, ResumeVersionListItem } from "@/types";

export async function optimizeResume(payload: {
  resume_text: string;
  target_position?: string;
  jd_text?: string;
  conversation_id?: string;
  sync_memory?: boolean;
}): Promise<ResumeTaskResponse> {
  const response = await fetch(`${API_URL}/resume/optimize`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await readApiError(response, `简历优化失败: ${response.statusText}`);
    throw new ApiError(err.message, response.status, err.code);
  }
  return response.json() as Promise<ResumeTaskResponse>;
}

export async function parseResumeUpload(
  file: File,
  options?: {
    conversation_id?: string;
    target_position?: string;
    jd_text?: string;
    optimize?: boolean;
  },
): Promise<ResumeTaskResponse> {
  const form = new FormData();
  form.append("file", file);
  if (options?.conversation_id) form.append("conversation_id", options.conversation_id);
  if (options?.target_position) form.append("target_position", options.target_position);
  if (options?.jd_text) form.append("jd_text", options.jd_text);
  if (options?.optimize) form.append("optimize", "true");

  const response = await fetch(`${API_URL}/resume/parse/upload`, {
    method: "POST",
    headers: apiHeaders(),
    body: form,
  });
  if (!response.ok) {
    const err = await readApiError(response, `简历上传失败: ${response.statusText}`);
    throw new ApiError(err.message, response.status, err.code);
  }
  return response.json() as Promise<ResumeTaskResponse>;
}

export async function listResumeVersions(limit = 20): Promise<ResumeVersionListItem[]> {
  const response = await fetch(`${API_URL}/resume/versions?limit=${limit}`, {
    headers: apiHeaders(),
  });
  if (!response.ok) {
    throw new Error(`加载简历版本失败: ${response.statusText}`);
  }
  return response.json() as Promise<ResumeVersionListItem[]>;
}
