"use client";

import { useCallback, useEffect, useState } from "react";

import { streamChat } from "@/services/chat";
import { listMessages } from "@/services/conversations";
import type { Message, NextActionSuggestion, WorkflowStep } from "@/types";

const STAGE_LABELS: Record<string, string> = {
  START: "开始",
  SELF_INTRO: "自我介绍",
  PROJECT_DEEP_DIVE: "项目深挖",
  BUSINESS: "业务问题",
  TECHNICAL: "技术问题",
  REVERSE_QA: "反问",
  END: "结束",
};

export function useChat(
  conversationId: string | null,
  onMemoryUpdated?: (payload?: { count?: number; summary?: string; deduped?: boolean }) => void,
  onConversationUpdated?: (payload: {
    id: string;
    title?: string;
    summary?: string | null;
  }) => void,
  onTaskUpdated?: (task: import("@/types").CareerTask) => void,
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentIntent, setCurrentIntent] = useState<string | null>(null);
  const [interviewStage, setInterviewStage] = useState<string | null>(null);
  const [interviewMode, setInterviewMode] = useState<string | null>(null);
  const [nextAction, setNextAction] = useState<NextActionSuggestion | null>(null);

  const loadMessages = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    setStreamingContent("");
    try {
      const data = await listMessages(id);
      setMessages(data.filter((m) => m.role !== "system"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载消息失败");
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /** Reload after file upload / external API — keep current upload steps, drop interview leftovers. */
  const reloadAfterExternal = useCallback(
    async (id: string) => {
      setInterviewStage(null);
      setInterviewMode(null);
      setNextAction(null);
      setStreamingContent("");
      await loadMessages(id);
    },
    [loadMessages],
  );

  const beginUploadTask = useCallback((kind: "resume" | "jd") => {
    const now = Date.now();
    const isResume = kind === "resume";
    setCurrentIntent(isResume ? "resume" : "jd_analysis");
    setInterviewStage(null);
    setInterviewMode(null);
    setWorkflowSteps([
      {
        id: `upload-route-${now}`,
        agent: "master",
        agent_label: "Master Agent",
        title: isResume ? "识别为简历上传" : "识别为 JD 上传",
        detail: "走文件解析入口，不延续模拟面试回合",
        status: "done",
        phase: "route",
        ts: now / 1000,
      },
      {
        id: `upload-run-${now}`,
        agent: isResume ? "resume" : "job",
        agent_label: isResume ? "Resume Agent" : "JD Analysis Agent",
        title: isResume ? "解析简历并写入画像" : "分析岗位 JD",
        detail: isResume
          ? "Resume Agent 正在提取经历 / 项目 / 技能…"
          : "Job Agent → Evaluation → Career Gap…",
        status: "running",
        phase: "run",
        ts: now / 1000,
      },
    ]);
  }, []);

  const finishUploadTask = useCallback((ok: boolean) => {
    setWorkflowSteps((prev) =>
      prev.map((s) =>
        s.status === "running"
          ? {
              ...s,
              status: ok ? ("done" as const) : ("error" as const),
              title: ok ? `完成：${s.title}` : `失败：${s.title}`,
            }
          : s,
      ),
    );
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (conversationId) {
        void loadMessages(conversationId);
        setInterviewStage(null);
        setInterviewMode(null);
        setNextAction(null);
        setWorkflowSteps([]);
        setCurrentIntent(null);
      } else {
        setMessages([]);
        setStreamingContent("");
        setInterviewStage(null);
        setInterviewMode(null);
        setNextAction(null);
        setWorkflowSteps([]);
        setCurrentIntent(null);
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [conversationId, loadMessages]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!conversationId || isStreaming) return;

      const trimmed = content.trim();
      if (!trimmed) return;

      setError(null);
      setIsStreaming(true);
      setStreamingContent("");
      setWorkflowSteps([]);
      setCurrentIntent(null);

      const tempUserMessage: Message = {
        id: `temp-${Date.now()}`,
        conversation_id: conversationId,
        role: "user",
        content: trimmed,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUserMessage]);

      let accumulated = "";

      await streamChat(conversationId, trimmed, {
        onToken: (token) => {
          accumulated += token;
          setStreamingContent(accumulated);
        },
        onStep: (step) => {
          setWorkflowSteps((prev) => {
            const byId = prev.findIndex((s) => s.id === step.id);
            if (byId >= 0) {
              const next = [...prev];
              next[byId] = step;
              return next;
            }
            // Heartbeats / same-agent running updates replace in place
            if (step.status === "running") {
              for (let i = prev.length - 1; i >= 0; i -= 1) {
                if (prev[i].agent === step.agent && prev[i].status === "running") {
                  const next = [...prev];
                  next[i] = step;
                  return next;
                }
              }
            }
            const next = prev.map((s) =>
              s.status === "running" ? { ...s, status: "done" as const } : s,
            );
            return [...next, step];
          });
        },
        onIntent: (intent) => {
          setCurrentIntent(intent.intent);
        },
        onInterviewTurn: (payload) => {
          const stage = payload.stage ? String(payload.stage) : null;
          const mode = payload.mode ? String(payload.mode) : null;
          setInterviewStage(stage);
          setInterviewMode(mode);
          if (stage === "END" || payload.status === "completed") {
            setInterviewStage("END");
          }
        },
        onInterviewReview: () => {
          setInterviewStage("END");
        },
        onNextAction: (payload) => {
          const sources = Array.isArray(payload.sources)
            ? (payload.sources as NextActionSuggestion["sources"])
            : undefined;
          const actions = Array.isArray(payload.actions)
            ? (payload.actions as NextActionSuggestion["actions"])
            : undefined;
          const plan = Array.isArray(payload.plan)
            ? (payload.plan as NextActionSuggestion["plan"])
            : undefined;
          setNextAction({
            trigger: payload.trigger ? String(payload.trigger) : undefined,
            title: payload.title ? String(payload.title) : undefined,
            message: payload.message ? String(payload.message) : undefined,
            why: payload.why ? String(payload.why) : undefined,
            priority: payload.priority ? String(payload.priority) : undefined,
            goal: payload.goal ? String(payload.goal) : undefined,
            sources,
            actions,
            plan,
          });
        },
        onConversationUpdated: (payload) => {
          onConversationUpdated?.({
            id: String(payload.id),
            title: payload.title ? String(payload.title) : undefined,
            summary: payload.summary != null ? String(payload.summary) : null,
          });
        },
        onTaskUpdated: (payload) => {
          onTaskUpdated?.(payload as unknown as import("@/types").CareerTask);
        },
        onCareerGap: () => {
          onMemoryUpdated?.();
        },
        onMemoryUpdated: (payload) => {
          onMemoryUpdated?.(payload);
        },
        onDone: async () => {
          setStreamingContent("");
          setIsStreaming(false);
          setWorkflowSteps((prev) =>
            prev.map((s) => (s.status === "running" ? { ...s, status: "done" as const } : s)),
          );
          await loadMessages(conversationId);
        },
        onError: (detail) => {
          setError(detail);
          setStreamingContent("");
          setIsStreaming(false);
          setWorkflowSteps((prev) =>
            prev.map((s) =>
              s.status === "running" ? { ...s, status: "error" as const } : s,
            ),
          );
        },
      });
    },
    [conversationId, isStreaming, loadMessages, onMemoryUpdated, onConversationUpdated, onTaskUpdated],
  );

  const interviewStageLabel = interviewStage
    ? STAGE_LABELS[interviewStage] || interviewStage
    : null;

  return {
    messages,
    streamingContent,
    workflowSteps,
    isLoading,
    isStreaming,
    error,
    currentIntent,
    interviewStage,
    interviewStageLabel,
    interviewMode,
    nextAction,
    clearNextAction: () => setNextAction(null),
    sendMessage,
    reload: loadMessages,
    reloadAfterExternal,
    beginUploadTask,
    finishUploadTask,
  };
}
