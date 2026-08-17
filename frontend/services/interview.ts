import { API_URL, apiHeaders, jsonHeaders } from "./api";
import type { InterviewSessionResponse, InterviewQuestionsResponse } from "@/types";

export async function startInterview(payload: {
  conversation_id?: string;
  position?: string;
  jd_text?: string;
  resume_text?: string;
  mode?: "full" | "technical_interview";
}): Promise<InterviewSessionResponse> {
  const response = await fetch(`${API_URL}/interview/start`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error((await response.text()) || `开始面试失败: ${response.statusText}`);
  }
  return response.json() as Promise<InterviewSessionResponse>;
}

export async function answerInterview(
  sessionId: string,
  message: string,
): Promise<InterviewSessionResponse> {
  const response = await fetch(`${API_URL}/interview/${sessionId}/answer`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ message }),
  });
  if (!response.ok) {
    throw new Error((await response.text()) || `提交回答失败: ${response.statusText}`);
  }
  return response.json() as Promise<InterviewSessionResponse>;
}

export async function endInterview(sessionId: string): Promise<InterviewSessionResponse> {
  const response = await fetch(`${API_URL}/interview/${sessionId}/end`, {
    method: "POST",
    headers: apiHeaders(),
  });
  if (!response.ok) {
    throw new Error((await response.text()) || `结束面试失败: ${response.statusText}`);
  }
  return response.json() as Promise<InterviewSessionResponse>;
}

export async function getActiveInterview(
  conversationId?: string,
): Promise<InterviewSessionResponse | null> {
  const qs = conversationId ? `?conversation_id=${conversationId}` : "";
  const response = await fetch(`${API_URL}/interview/active${qs}`, {
    headers: apiHeaders(),
  });
  if (!response.ok) {
    throw new Error(`获取面试状态失败: ${response.statusText}`);
  }
  if (response.status === 204) return null;
  const data = await response.json();
  return data as InterviewSessionResponse | null;
}

export async function generateInterviewQuestions(payload: {
  position?: string;
  jd_text?: string;
  mode?: "full" | "technical_interview";
}): Promise<InterviewQuestionsResponse> {
  const response = await fetch(`${API_URL}/interview/questions`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error((await response.text()) || `生成题库失败: ${response.statusText}`);
  }
  return response.json() as Promise<InterviewQuestionsResponse>;
}
