"use client";

import Link from "next/link";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useState } from "react";

import { CareerGapCard } from "@/components/career/career-gap-card";
import { CurrentTaskPanel } from "@/components/career/current-task-panel";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/use-profile";
import { analyzeGap } from "@/services/career";
import {
  deleteExperience,
  deleteProject,
  deleteSkill,
  resetProfile,
  updateExperience,
  updateProfile,
} from "@/services/profile";

const SOURCE_LABEL: Record<string, string> = {
  conversation: "对话记忆",
  resume: "简历解析",
  manual: "手动编辑",
};

function splitList(text?: string | null): string[] {
  if (!text) return [];
  return text
    .split(/[；;、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function AttrBadge({ source, confidence }: { source?: string; confidence?: number }) {
  if (!source && confidence == null) return null;
  const label = source ? SOURCE_LABEL[source] || source : null;
  const conf =
    confidence != null ? `${Math.round((confidence <= 1 ? confidence : confidence / 100) * 100)}%` : null;
  return (
    <span className="ml-2 text-[11px] text-muted-foreground">
      {[label, conf ? `置信度 ${conf}` : null].filter(Boolean).join(" · ")}
    </span>
  );
}

export default function ProfilePage() {
  const { data, isLoading, error, refresh } = useProfile();
  const [saving, setSaving] = useState(false);
  const [analyzingGap, setAnalyzingGap] = useState(false);
  const [resetting, setResetting] = useState(false);

  const status = data?.career_status;
  const strengths = splitList(status?.strength);
  const weaknesses = splitList(status?.weakness);

  const handleResetPortrait = async () => {
    if (
      !window.confirm(
        "清空职业画像与 Career Memory？对话记录会保留。此操作用于演示重置，产品无登录。",
      )
    ) {
      return;
    }
    setResetting(true);
    try {
      await resetProfile();
      await refresh();
    } finally {
      setResetting(false);
    }
  };

  const handleAnalyzeGap = async () => {
    setAnalyzingGap(true);
    try {
      await analyzeGap({
        target_position: data?.profile?.target_position || undefined,
      });
      await refresh();
    } finally {
      setAnalyzingGap(false);
    }
  };

  const handleDeleteExperience = async (id: string) => {
    if (!window.confirm("确定删除这条工作经历？")) return;
    await deleteExperience(id);
    await refresh();
  };

  const handleDeleteProject = async (id: string) => {
    if (!window.confirm("确定删除这条项目经历？")) return;
    await deleteProject(id);
    await refresh();
  };

  const handleDeleteSkill = async (id: string) => {
    if (!window.confirm("确定删除这项技能？")) return;
    await deleteSkill(id);
    await refresh();
  };

  const handleEditProfile = async () => {
    if (!data?.profile) return;
    const target = window.prompt("目标岗位", data.profile.target_position ?? "");
    if (target === null) return;
    setSaving(true);
    try {
      await updateProfile({ target_position: target.trim() || undefined });
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleEditExperience = async (id: string, field: string, current: string) => {
    const value = window.prompt(`编辑 ${field}`, current);
    if (value === null) return;
    await updateExperience(id, { [field]: value.trim() || undefined });
    await refresh();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 items-center gap-4 border-b px-6">
        <Link href="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          返回聊天
        </Link>
        <h1 className="text-lg font-semibold">个人画像</h1>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          职小伴 · Career Memory（无登录）
        </span>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={resetting || isLoading}
          onClick={() => void handleResetPortrait()}
        >
          {resetting ? "清空中…" : "清空画像"}
        </Button>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        {isLoading ? (
          <p className="text-muted-foreground">加载中...</p>
        ) : error ? (
          <p className="text-destructive">{error}</p>
        ) : (
          <div className="space-y-8">
            <section className="space-y-3 border-b pb-8">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold tracking-tight">AI 眼中的你</h2>
                <Button variant="outline" size="sm" onClick={() => void handleEditProfile()} disabled={saving}>
                  修正目标
                </Button>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {data?.profile?.summary ||
                  "还没有足够对话形成完整画像。回到聊天，自然介绍经历与目标即可。"}
              </p>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {data?.profile?.target_position && <span>目标 · {data.profile.target_position}</span>}
                {data?.profile?.industry && <span>行业 · {data.profile.industry}</span>}
                {status?.stage_label && <span>阶段 · {status.stage_label}</span>}
                {data?.profile?.confidence_score != null && (
                  <span>档案置信度 · {Math.round(data.profile.confidence_score * 100)}%</span>
                )}
              </div>
            </section>

            <section className="border-b pb-8">
              <CurrentTaskPanel task={data?.active_task} detailed />
            </section>

            <section className="border-b pb-8">
              <CareerGapCard
                gap={status?.latest_gap}
                onAnalyze={() => void handleAnalyzeGap()}
                analyzing={analyzingGap}
              />
            </section>

            <section className="grid gap-6 sm:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-medium">我的优势</h3>
                {strengths.length ? (
                  <ul className="space-y-1.5 text-sm">
                    {strengths.map((s) => (
                      <li key={s}>· {s}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">完成模拟面试后会自动汇总优势。</p>
                )}
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium">我的短板</h3>
                {weaknesses.length ? (
                  <ul className="space-y-1.5 text-sm">
                    {weaknesses.map((w) => (
                      <li key={w}>· {w}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">复盘后会沉淀可训练的短板。</p>
                )}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-medium">训练进展</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                模拟面试 {status?.interview_count ?? 0} 次
                {status?.application_count ? ` · 投递相关 ${status.application_count} 次` : ""}
                {status?.last_interview_score != null
                  ? ` · 最近得分 ${status.last_interview_score}`
                  : ""}
              </p>
              {status?.next_action && (
                <p className="mt-2 text-sm">下一步：{status.next_action}</p>
              )}
            </section>

            <section>
              <h3 className="mb-3 text-sm font-medium">我的经历</h3>
              {data?.experiences.length ? (
                <ul className="space-y-4">
                  {data.experiences.map((exp) => (
                    <li key={exp.id} className="border-b pb-4 text-sm last:border-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <p className="font-medium">
                            {[exp.position, exp.company].filter(Boolean).join(" @ ") || "未命名经历"}
                            <AttrBadge source={exp.source} confidence={exp.confidence} />
                          </p>
                          {exp.responsibility && <p className="text-muted-foreground">职责：{exp.responsibility}</p>}
                          {exp.achievement && <p className="text-muted-foreground">成就：{exp.achievement}</p>}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              void handleEditExperience(exp.id, "responsibility", exp.responsibility ?? "")
                            }
                          >
                            编辑
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void handleDeleteExperience(exp.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">暂无工作经历</p>
              )}
            </section>

            <section>
              <h3 className="mb-3 text-sm font-medium">项目经历</h3>
              {data?.projects.length ? (
                <ul className="space-y-4">
                  {data.projects.map((proj) => (
                    <li key={proj.id} className="border-b pb-4 text-sm last:border-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <p className="font-medium">
                            {proj.project_name ?? "未命名项目"}
                            <AttrBadge source={proj.source} confidence={proj.confidence} />
                          </p>
                          {proj.background && <p className="text-muted-foreground">背景：{proj.background}</p>}
                          {proj.action && <p className="text-muted-foreground">行动：{proj.action}</p>}
                          {proj.result && <p className="text-muted-foreground">结果：{proj.result}</p>}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void handleDeleteProject(proj.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">暂无项目经历</p>
              )}
            </section>

            <section>
              <h3 className="mb-3 text-sm font-medium">技能</h3>
              {data?.skills.length ? (
                <div className="flex flex-wrap gap-2">
                  {data.skills.map((sk) => (
                    <div
                      key={sk.id}
                      className="flex items-center gap-2 rounded-full border px-3 py-1 text-sm"
                    >
                      <span>
                        {sk.skill_name}
                        {sk.level ? ` (${sk.level}/10)` : ""}
                      </span>
                      <AttrBadge source={sk.source} confidence={sk.confidence} />
                      <button
                        type="button"
                        onClick={() => void handleDeleteSkill(sk.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">暂无技能记录</p>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
