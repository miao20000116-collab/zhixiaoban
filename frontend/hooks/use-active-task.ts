"use client";

import { useCallback, useEffect, useState } from "react";

import { getActiveTask } from "@/services/career";
import type { CareerTask } from "@/types";

export function useActiveTask(conversationId: string | null) {
  const [task, setTask] = useState<CareerTask | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await getActiveTask(conversationId);
      setTask(data.task);
    } catch {
      // keep previous
    }
  }, [conversationId]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(id);
  }, [refresh]);

  const applyTask = useCallback((payload: CareerTask) => {
    setTask(payload);
  }, []);

  return { task, refresh, applyTask };
}
