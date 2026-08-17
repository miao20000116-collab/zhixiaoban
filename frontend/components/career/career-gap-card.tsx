"use client";

import type { CareerGapResult } from "@/types";

interface CareerGapCardProps {
  gap: CareerGapResult | null | undefined;
  compact?: boolean;
  onAnalyze?: () => void;
  analyzing?: boolean;
}

function evidenceLine(
  items?: Array<{ claim?: string; source?: string; source_type?: string }>,
): string | null {
  if (!items?.length) return null;
  const first = items[0];
  const src = first.source || first.source_type;
  if (!src && !first.claim) return null;
  return [first.claim, src ? `来源：${src}` : null].filter(Boolean).join(" · ");
}

export function CareerGapCard({ gap, compact = false, onAnalyze, analyzing }: CareerGapCardProps) {
  if (!gap) {
    return (
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className={compact ? "text-xs font-medium text-muted-foreground" : "text-sm font-medium"}>
            职业差距分析
          </h3>
          {onAnalyze && (
            <button
              type="button"
              disabled={analyzing}
              onClick={onAnalyze}
              className="text-[11px] text-muted-foreground underline hover:text-foreground disabled:opacity-50"
            >
              {analyzing ? "分析中..." : "立即分析"}
            </button>
          )}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          告诉我目标岗位或上传 JD，我会对比你的画像与岗位要求，标出优势、缺口和下一步。
        </p>
      </section>
    );
  }

  const score = Math.round(Number(gap.match_score) || 0);
  const evalRisk = gap.evaluation?.["risk_level"];
  const notApplicable =
    evalRisk === "not_applicable" ||
    (!gap.strengths?.length && !gap.gaps?.length && score <= 0);
  const strengths = gap.strengths?.slice(0, compact ? 2 : 4) ?? [];
  const gaps = gap.gaps?.slice(0, compact ? 2 : 4) ?? [];
  const recs = gap.recommendations?.slice(0, compact ? 2 : 4) ?? [];

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className={compact ? "text-xs font-medium text-muted-foreground" : "text-sm font-medium"}>
            职业差距分析
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            当前目标岗位：
            {[gap.target_position, gap.company].filter(Boolean).join(" · ") || "未设定"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-semibold tabular-nums">
            {notApplicable ? "—" : `${score}%`}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {notApplicable ? "暂不评分" : "综合匹配"}
          </p>
        </div>
      </div>

      {gap.summary && !compact && (
        <p className="text-sm leading-relaxed text-muted-foreground">{gap.summary}</p>
      )}

      {strengths.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-muted-foreground">优势</p>
          <ul className="mt-1.5 space-y-1.5">
            {strengths.map((s, i) => {
              const ev = evidenceLine(s.evidence);
              return (
                <li key={`${s.title}-${i}`} className="text-xs leading-relaxed">
                  <span>· {s.title}</span>
                  {(s.reason || ev) && (
                    <span className="mt-0.5 block pl-2 text-[11px] text-muted-foreground">
                      {s.reason || ev}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {gaps.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-muted-foreground">能力缺口</p>
          <ul className="mt-1.5 space-y-1.5">
            {gaps.map((g, i) => {
              const ev = evidenceLine(g.evidence);
              return (
                <li key={`${g.title}-${i}`} className="text-xs leading-relaxed">
                  <span>· {g.title}</span>
                  <span className="mt-0.5 block pl-2 text-[11px] text-muted-foreground">
                    {g.reason}
                    {ev ? ` · ${ev}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {recs.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-muted-foreground">建议</p>
          <ul className="mt-1.5 space-y-1.5">
            {recs.map((r, i) => (
              <li key={`${r.action}-${i}`} className="text-xs leading-relaxed">
                · {r.action}
                {r.why && (
                  <span className="mt-0.5 block pl-2 text-[11px] text-muted-foreground">
                    为什么：{r.why}
                    {r.priority ? ` · ${r.priority}` : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!compact && gap.evidence && gap.evidence.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-muted-foreground">来源依据</p>
          <ul className="mt-1.5 space-y-1">
            {gap.evidence.slice(0, 4).map((e, i) => (
              <li key={`${e.source}-${i}`} className="text-[11px] leading-relaxed text-muted-foreground">
                · {e.claim}
                {e.source ? `（${e.source}）` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {onAnalyze && (
        <button
          type="button"
          disabled={analyzing}
          onClick={onAnalyze}
          className="text-[11px] text-muted-foreground underline hover:text-foreground disabled:opacity-50"
        >
          {analyzing ? "重新分析中..." : "重新分析"}
        </button>
      )}
    </section>
  );
}
