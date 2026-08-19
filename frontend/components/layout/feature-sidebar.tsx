"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Layers3, MessageSquareText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { CurrentTaskPanel } from "@/components/career/current-task-panel";
import { cn } from "@/lib/utils";
import { featureSections } from "@/lib/feature-nav";
import type { CareerTask } from "@/types";

interface FeatureSidebarProps {
  width?: number;
  compact?: boolean;
  className?: string;
  activeTask?: CareerTask | null;
  conversationSummary?: string | null;
  onNavigate?: () => void;
}

export function FeatureSidebar({
  width,
  compact = false,
  className,
  activeTask,
  conversationSummary,
  onNavigate,
}: FeatureSidebarProps) {
  const pathname = usePathname();
  const [webToolsOpen, setWebToolsOpen] = useState(true);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    "resume-prep": true,
    "interview-prep": true,
    "interview-review": true,
  });

  const activeLeafId = useMemo(() => {
    for (const section of featureSections) {
      for (const group of section.groups ?? []) {
        const item = group.children.find((child) => pathname === child.href);
        if (item) return item.id;
      }
    }
    return null;
  }, [pathname]);

  const activeGroupId = useMemo(() => {
    if (!activeLeafId) return null;
    const webToolsSection = featureSections.find((s) => s.id === "web-tools");
    if (!webToolsSection?.groups) return null;
    const group = webToolsSection.groups.find((g) => g.children.some((c) => c.id === activeLeafId));
    return group?.id ?? null;
  }, [activeLeafId]);

  useEffect(() => {
    if (!activeGroupId) return;
    setWebToolsOpen(true);
    setOpenGroups((prev) => (prev[activeGroupId] ? prev : { ...prev, [activeGroupId]: true }));
  }, [activeGroupId]);

  return (
    <aside
      className={cn(
        "atmosphere-panel flex h-full max-h-full shrink-0 flex-col overflow-hidden border-r",
        !width && "w-80",
        className,
      )}
      style={width ? { width } : undefined}
    >
      <div className="shrink-0 px-3 pb-2 pt-3">
        <Link
          href="/"
          onClick={onNavigate}
          className={cn(
            "flex min-h-12 w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all",
            pathname === "/"
              ? "border-[color:var(--season-accent)] bg-[color:var(--season-pop)]/75 text-[color:var(--season-pop-fg)]"
              : "border-[color:var(--season-border)] bg-[color:var(--season-panel)]/90 hover:bg-[color:var(--season-panel)]",
          )}
        >
          <MessageSquareText className="h-4 w-4 shrink-0 opacity-80" />
          {!compact && (
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-[1.45] tracking-wide">
                小伴<span className="ml-1">Agent</span>
              </p>
              <p className="mt-1.5 truncate text-[11px] leading-normal text-muted-foreground">
                回到主对话和职业画像
              </p>
            </div>
          )}
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3 pr-2">
        {/* 一级：求职工作台 */}
        <div className="mb-1 px-1">
          <button
            type="button"
            onClick={() => setWebToolsOpen((prev) => !prev)}
            className={cn(
              "flex w-full items-center gap-2 rounded-xl border px-4 py-3 text-left transition-all",
              "border-[color:var(--season-border)] bg-[color:var(--season-panel)]/90 hover:bg-[color:var(--season-panel)]",
            )}
          >
            <Layers3 className="h-4 w-4 shrink-0 opacity-80" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold leading-tight">求职工作台</p>
              {!compact && <p className="mt-0.5 text-[11px] text-muted-foreground">按流程打开网页功能</p>}
            </div>
            <ChevronDown
              className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", webToolsOpen && "rotate-180")}
            />
          </button>
        </div>

        {webToolsOpen && (
          <div className="ml-3 space-y-3 border-l border-[color:var(--season-border)]/80 pl-3 pt-1">
            {featureSections
              .find((section) => section.id === "web-tools")
              ?.groups?.map((group) => {
                const isOpen = openGroups[group.id] ?? false;
                const activeInGroup = group.children.some((child) => child.id === activeLeafId);
                return (
                  <section key={group.id}>
                    {/* 二级：分组标题 */}
                    <button
                      type="button"
                      onClick={() =>
                        setOpenGroups((prev) => ({
                          ...prev,
                          [group.id]: !isOpen,
                        }))
                      }
                      className={cn(
                        "flex w-full items-center gap-1.5 rounded-md px-1 py-1.5 text-left transition-all",
                        activeInGroup
                          ? "text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-xs font-semibold tracking-wide",
                          activeInGroup && "text-[13px] text-foreground",
                        )}
                      >
                        {group.label}
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 opacity-60 transition-transform",
                          isOpen && "rotate-180",
                        )}
                      />
                    </button>

                    {/* 三级：具体功能页 */}
                    {isOpen && (
                      <div className="mt-0.5 space-y-0.5 pl-1">
                        {group.children.map((child) => {
                          const active = pathname === child.href;
                          return (
                            <Link
                              key={child.id}
                              href={child.href}
                              onClick={onNavigate}
                              className={cn(
                                "block rounded-lg px-3 py-2 transition-all",
                                active
                                  ? "bg-[color:var(--season-accent)] text-[color:var(--season-accent-fg)] shadow-sm"
                                  : "text-foreground/80 hover:bg-background/70 hover:text-foreground",
                              )}
                            >
                              <span className={cn("block text-[13px]", active ? "font-semibold" : "font-medium")}>
                                {child.label}
                              </span>
                              {!compact && child.description && (
                                <span
                                  className={cn(
                                    "mt-0.5 block text-[10px] leading-snug",
                                    active ? "opacity-85" : "text-muted-foreground",
                                  )}
                                >
                                  {child.description}
                                </span>
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })}
          </div>
        )}

        {!compact && (
          <div className="mt-3 border-t border-[color:var(--season-border)]/70 pt-2">
            <CurrentTaskPanel task={activeTask} conversationSummary={conversationSummary} />
          </div>
        )}
      </div>
    </aside>
  );
}
