"use client";

import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

import { healthCheck } from "@/services/api";

type ApiStatus = "checking" | "online" | "offline";

export function ApiStatusBanner() {
  const [status, setStatus] = useState<ApiStatus>("checking");

  const check = async () => {
    setStatus("checking");
    try {
      await healthCheck();
      setStatus("online");
    } catch {
      setStatus("offline");
    }
  };

  useEffect(() => {
    const boot = window.setTimeout(() => {
      void check();
    }, 0);
    const timer = window.setInterval(() => void check(), 60_000);
    return () => {
      window.clearTimeout(boot);
      window.clearInterval(timer);
    };
  }, []);

  if (status === "checking" || status === "online") return null;

  return (
    <div
      role="status"
      className="mx-4 mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">后端服务暂时不可用</p>
        <p className="mt-0.5 text-xs opacity-90">
          页面仍可浏览产品界面与案例说明；对话、简历与面试等能力需等待 API 恢复后使用。
        </p>
      </div>
      <button
        type="button"
        onClick={() => void check()}
        className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs underline hover:no-underline"
      >
        <RefreshCw className="h-3 w-3" />
        重试
      </button>
    </div>
  );
}
