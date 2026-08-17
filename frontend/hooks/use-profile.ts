"use client";

import { useCallback, useEffect, useState } from "react";

import { getProfile } from "@/services/profile";
import type { FullProfile } from "@/types";

export function useProfile() {
  const [data, setData] = useState<FullProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const profile = await getProfile();
      setData(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载职业档案失败");
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

  return { data, isLoading, error, refresh };
}
