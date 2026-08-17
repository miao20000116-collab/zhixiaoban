"use client";

import type { CareerTask } from "@/types";

const TASK_TYPE_LABEL: Record<string, string> = {
  job_search: "求职",
  jd_analysis: "岗位分析",
  resume_prepare: "简历优化",
  interview_prepare: "面试准备",
  career_growth: "职业成长",
};

const STATUS_LABEL: Record<string, string> = {
  active: "进行中",
  completed: "已完成",
  paused: "已暂停",
};

interface CurrentTaskPanelProps {
  task: CareerTask | null | undefined;
  conversationSummary?: string | null;
  /** Profile / detailed view shows full step checklist. */
  detailed?: boolean;
}

function shortLine(text: string, max = 72) {
  const one = text.split("\n")[0]?.trim() || "";
  return one.length > max ? `${one.slice(0, max)}…` : one;
}

/** Current Task / Career Progress — no new page; embed in sidebar or Profile. */
export function CurrentTaskPanel({
  task,
  conversationSummary,
  detailed = false,
}: CurrentTaskPanelProps) {
  if (!task) {
    const tip = conversationSummary
      ? shortLine(conversationSummary)
      : "对话中会自动识别你正在推进的目标。";
    return (
      <div className={detailed ? "space-y-2" : "px-1 py-2"}>
        <p
          className={
            detailed
              ? "text-sm font-medium"
              : "text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70"
          }
        >
          {detailed ? "Career Progress" : "当前任务"}
        </p>
        <p className={detailed ? "text-sm text-muted-foreground" : "mt-1 text-[11px] leading-relaxed text-muted-foreground"}>
          {detailed ? "还没有进行中的求职任务。在对话里说出目标或上传 JD，我会开始跟踪进度。" : tip}
        </p>
      </div>
    );
  }

  const progressPct = Math.round((Number(task.progress) || 0) * 100);
  const done = task.completed_steps ?? [];
  const pending = task.pending_steps ?? [];
  const next = task.next_action ? shortLine(task.next_action, detailed ? 120 : 56) : null;
  const doneShow = detailed ? done : done.slice(0, 3);
  const pendingShow = detailed ? pending : pending.slice(0, 2);

  return (
    <div className={detailed ? "space-y-3" : "px-1 py-2"}>
      <div className="flex items-baseline justify-between gap-2">
        <p
          className={
            detailed
              ? "text-sm font-medium"
              : "text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70"
          }
        >
          {detailed ? "Career Progress" : "当前任务"}
        </p>
        <span
          className={
            detailed
              ? "text-sm tabular-nums text-muted-foreground"
              : "text-[10px] tabular-nums text-muted-foreground/80"
          }
        >
          {progressPct}%
        </span>
      </div>

      <p
        className={detailed ? "text-base font-medium tracking-tight" : "mt-1 truncate text-[12px] text-foreground/80"}
        title={task.goal}
      >
        {task.goal}
      </p>

      <p className={detailed ? "text-xs text-muted-foreground" : "mt-0.5 text-[10px] text-muted-foreground"}>
        {TASK_TYPE_LABEL[task.task_type] || task.task_type}
        {" · "}
        {STATUS_LABEL[task.status] || task.status}
      </p>

      <div className={detailed ? "mt-1 h-1 overflow-hidden rounded-full bg-muted" : "mt-2 h-0.5 overflow-hidden rounded-full bg-muted/80"}>
        <div
          className="h-full rounded-full bg-[color:var(--season-accent)]/55 transition-[width]"
          style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
        />
      </div>

      {(doneShow.length > 0 || pendingShow.length > 0) && (
        <ul className={detailed ? "space-y-1.5 text-sm" : "mt-2 space-y-1 text-[11px] leading-relaxed"}>
          {doneShow.map((step) => (
            <li key={`done-${step}`} className="text-muted-foreground">
              ✓ {step}
            </li>
          ))}
          {pendingShow.map((step) => (
            <li key={`pending-${step}`} className="text-muted-foreground">
              □ {step}
            </li>
          ))}
        </ul>
      )}

      {next && (
        <p
          className={
            detailed
              ? "text-sm leading-relaxed"
              : "mt-1.5 text-[11px] leading-relaxed text-muted-foreground"
          }
          title={task.next_action || undefined}
        >
          下一步：{next}
        </p>
      )}
    </div>
  );
}
