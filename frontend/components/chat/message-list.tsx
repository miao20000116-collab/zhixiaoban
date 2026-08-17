"use client";

import {
  ChevronDown,
  ChevronUp,
  Search,
  X,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { MessageBubble } from "@/components/chat/message-bubble";
import { AgentThinkingPanel } from "@/components/chat/agent-thinking-panel";
import { FollowUpChips } from "@/components/chat/follow-up-chips";
import { WelcomeHero } from "@/components/chat/welcome-hero";
import { buildFollowUpChips } from "@/lib/follow-up-suggestions";
import { cn } from "@/lib/utils";
import type { Message, NextActionSuggestion, WorkflowStep } from "@/types";

/**
 * Empty-state starters map to real product capabilities.
 * Chat First: each item sends natural language (not a feature menu).
 */
const STARTERS = [
  {
    label: "完善画像",
    hint: "3 问写入 Career Memory",
    message:
      "我想完善个人画像。请按这 3 步引导我：1）目标岗位；2）一段真实经历（职责/结果）；3）一条否定性约束（例如没有某类真实项目经验）。每步确认后写入 Career Memory。",
  },
  {
    label: "分析这份 JD",
    hint: "拆解要求与匹配点",
    message: "我想分析一份岗位 JD，请告诉我该怎么发给你，并帮我拆解要求和匹配点。",
  },
  {
    label: "优化简历",
    hint: "按目标岗位可执行改写",
    message: "请帮我优化简历：先说明你需要我提供什么，然后按目标岗位给出可执行改写建议。",
  },
  {
    label: "提炼 STAR 经历",
    hint: "补量化结果与表达",
    message: "帮我把一段工作经历改写成 STAR 结构，并指出哪里缺量化结果。",
  },
  {
    label: "文字模拟面试",
    hint: "按岗位出题并追问",
    message: "我想开始文字模拟面试，请按我的目标岗位出题并逐轮追问。",
  },
  {
    label: "语音模拟面试",
    hint: "开麦后直接说，停顿自动提交",
    message: "我想进行语音模拟面试：录音回答、转写，并给我表达与内容反馈。",
  },
];

const NEAR_BOTTOM_PX = 96;
const SHOW_TOP_AFTER_PX = 280;

interface MessageListProps {
  messages: Message[];
  streamingContent?: string;
  workflowSteps?: WorkflowStep[];
  isLoading?: boolean;
  isStreaming?: boolean;
  currentIntent?: string | null;
  nextAction?: NextActionSuggestion | null;
  onSend?: (message: string) => void;
  onFollowUpSelect?: (message: string) => void;
}

export function MessageList({
  messages,
  streamingContent,
  workflowSteps = [],
  isLoading,
  isStreaming,
  currentIntent,
  nextAction,
  onSend,
  onFollowUpSelect,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const stickToBottomRef = useRef(true);
  /** Only scroll when user explicitly searches / jumps — not while typing. */
  const findScrollTokenRef = useRef(0);

  const [showJumpBottom, setShowJumpBottom] = useState(false);
  const [showJumpTop, setShowJumpTop] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findDraft, setFindDraft] = useState("");
  const [findQuery, setFindQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [findScrollToken, setFindScrollToken] = useState(0);

  const matchIds = useMemo(() => {
    const q = findQuery.trim().toLowerCase();
    if (!q) return [] as string[];
    return messages
      .filter((m) => m.content.toLowerCase().includes(q))
      .map((m) => m.id);
  }, [messages, findQuery]);

  const activeMatchId = matchIds[matchIndex] ?? null;

  const updateScrollFlags = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceBottom <= NEAR_BOTTOM_PX;
    stickToBottomRef.current = nearBottom;
    setShowJumpBottom(!nearBottom && el.scrollHeight > el.clientHeight + 40);
    setShowJumpTop(el.scrollTop > SHOW_TOP_AFTER_PX);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    stickToBottomRef.current = true;
    setShowJumpBottom(false);
  }, []);

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const scrollToMatch = useCallback((messageId: string) => {
    const root = scrollRef.current?.querySelector<HTMLElement>(
      `[data-message-id="${messageId}"]`,
    );
    if (!root) return;
    stickToBottomRef.current = false;
    const mark =
      root.querySelector<HTMLElement>('mark[data-find-hit="active"]') ||
      root.querySelector<HTMLElement>("mark[data-find-hit]");
    (mark || root).scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  /** Prefer the first hit at/below the current viewport (avoid always jumping to top). */
  const pickNearestMatchIndex = useCallback((ids: string[]) => {
    const scroller = scrollRef.current;
    if (!scroller || ids.length === 0) return 0;
    const viewTop = scroller.scrollTop;
    for (let i = 0; i < ids.length; i += 1) {
      const node = scroller.querySelector<HTMLElement>(
        `[data-message-id="${ids[i]}"]`,
      );
      if (!node) continue;
      if (node.offsetTop + node.offsetHeight >= viewTop + 24) return i;
    }
    return Math.max(0, ids.length - 1);
  }, []);

  const requestFindScroll = useCallback(() => {
    findScrollTokenRef.current += 1;
    setFindScrollToken(findScrollTokenRef.current);
  }, []);

  const openFind = useCallback(() => {
    setFindOpen(true);
    requestAnimationFrame(() => findInputRef.current?.focus());
  }, []);

  const closeFind = useCallback(() => {
    setFindOpen(false);
    setFindDraft("");
    setFindQuery("");
    setMatchIndex(0);
  }, []);

  const runSearch = useCallback(
    (raw: string) => {
      const q = raw.trim();
      if (!q) {
        setFindQuery("");
        setMatchIndex(0);
        return;
      }
      const ids = messages
        .filter((m) => m.content.toLowerCase().includes(q.toLowerCase()))
        .map((m) => m.id);
      setFindQuery(q);
      setFindDraft(q);
      const idx = pickNearestMatchIndex(ids);
      setMatchIndex(idx);
      requestFindScroll();
    },
    [messages, pickNearestMatchIndex, requestFindScroll],
  );

  const goToMatch = useCallback(
    (next: number) => {
      if (matchIds.length === 0) return;
      const idx = ((next % matchIds.length) + matchIds.length) % matchIds.length;
      setMatchIndex(idx);
      requestFindScroll();
    },
    [matchIds, requestFindScroll],
  );

  const onFindKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      e.stopPropagation();
      const draft = findDraft.trim();
      if (!draft) return;
      // 新关键词：开始搜索；同一关键词：Enter 下一项 / Shift+Enter 上一项
      if (draft.toLowerCase() !== findQuery.trim().toLowerCase()) {
        runSearch(draft);
        return;
      }
      goToMatch(e.shiftKey ? matchIndex - 1 : matchIndex + 1);
    },
    [findDraft, findQuery, goToMatch, matchIndex, runSearch],
  );

  useEffect(() => {
    if (!findOpen || !activeMatchId || findScrollToken === 0) return;
    const id = window.requestAnimationFrame(() => {
      scrollToMatch(activeMatchId);
    });
    return () => window.cancelAnimationFrame(id);
  }, [activeMatchId, findOpen, findScrollToken, scrollToMatch]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isFind = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f";
      if (isFind) {
        // Capture early to reduce chance of browser/Cursor「Find in page」叠出来
        e.preventDefault();
        e.stopPropagation();
        if (messages.length > 0) openFind();
        return;
      }
      if (!findOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeFind();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [closeFind, findOpen, messages.length, openFind]);

  useLayoutEffect(() => {
    if (!stickToBottomRef.current) {
      updateScrollFlags();
      return;
    }
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    updateScrollFlags();
  }, [messages, streamingContent, workflowSteps, updateScrollFlags]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        加载消息中...
      </div>
    );
  }

  if (messages.length === 0 && !streamingContent && workflowSteps.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        <WelcomeHero
          actions={
            <div className="mx-auto grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
              {STARTERS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => onSend?.(item.message)}
                  className={cn(
                    "group flex flex-col items-start gap-0.5 rounded-xl px-4 py-3 text-left",
                    "border border-[color:var(--season-border)]/80 bg-[color:var(--season-panel)]/55",
                    "transition-[border-color,background-color,transform] duration-200",
                    "hover:border-[color:var(--season-accent)]/45 hover:bg-[color:var(--season-panel)]/90",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--season-accent)]/35",
                  )}
                >
                  <span className="text-[13px] font-medium tracking-wide text-foreground/90 group-hover:text-foreground">
                    {item.label}
                  </span>
                  <span className="text-[12px] leading-snug text-foreground/45 group-hover:text-foreground/60">
                    {item.hint}
                  </span>
                </button>
              ))}
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {findOpen && (
        <div className="absolute inset-x-0 top-0 z-20 flex justify-center px-3 pt-2">
          <div className="flex w-full max-w-lg items-center gap-1.5 rounded-xl border border-[color:var(--season-border)] bg-[color:var(--season-panel)]/95 px-2.5 py-1.5 shadow-lg backdrop-blur-md">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={findInputRef}
              value={findDraft}
              onChange={(e) => setFindDraft(e.target.value)}
              onKeyDown={onFindKeyDown}
              placeholder="输入关键词，按 Enter 搜索…"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label="在对话中搜索"
            />
            <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
              {findQuery.trim()
                ? matchIds.length === 0
                  ? "无结果"
                  : `${matchIndex + 1}/${matchIds.length}`
                : ""}
            </span>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-[12px] font-medium text-foreground hover:bg-accent disabled:opacity-30"
              disabled={!findDraft.trim()}
              onClick={() => runSearch(findDraft)}
            >
              搜索
            </button>
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
              disabled={matchIds.length === 0}
              onClick={() => goToMatch(matchIndex - 1)}
              aria-label="上一个匹配"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
              disabled={matchIds.length === 0}
              onClick={() => goToMatch(matchIndex + 1)}
              aria-label="下一个匹配"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={closeFind}
              aria-label="关闭搜索"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={updateScrollFlags}
        className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 pr-3"
      >
        {(() => {
          let lastUserIndex = -1;
          for (let i = messages.length - 1; i >= 0; i -= 1) {
            if (messages[i].role === "user") {
              lastUserIndex = i;
              break;
            }
          }

          const nodes: ReactNode[] = [];

          messages.forEach((message, index) => {
            // 思考过程始终插在「本轮用户问题」与「回答」之间
            if (
              workflowSteps.length > 0 &&
              lastUserIndex >= 0 &&
              index === lastUserIndex + 1
            ) {
              nodes.push(
                <AgentThinkingPanel
                  key="agent-thinking"
                  steps={workflowSteps}
                  isStreaming={Boolean(isStreaming)}
                />,
              );
            }

            const isActive = activeMatchId === message.id;
            const isHit = Boolean(findQuery.trim() && matchIds.includes(message.id));
            const isAssistant = message.role === "assistant";
            const isLatestAssistant =
              isAssistant &&
              !streamingContent &&
              messages.slice(index + 1).every((m) => m.role !== "assistant");

            const chips = isAssistant
              ? buildFollowUpChips({
                  content: message.content,
                  intent: isLatestAssistant ? currentIntent : null,
                  nextAction: isLatestAssistant ? nextAction : null,
                  preferNextAction: isLatestAssistant,
                  count: isLatestAssistant ? 4 : 3,
                })
              : [];

            nodes.push(
              <div
                key={message.id}
                data-message-id={message.id}
                className={cn(
                  "rounded-2xl transition-[box-shadow,background-color] duration-300",
                  isActive && "ring-2 ring-primary/55 ring-offset-2 ring-offset-background",
                  isHit && !isActive && "bg-primary/5",
                )}
              >
                <MessageBubble
                  role={message.role as "user" | "assistant"}
                  content={message.content}
                  highlightQuery={findQuery}
                  highlightActive={isActive}
                />
                {isAssistant && chips.length > 0 && (
                  <FollowUpChips
                    chips={chips}
                    disabled={Boolean(isStreaming)}
                    onSelect={(msg) => {
                      onFollowUpSelect?.(msg);
                      onSend?.(msg);
                    }}
                  />
                )}
              </div>,
            );
          });

          // 流式中：用户消息已在列表末尾，思考过程紧跟其后、回答之上
          if (workflowSteps.length > 0 && (lastUserIndex === messages.length - 1 || messages.length === 0)) {
            nodes.push(
              <AgentThinkingPanel
                key="agent-thinking"
                steps={workflowSteps}
                isStreaming={Boolean(isStreaming)}
              />,
            );
          }

          if (streamingContent) {
            nodes.push(
              <MessageBubble
                key="streaming"
                role="assistant"
                content={streamingContent}
                isStreaming
              />,
            );
          } else if (isStreaming && workflowSteps.length === 0) {
            nodes.push(
              <div key="thinking-placeholder" className="text-sm text-muted-foreground animate-pulse">
                思考中…
              </div>,
            );
          }

          return nodes;
        })()}
        <div ref={bottomAnchorRef} className="h-px w-full shrink-0" />
      </div>

      {/* 回顶：偏隐性 */}
      <button
        type="button"
        onClick={scrollToTop}
        aria-label="回到顶部"
        title="回到顶部"
        className={cn(
          "absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-transparent bg-background/40 text-muted-foreground/50 backdrop-blur-sm transition-all duration-300 hover:border-[color:var(--season-border)] hover:bg-background/80 hover:text-muted-foreground",
          showJumpTop && !findOpen
            ? "pointer-events-auto translate-y-0 opacity-55 hover:opacity-100"
            : "pointer-events-none -translate-y-1 opacity-0",
        )}
      >
        <ChevronUp className="h-4 w-4" strokeWidth={1.75} />
      </button>

      {/* 回底：更显性，接近 GPT 风格 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
        <button
          type="button"
          onClick={() => scrollToBottom("smooth")}
          aria-label="回到最新消息"
          title="回到最新"
          className={cn(
            "pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--season-border)] bg-background text-foreground shadow-md transition-all duration-300 hover:bg-accent hover:shadow-lg",
            showJumpBottom
              ? "translate-y-0 scale-100 opacity-100"
              : "pointer-events-none translate-y-2 scale-95 opacity-0",
          )}
        >
          <ChevronDown className="h-5 w-5" strokeWidth={2.25} />
        </button>
      </div>

      {!findOpen && messages.length > 0 && (
        <button
          type="button"
          onClick={openFind}
          aria-label="搜索对话（Ctrl+F）"
          title="搜索对话（Ctrl+F）"
          className="absolute left-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-transparent bg-background/30 text-muted-foreground/40 backdrop-blur-sm transition-all duration-300 hover:border-[color:var(--season-border)] hover:bg-background/80 hover:text-muted-foreground hover:opacity-100 opacity-40"
        >
          <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}
