import { API_URL, ApiError, jsonHeaders } from "./api";
import type { Conversation, Message } from "@/types";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: jsonHeaders(options?.headers),
      ...options,
    });
  } catch {
    throw new ApiError("无法连接后端服务，请确认 API 已启动（通常为 http://localhost:8000）", 0);
  }

  if (!response.ok) {
    throw new ApiError(`API error: ${response.statusText}`, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function listConversations(): Promise<Conversation[]> {
  return request<Conversation[]>("/conversation");
}

export async function createConversation(title?: string): Promise<Conversation> {
  return request<Conversation>("/conversation", {
    method: "POST",
    body: JSON.stringify({ title: title ?? "新对话" }),
  });
}

export async function updateConversationTitle(id: string, title: string): Promise<Conversation> {
  return request<Conversation>(`/conversation/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export async function deleteConversation(id: string): Promise<void> {
  return request<void>(`/conversation/${id}`, { method: "DELETE" });
}

export async function listMessages(conversationId: string): Promise<Message[]> {
  return request<Message[]>(`/conversation/${conversationId}/messages`);
}
