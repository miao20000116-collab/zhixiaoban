"use client";

import { useCallback, useEffect, useState } from "react";

import {
  createConversation,
  deleteConversation,
  listConversations,
  updateConversationTitle,
} from "@/services/conversations";
import type { Conversation } from "@/types";

const ACTIVE_CONVERSATION_KEY = "ai-career.active-conversation.v1";

function readStoredActiveId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(ACTIVE_CONVERSATION_KEY);
  } catch {
    return null;
  }
}

function persistActiveId(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) localStorage.setItem(ACTIVE_CONVERSATION_KEY, id);
    else localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
  } catch {
    // ignore
  }
}

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let data = await listConversations();

      // Keep a single empty placeholder "新对话"; remove the rest.
      const empties = data.filter((c) => c.title === "新对话");
      if (empties.length > 1) {
        const sorted = [...empties].sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        );
        const keepId = sorted[0]!.id;
        await Promise.all(
          sorted.slice(1).map((c) => deleteConversation(c.id).catch(() => undefined)),
        );
        data = data.filter((c) => c.title !== "新对话" || c.id === keepId);
      }

      // Do not auto-create on first visit — wait for「新建对话」.
      setConversations(data);
      setActiveId((current) => {
        const stored = readStoredActiveId();
        const preferred = stored || current;
        if (preferred && data.some((c) => c.id === preferred)) {
          persistActiveId(preferred);
          return preferred;
        }
        const next = data[0]?.id ?? null;
        persistActiveId(next);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载对话失败");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(id);
  }, [refresh]);

  const create = useCallback(async () => {
    const conversation = await createConversation();
    setConversations((prev) => [conversation, ...prev]);
    persistActiveId(conversation.id);
    setActiveId(conversation.id);
    return conversation;
  }, []);

  const remove = useCallback(
    async (id: string) => {
      try {
        await deleteConversation(id);
        setConversations((prev) => {
          const next = prev.filter((c) => c.id !== id);
          setActiveId((current) => {
            const nextActive = current === id ? (next[0]?.id ?? null) : current;
            persistActiveId(nextActive);
            return nextActive;
          });
          return next;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "删除对话失败");
      }
    },
    [],
  );

  const rename = useCallback(async (id: string, title: string) => {
    const updated = await updateConversationTitle(id, title);
    setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
  }, []);

  const select = useCallback((id: string) => {
    persistActiveId(id);
    setActiveId(id);
  }, []);

  const applyMeta = useCallback(
    (id: string, meta: { title?: string; summary?: string }) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                title: meta.title ?? c.title,
                summary: meta.summary !== undefined ? meta.summary : c.summary,
                updated_at: new Date().toISOString(),
              }
            : c,
        ),
      );
    },
    [],
  );

  return {
    conversations,
    activeId,
    isLoading,
    error,
    refresh,
    create,
    remove,
    rename,
    select,
    applyMeta,
  };
}
