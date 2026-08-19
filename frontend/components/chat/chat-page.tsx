"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Menu, PanelRight, PanelRightClose, UserCircle, X } from "lucide-react";

import { CalmQuote } from "@/components/atmosphere/calm-quote";
import { SeasonSwitcher } from "@/components/atmosphere/season-switcher";
import { ChatArea } from "@/components/chat/chat-area";
import { ApiStatusBanner } from "@/components/layout/api-status-banner";
import { CareerProfileCard } from "@/components/layout/career-profile-card";
import { FeatureSidebar } from "@/components/layout/feature-sidebar";
import { ResizeHandle } from "@/components/layout/resize-handle";
import { useChat } from "@/hooks/use-chat";
import { useConversations } from "@/hooks/use-conversations";
import { usePanelLayout } from "@/hooks/use-panel-layout";
import { useProfile } from "@/hooks/use-profile";
import { getActiveTask } from "@/services/career";
import type { CareerTask } from "@/types";

export function ChatPage() {
  const { refresh: refreshProfile } = useProfile();
  const [activeTask, setActiveTask] = useState<CareerTask | null>(null);
  const [memoryNotice, setMemoryNotice] = useState<string | null>(null);
  const layout = usePanelLayout();

  const {
    conversations,
    activeId,
    error: conversationsError,
    create,
    refresh,
    applyMeta,
  } = useConversations();

  const onConversationUpdated = useCallback(
    (payload: { id: string; title?: string; summary?: string | null }) => {
      applyMeta(payload.id, { title: payload.title, summary: payload.summary ?? undefined });
    },
    [applyMeta],
  );

  const onTaskUpdated = useCallback((task: CareerTask) => {
    setActiveTask(task);
    refreshProfile();
  }, [refreshProfile]);

  const onMemoryUpdated = useCallback(
    (payload?: { count?: number; summary?: string; deduped?: boolean }) => {
      refreshProfile();
      const raw = (payload?.summary || "").trim();
      const firstLine = raw
        .split("\n")
        .map((s) => s.replace(/^[-*•\d.\s]+/, "").trim())
        .find(Boolean);
      const label = firstLine
        ? `已记住：${firstLine.slice(0, 48)}${firstLine.length > 48 ? "…" : ""}`
        : payload?.deduped
          ? "已记录（与已有记忆重复）"
          : "已更新职业画像";
      setMemoryNotice(label);
      window.setTimeout(() => setMemoryNotice(null), 8000);
    },
    [refreshProfile],
  );

  useEffect(() => {
    let cancelled = false;
    void getActiveTask(activeId)
      .then((res) => {
        if (!cancelled) setActiveTask(res.task);
      })
      .catch(() => {
        if (!cancelled) setActiveTask(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  const {
    messages,
    streamingContent,
    workflowSteps,
    isLoading: messagesLoading,
    isStreaming,
    error: chatError,
    currentIntent,
    interviewStageLabel,
    interviewMode,
    nextAction,
    clearNextAction,
    sendMessage,
    reloadAfterExternal,
    beginUploadTask,
    finishUploadTask,
  } = useChat(activeId, onMemoryUpdated, onConversationUpdated, onTaskUpdated);

  const activeConversation = conversations.find((conversation) => conversation.id === activeId) ?? null;

  return (
    <div className="atmosphere-shell flex h-screen flex-col overflow-hidden">
      <header className="atmosphere-panel relative flex h-12 shrink-0 items-center gap-2 border-b px-3 sm:gap-3 sm:px-5">
        {layout.isMobile && (
          <button
            type="button"
            onClick={layout.toggleLeftDrawer}
            className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="打开菜单"
          >
            <Menu className="h-4 w-4" />
          </button>
        )}
        <h1 className="shrink-0 font-[family-name:var(--font-quote)] text-base font-semibold tracking-wide sm:text-[17px]">
          职小伴
        </h1>
        <span className="hidden shrink-0 rounded-full bg-muted/80 px-2 py-0.5 text-[11px] text-muted-foreground lg:inline">
          职业智能
        </span>
        {currentIntent && (
          <span className="hidden shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary xl:inline">
            {currentIntent}
          </span>
        )}
        {interviewStageLabel && (
          <span className="hidden shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary xl:inline">
            面试 · {interviewStageLabel}
            {interviewMode === "technical_interview" ? " · 技术专项" : ""}
          </span>
        )}
        {memoryNotice && (
          <span
            className="max-w-[42vw] truncate rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] text-emerald-800 sm:max-w-xs"
            title={memoryNotice}
          >
            {memoryNotice}
          </span>
        )}

        <CalmQuote className="mx-2 hidden min-w-0 flex-1 truncate text-left md:block lg:mx-4 lg:text-center" />

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
          <SeasonSwitcher className="mr-0.5" />
          {!layout.isMobile && (
            <button
              type="button"
              onClick={layout.toggleRight}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              title={layout.rightOpen ? "隐藏个人画像" : "显示个人画像"}
              aria-pressed={layout.rightOpen}
            >
              {layout.rightOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRight className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">画像</span>
            </button>
          )}
          <Link href="/dashboard" className="rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
            质量看板
          </Link>
          <Link
            href="/profile"
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <UserCircle className="h-4 w-4" />
            <span className="hidden sm:inline">完整档案</span>
          </Link>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {!layout.isMobile && (
          <>
            <FeatureSidebar
              width={layout.leftWidth}
              compact={layout.leftWidth < 210}
              activeTask={activeTask}
              conversationSummary={activeConversation?.summary}
              className="h-full"
            />
            <ResizeHandle
              side="right"
              value={layout.leftWidth}
              min={layout.leftLimits.min}
              max={layout.leftLimits.max}
              onChange={layout.setLeftWidth}
            />
          </>
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          <ApiStatusBanner />
          {conversationsError && (
            <div className="mx-4 mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {conversationsError}
              <button type="button" onClick={() => void refresh()} className="ml-2 underline">
                重试
              </button>
            </div>
          )}
          <ChatArea
            conversationId={activeId}
            messages={messages}
            streamingContent={streamingContent}
            workflowSteps={workflowSteps}
            isLoading={messagesLoading}
            isStreaming={isStreaming}
            error={chatError}
            currentIntent={currentIntent}
            nextAction={nextAction}
            onDismissNextAction={clearNextAction}
            onCreateConversation={async () => {
              await create();
            }}
            onSend={(msg) => void sendMessage(msg)}
            onUploadStart={(kind) => beginUploadTask(kind)}
            onUploadFinish={(ok) => finishUploadTask(ok)}
            onUploadAnalyzed={() => {
              if (activeId) void reloadAfterExternal(activeId);
              void refresh();
              refreshProfile();
              void getActiveTask(activeId).then((res) => setActiveTask(res.task));
            }}
          />
        </main>

        {layout.rightOpen && (
          <>
            <ResizeHandle
              side="left"
              value={layout.rightWidth}
              min={layout.rightLimits.min}
              max={layout.rightLimits.max}
              onChange={layout.setRightWidth}
            />
            <CareerProfileCard
              width={layout.rightWidth}
              onClose={layout.toggleRight}
            />
          </>
        )}

        {layout.isMobile && layout.leftDrawerOpen && (
          <div className="absolute inset-0 z-40 flex">
            <button
              type="button"
              className="absolute inset-0 bg-black/25"
              aria-label="关闭菜单"
              onClick={() => layout.setLeftDrawerOpen(false)}
            />
            <div className="atmosphere-panel relative z-10 flex h-full w-[min(300px,86vw)] flex-col shadow-xl">
              <div className="flex h-12 items-center justify-between border-b px-3">
                <span className="text-sm font-medium">导航</span>
                <button
                  type="button"
                  onClick={() => layout.setLeftDrawerOpen(false)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-accent"
                  aria-label="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <FeatureSidebar
                className="min-h-0 w-full flex-1 border-r-0"
                activeTask={activeTask}
                conversationSummary={activeConversation?.summary}
                onNavigate={() => layout.setLeftDrawerOpen(false)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
