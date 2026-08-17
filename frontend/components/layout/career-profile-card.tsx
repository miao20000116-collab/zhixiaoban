"use client";

import Link from "next/link";
import { ExternalLink, PanelRightClose } from "lucide-react";

import { CareerGapCard } from "@/components/career/career-gap-card";
import { CurrentTaskPanel } from "@/components/career/current-task-panel";
import { useProfile } from "@/hooks/use-profile";
import { cn } from "@/lib/utils";

const SOURCE_LABEL: Record<string, string> = {
  conversation: "对话记忆",
  resume: "简历",
  manual: "手动编辑",
};

function splitList(text?: string | null): string[] {
  if (!text) return [];
  return text
    .split(/[；;、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

interface CareerProfileCardProps {
  width?: number;
  className?: string;
  onClose?: () => void;
}

export function CareerProfileCard({ width, className, onClose }: CareerProfileCardProps) {
  const { data, isLoading } = useProfile();

  const profile = data?.profile;
  const status = data?.career_status;
  const strengths = splitList(status?.strength);
  const weaknesses = splitList(status?.weakness);
  const hasPortrait =
    profile?.target_position ||
    profile?.summary ||
    strengths.length > 0 ||
    weaknesses.length > 0 ||
    (data?.experiences.length ?? 0) > 0 ||
    (status?.interview_count ?? 0) > 0 ||
    Boolean(data?.active_task);

  return (
    <aside
      className={cn(
        "atmosphere-panel flex shrink-0 flex-col border-l",
        !width && "w-80",
        className,
      )}
      style={width ? { width } : undefined}
    >
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">个人画像</h2>
        <div className="flex items-center gap-2">
          <Link
            href="/profile"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            完整档案
            <ExternalLink className="h-3 w-3" />
          </Link>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="隐藏画像"
              aria-label="隐藏画像"
            >
              <PanelRightClose className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pr-3 text-sm">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">正在理解你的职业背景...</p>
        ) : !hasPortrait ? (
          <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
            <p>还没有足够信息形成画像。</p>
            <p>直接告诉我你的目标岗位、经历或当前卡点，我会在对话中自动沉淀。</p>
          </div>
        ) : (
          <div className="space-y-5">
            <section>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                AI 总结
              </p>
              <p className="mt-1.5 text-sm leading-relaxed">
                {profile?.summary ||
                  (profile?.target_position
                    ? `正瞄准「${profile.target_position}」，档案仍在对话中完善。`
                    : "正在从对话中构建你的职业画像。")}
              </p>
              {status?.stage_label && (
                <p className="mt-2 text-xs text-muted-foreground">
                  阶段 · {status.stage_label}
                  {status.last_interview_score != null
                    ? ` · 最近面试 ${status.last_interview_score} 分`
                    : ""}
                </p>
              )}
            </section>

            {strengths.length > 0 && (
              <section>
                <p className="text-xs font-medium text-muted-foreground">我的优势</p>
                <ul className="mt-1.5 space-y-1">
                  {strengths.slice(0, 3).map((s) => (
                    <li key={s} className="text-xs leading-relaxed">
                      · {s}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {data && data.experiences.length > 0 && (
              <section>
                <p className="text-xs font-medium text-muted-foreground">我的经历</p>
                <ul className="mt-1.5 space-y-2">
                  {data.experiences.slice(0, 2).map((exp) => (
                    <li key={exp.id} className="text-xs leading-relaxed">
                      <span>
                        {[exp.position, exp.company].filter(Boolean).join(" · ") || "经历"}
                      </span>
                      {exp.source && (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          ({SOURCE_LABEL[exp.source] || exp.source}
                          {exp.confidence != null ? ` · ${Math.round(exp.confidence * 100)}%` : ""}
                          )
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {profile?.target_position && (
              <section>
                <p className="text-xs font-medium text-muted-foreground">我的目标</p>
                <p className="mt-1 text-xs">
                  {profile.target_position}
                  {profile.industry ? ` · ${profile.industry}` : ""}
                </p>
              </section>
            )}

            <CareerGapCard gap={status?.latest_gap} compact />

            <section className="border-t border-[color:var(--season-border)]/60 pt-4">
              <CurrentTaskPanel task={data?.active_task} />
            </section>

            {weaknesses.length > 0 && (
              <section>
                <p className="text-xs font-medium text-muted-foreground">我的短板</p>
                <ul className="mt-1.5 space-y-1">
                  {weaknesses.slice(0, 3).map((w) => (
                    <li key={w} className="text-xs leading-relaxed">
                      · {w}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <p className="text-xs font-medium text-muted-foreground">训练进展</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                模拟面试 {status?.interview_count ?? 0} 次
                {status?.application_count
                  ? ` · 投递相关 ${status.application_count} 次`
                  : ""}
              </p>
              {status?.next_action && (
                <p className="mt-2 text-xs leading-relaxed">{status.next_action}</p>
              )}
            </section>
          </div>
        )}
      </div>
    </aside>
  );
}
