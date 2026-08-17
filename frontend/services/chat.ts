import { API_URL, jsonHeaders } from "./api";
import type { WorkflowStep } from "@/types";

export interface ChatStreamCallbacks {
  onToken: (content: string) => void;
  onDone: (messageId: string) => void;
  onError: (detail: string) => void;
  onIntent?: (intent: { intent: string; confidence: number; need_agent: string | null }) => void;
  onStep?: (step: WorkflowStep) => void;
  onMemoryUpdated?: (payload?: { count?: number; summary?: string; deduped?: boolean }) => void;
  onJobAnalysis?: (payload: Record<string, unknown>) => void;
  onResumeResult?: (payload: Record<string, unknown>) => void;
  onInterviewTurn?: (payload: Record<string, unknown>) => void;
  onInterviewReview?: (payload: Record<string, unknown>) => void;
  onNextAction?: (payload: Record<string, unknown>) => void;
  onConversationUpdated?: (payload: Record<string, unknown>) => void;
  onCareerGap?: (payload: Record<string, unknown>) => void;
  onTaskUpdated?: (payload: Record<string, unknown>) => void;
}

export async function streamChat(
  conversationId: string,
  message: string,
  callbacks: ChatStreamCallbacks,
): Promise<void> {
  const response = await fetch(`${API_URL}/chat`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ conversation_id: conversationId, message }),
  });

  if (!response.ok) {
    callbacks.onError(`请求失败: ${response.statusText}`);
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    callbacks.onError("无法读取响应流");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      if (!part.trim()) continue;

      let eventType = "message";
      let dataLine = "";

      for (const line of part.split("\n")) {
        if (line.startsWith("event: ")) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          dataLine = line.slice(6);
        }
      }

      if (!dataLine) continue;

      try {
        const data = JSON.parse(dataLine) as Record<string, unknown>;
        if (eventType === "token" && typeof data.content === "string") {
          callbacks.onToken(data.content);
        } else if (eventType === "done" && data.message_id) {
          callbacks.onDone(String(data.message_id));
        } else if (eventType === "step") {
          callbacks.onStep?.({
            id: String(data.id ?? `${Date.now()}`),
            agent: String(data.agent ?? "master"),
            agent_label: String(data.agent_label ?? data.agent ?? "Agent"),
            title: String(data.title ?? ""),
            detail: data.detail != null ? String(data.detail) : undefined,
            status: String(data.status ?? "running"),
            phase: data.phase != null ? String(data.phase) : undefined,
            ts: typeof data.ts === "number" ? data.ts : undefined,
          });
        } else if (eventType === "intent") {
          callbacks.onIntent?.({
            intent: String(data.intent ?? "general_chat"),
            confidence: Number(data.confidence ?? 0),
            need_agent: data.need_agent ? String(data.need_agent) : null,
          });
        } else if (eventType === "memory_updated") {
          callbacks.onMemoryUpdated?.({
            count: Number(data.count ?? 1),
            summary: data.summary != null ? String(data.summary) : undefined,
            deduped: Boolean(data.deduped),
          });
        } else if (eventType === "job_analysis") {
          callbacks.onJobAnalysis?.(data);
        } else if (eventType === "resume_result") {
          callbacks.onResumeResult?.(data);
        } else if (eventType === "interview_turn") {
          callbacks.onInterviewTurn?.(data);
        } else if (eventType === "interview_review") {
          callbacks.onInterviewReview?.(data);
        } else if (eventType === "next_action") {
          callbacks.onNextAction?.(data);
        } else if (eventType === "career_gap") {
          callbacks.onCareerGap?.(data);
        } else if (eventType === "task_updated") {
          callbacks.onTaskUpdated?.(data);
        } else if (eventType === "conversation_updated") {
          callbacks.onConversationUpdated?.(data);
        } else if (eventType === "error" && data.detail) {
          callbacks.onError(String(data.detail));
        }
      } catch {
        // ignore malformed chunks
      }
    }
  }
}
