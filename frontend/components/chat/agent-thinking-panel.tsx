"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { WorkflowStep } from "@/types";
import { cn } from "@/lib/utils";

interface AgentThinkingPanelProps {
  steps: WorkflowStep[];
  isStreaming?: boolean;
}

const PHASE_LABEL: Record<string, string> = {
  think: "理解",
  route: "路由",
  run: "执行",
  evaluate: "质检",
  answer: "作答",
};

function phaseLabel(phase?: string) {
  if (!phase) return "处理中";
  return PHASE_LABEL[phase] || phase;
}

export function AgentThinkingPanel({ steps, isStreaming }: AgentThinkingPanelProps) {
  const [expanded, setExpanded] = useState(() => Boolean(isStreaming));
  const wasStreaming = useRef(Boolean(isStreaming));

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      if (isStreaming) {
        setExpanded(true);
        wasStreaming.current = true;
        return;
      }
      // 回答结束后自动折叠
      if (wasStreaming.current || steps.length > 0) {
        setExpanded(false);
        wasStreaming.current = false;
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [isStreaming, steps.length]);

  useEffect(() => {
    if (isStreaming) {
      wasStreaming.current = true;
    }
  }, [isStreaming]);

  const summary = useMemo(() => {
    if (!steps.length) return "";
    const latest = steps[steps.length - 1];
    const doneCount = steps.filter((s) => s.status === "done").length;
    if (isStreaming) {
      return latest?.title || "进行中";
    }
    return `共 ${steps.length} 步 · 已完成 ${doneCount}`;
  }, [steps, isStreaming]);

  const latestPhase = steps.length ? steps[steps.length - 1]?.phase : undefined;

  if (!steps.length) return null;

  return (
    <div className="w-full max-w-[85%] rounded-2xl border border-[color:var(--season-border)]/80 bg-[color:var(--season-panel)]/70 text-xs shadow-sm backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-foreground/[0.03]"
      >
        <p className="shrink-0 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Agent 思考过程
        </p>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {isStreaming && latestPhase
            ? `${phaseLabel(latestPhase)} · ${summary}`
            : summary}
        </span>
        {isStreaming && (
          <span className="shrink-0 text-[10px] text-muted-foreground animate-pulse">进行中</span>
        )}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
            expanded ? "rotate-0" : "-rotate-90",
          )}
          strokeWidth={1.75}
        />
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <ol className="space-y-2 border-t border-[color:var(--season-border)]/60 px-4 py-3">
            {steps.map((step, index) => {
              const done = step.status === "done";
              const err = step.status === "error";
              const latest = index === steps.length - 1;
              return (
                <li key={step.id} className="flex gap-2">
                  <span
                    className={cn(
                      "mt-0.5 w-3 shrink-0 text-center tabular-nums",
                      err
                        ? "text-destructive"
                        : done
                          ? "text-muted-foreground"
                          : latest
                            ? "text-foreground"
                            : "text-muted-foreground",
                    )}
                  >
                    {err ? "!" : done ? "✓" : "·"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "leading-relaxed",
                        latest && !done && !err ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      <span className="font-medium text-foreground/80">{step.agent_label}</span>
                      {" · "}
                      {step.title}
                    </p>
                    {step.detail && (
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                        {step.detail}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
