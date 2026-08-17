"use client";

import { Pencil, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";

import { CurrentTaskPanel } from "@/components/career/current-task-panel";
import { cn } from "@/lib/utils";
import type { CareerTask, Conversation } from "@/types";

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  activeTask?: CareerTask | null;
  isLoading: boolean;
  /** Pixel width; omit for default Tailwind width. */
  width?: number;
  /** Hide Current Task block when sidebar is very narrow. */
  compact?: boolean;
  className?: string;
  onSelect: (id: string) => void;
  onCreate: () => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRename: (id: string, title: string) => Promise<void>;
}

export function ConversationSidebar({
  conversations,
  activeId,
  activeTask,
  isLoading,
  width,
  compact = false,
  className,
  onSelect,
  onCreate,
  onDelete,
  onRename,
}: ConversationSidebarProps) {
  const [creating, setCreating] = useState(false);

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;

  const handleCreate = async () => {
    setCreating(true);
    try {
      await onCreate();
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (id: string, currentTitle: string) => {
    const title = window.prompt("重命名对话", currentTitle);
    if (title && title.trim() && title.trim() !== currentTitle) {
      await onRename(id, title.trim());
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (window.confirm(`确定删除「${title}」？此操作不可恢复。`)) {
      await onDelete(id);
    }
  };

  return (
    <aside
      className={cn(
        "atmosphere-panel flex shrink-0 flex-col border-r",
        !width && "w-72",
        className,
      )}
      style={width ? { width } : undefined}
    >
      {/* 1. 新建对话 */}
      <div className="shrink-0 px-3 pb-2 pt-3">
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={creating}
          className="flex h-12 w-full items-center justify-start gap-2.5 rounded-xl bg-[color:var(--season-accent)] px-4 text-[15px] font-medium text-[color:var(--season-accent-fg)] shadow-sm transition-all hover:brightness-[1.06] hover:shadow-md disabled:pointer-events-none disabled:opacity-50"
        >
          <Sparkles className="h-5 w-5 shrink-0 opacity-95" />
          {compact ? "新建" : "新建对话"}
        </button>
      </div>

      {/* 2. 对话列表 → 3. 当前任务紧随其后（不再吸底） */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3 pr-2">
        {isLoading ? (
          <p className="p-3 text-xs text-muted-foreground">加载中...</p>
        ) : conversations.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">暂无对话，点击上方新建</p>
        ) : (
          <ul className="space-y-2.5">
            {conversations.map((conversation) => {
              const active = activeId === conversation.id;
              return (
                <li key={conversation.id}>
                  <div
                    className={cn(
                      "group flex items-center gap-1 rounded-xl px-3 py-2.5 text-sm transition-all",
                      "border border-[color:var(--season-border)]",
                      // 轻浮雕：顶缘高光 + 外缘淡影，让每条对话自成一块
                      "shadow-[inset_0_1px_0_color-mix(in_srgb,white_70%,transparent),0_1px_2px_color-mix(in_srgb,var(--foreground)_6%,transparent)]",
                      active
                        ? "bg-[color:var(--season-pop)]/75 text-[color:var(--season-pop-fg)] ring-1 ring-[color:var(--season-accent)]/25"
                        : "bg-[color:var(--season-panel)]/90 hover:bg-[color:var(--season-panel)] hover:shadow-[inset_0_1px_0_color-mix(in_srgb,white_80%,transparent),0_2px_6px_color-mix(in_srgb,var(--foreground)_8%,transparent)]",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(conversation.id)}
                      className="min-w-0 flex-1 truncate text-left"
                      title={conversation.summary || conversation.title}
                    >
                      <span className="block truncate font-medium tracking-wide">
                        {conversation.title}
                      </span>
                      {conversation.summary && (
                        <span
                          className={cn(
                            "mt-0.5 block truncate text-[11px] leading-snug",
                            active ? "opacity-65" : "text-muted-foreground",
                          )}
                        >
                          {conversation.summary.split("\n")[0]}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRename(conversation.id, conversation.title)}
                      className="hidden shrink-0 rounded-md p-1 text-muted-foreground hover:bg-background/70 group-hover:inline-flex"
                      title="重命名"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(conversation.id, conversation.title)}
                      className="hidden shrink-0 rounded-md p-1 text-muted-foreground hover:bg-background/70 hover:text-destructive group-hover:inline-flex"
                      title="删除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {!compact && (
          <div className="mt-3 border-t border-[color:var(--season-border)]/70 pt-2">
            <CurrentTaskPanel
              task={activeTask}
              conversationSummary={activeConversation?.summary}
            />
          </div>
        )}
      </div>
    </aside>
  );
}
