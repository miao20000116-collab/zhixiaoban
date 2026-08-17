"use client";

import Link from "next/link";
import { ArrowLeft, Play, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  type BadCase,
  type DashboardMetrics,
  type DatasetInfo,
  type EvaluationRecord,
  type PromptTemplate,
  activatePrompt,
  fetchBadCases,
  fetchDashboard,
  fetchDatasets,
  fetchEvaluationRecords,
  fetchPrompts,
  runDataset,
  seedPrompts,
  updateBadCase,
} from "@/services/evaluation";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function riskClass(level: string): string {
  if (level === "high") return "text-red-600";
  if (level === "medium") return "text-amber-600";
  return "text-emerald-600";
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [records, setRecords] = useState<EvaluationRecord[]>([]);
  const [badCases, setBadCases] = useState<BadCase[]>([]);
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [datasetResult, setDatasetResult] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expandedPromptId, setExpandedPromptId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, r, b, p, d] = await Promise.all([
        fetchDashboard(30),
        fetchEvaluationRecords(20),
        fetchBadCases(),
        fetchPrompts(),
        fetchDatasets(),
      ]);
      setMetrics(m);
      setRecords(r);
      setBadCases(b);
      setPrompts(p);
      setDatasets(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(id);
  }, [refresh]);

  const handleSeed = async () => {
    setBusy(true);
    try {
      await seedPrompts();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleActivate = async (id: string) => {
    setBusy(true);
    try {
      await activatePrompt(id);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleResolve = async (id: string) => {
    setBusy(true);
    try {
      await updateBadCase(id, { status: "resolved" });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleRunDataset = async (id: string) => {
    setBusy(true);
    setDatasetResult("运行中…");
    try {
      const result = await runDataset(id);
      setDatasetResult(
        `${result.name}：通过 ${result.passed}/${result.total}（${pct(result.pass_rate)}）`,
      );
    } catch (e) {
      setDatasetResult(e instanceof Error ? e.message : "运行失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 items-center gap-3 border-b px-6">
        <Link href="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          返回对话
        </Link>
        <div className="ml-2 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h1 className="text-lg font-semibold">质量看板</h1>
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          第五阶段
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => void refresh()}
          disabled={loading || busy}
        >
          <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          刷新
        </Button>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        {error && <p className="text-sm text-red-600">{error}</p>}

        {metrics && (
          <section>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">近 {metrics.period_days} 天指标</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="智能体成功率" value={pct(metrics.agent_success_rate)} hint={`${metrics.success_runs}/${metrics.total_agent_runs}`} />
              <MetricCard label="幻觉率（高风险）" value={pct(metrics.hallucination_rate)} hint={`高风险 ${metrics.high_risk_count} · 中风险 ${metrics.medium_risk_count}`} />
              <MetricCard label="平均质量分" value={String(metrics.avg_evaluation_score)} hint={`审核 ${metrics.evaluation_count} 次`} />
              <MetricCard label="待处理问题" value={String(metrics.bad_case_open)} hint={`总计 ${metrics.bad_case_total}`} />
            </div>
          </section>
        )}

        {metrics && metrics.agent_stats.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">按智能体</h2>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">智能体</th>
                    <th className="px-3 py-2 font-medium">审核次数</th>
                    <th className="px-3 py-2 font-medium">均分</th>
                    <th className="px-3 py-2 font-medium">高风险</th>
                    <th className="px-3 py-2 font-medium">幻觉率</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.agent_stats.map((row) => (
                    <tr key={row.agent_name} className="border-b last:border-0">
                      <td className="px-3 py-2">{row.agent_name}</td>
                      <td className="px-3 py-2">{row.evaluations}</td>
                      <td className="px-3 py-2">{row.avg_score}</td>
                      <td className="px-3 py-2">{row.high_risk}</td>
                      <td className="px-3 py-2">{pct(row.hallucination_rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <div className="grid gap-8 lg:grid-cols-2">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">最近质检记录</h2>
            </div>
            <ul className="space-y-2">
              {records.length === 0 && <li className="text-sm text-muted-foreground">暂无记录</li>}
              {records.map((r) => (
                <li key={r.id} className="rounded-lg border px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.agent_name}</span>
                    <span className="text-muted-foreground">/{r.task_type}</span>
                    <span className={`ml-auto ${riskClass(r.risk_level)}`}>{r.risk_level}</span>
                    {r.score != null && <span className="text-muted-foreground">{r.score}</span>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                    {r.trace_id ? ` · trace ${r.trace_id.slice(0, 8)}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">问题案例</h2>
            <ul className="space-y-2">
              {badCases.length === 0 && <li className="text-sm text-muted-foreground">暂无问题案例</li>}
              {badCases.map((c) => (
                <li key={c.id} className="rounded-lg border px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{c.agent_name}</span>
                    <span className="text-xs text-muted-foreground">{c.problem_type}</span>
                    <span className="ml-auto text-xs">{c.status}</span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{c.description}</p>
                  {c.status === "open" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      disabled={busy}
                      onClick={() => void handleResolve(c.id)}
                    >
                      标记已解决
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">提示词版本</h2>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void handleSeed()}>
              同步文件提示词
            </Button>
            <span className="text-xs text-muted-foreground">
              点击「查看全文」可展开完整 prompt 内容
            </span>
          </div>
          <div className="space-y-3">
            {prompts.length === 0 && (
              <p className="rounded-lg border px-3 py-4 text-sm text-muted-foreground">
                暂无版本（若刚启动，点刷新或「同步文件提示词」）
              </p>
            )}
            {prompts.map((p) => {
              const open = expandedPromptId === p.id;
              const body = p.content || p.content_preview || "";
              return (
                <article key={p.id} className="overflow-hidden rounded-xl border bg-card">
                  <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{agentLabel(p.agent_name)}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.agent_name} · {p.version}
                      </p>
                    </div>
                    <span
                      className={
                        p.status === "active"
                          ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-700"
                          : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                      }
                    >
                      {statusLabel(p.status)}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setExpandedPromptId(open ? null : p.id)}
                    >
                      {open ? "收起" : "查看全文"}
                    </Button>
                    {p.status !== "active" && (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void handleActivate(p.id)}>
                        激活
                      </Button>
                    )}
                  </div>
                  {!open && body && (
                    <p className="border-t bg-muted/20 px-4 py-2.5 text-xs leading-relaxed text-muted-foreground line-clamp-2 whitespace-pre-wrap">
                      {body}
                    </p>
                  )}
                  {open && (
                    <pre className="max-h-[28rem] overflow-auto border-t bg-muted/30 px-4 py-3 text-[12px] leading-relaxed whitespace-pre-wrap break-words text-foreground">
                      {body || "（无内容）"}
                    </pre>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">评测数据集</h2>
          {datasetResult && <p className="mb-2 text-sm text-muted-foreground">{datasetResult}</p>}
          <ul className="space-y-2">
            {datasets.map((d) => (
              <li key={d.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{d.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.description} · {d.case_count} 条用例
                  </p>
                </div>
                <Button size="sm" disabled={busy} onClick={() => void handleRunDataset(d.id)}>
                  <Play className="mr-1 h-3.5 w-3.5" />
                  运行
                </Button>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

const AGENT_LABELS: Record<string, string> = {
  system: "系统提示词",
  master: "主路由",
  resume: "简历",
  job: "岗位 JD",
  interview: "面试",
  evaluation: "质检",
  memory: "记忆",
  career: "职业咨询",
  career_gap: "能力差距",
  recommendation: "下一步推荐",
};

function agentLabel(name: string): string {
  return AGENT_LABELS[name] || name;
}

function statusLabel(status: string): string {
  if (status === "active") return "生效中";
  if (status === "draft") return "草稿";
  if (status === "archived") return "已归档";
  return status;
}
