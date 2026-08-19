"use client";

import { priorityClass, type ScriptQAPair } from "@/lib/script-qa-types";

type ScriptQACardProps = {
  qa: ScriptQAPair;
  index: number;
  selected?: boolean;
  onSelect?: (checked: boolean) => void;
  onCopy?: () => void;
  onGenerate?: () => void;
  onOptimize?: () => void;
  generateDisabled?: boolean;
  showActions?: boolean;
};

export function ScriptQACard({
  qa,
  index,
  selected,
  onSelect,
  onCopy,
  onGenerate,
  onOptimize,
  generateDisabled,
  showActions = true,
}: ScriptQACardProps) {
  const displayAnswer = qa.optimizedAnswer || (qa.answer?.trim() ? qa.answer : "");
  const hasFramework = Boolean(qa.structure?.trim());
  const hasFullAnswer = Boolean(qa.answer?.trim());
  const needsGenerate = hasFramework && !hasFullAnswer && !qa.optimizedAnswer;

  return (
    <div className="overflow-hidden rounded-[8px] border border-border bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
        {onSelect && (
          <input type="checkbox" className="h-4 w-4 accent-brand" checked={selected} onChange={(e) => onSelect(e.target.checked)} />
        )}
        <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] text-brand">{qa.type || "逐字稿"}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${priorityClass(qa.priority || "中")}`}>
          优先级 {qa.priority || "中"}
        </span>
        <span className="text-[11px] text-text-secondary">来源 {qa.source || "逐字稿"}</span>
        {qa.title && <span className="text-[11px] font-medium text-text-primary">{qa.title}</span>}
        <div className="flex-1" />
        {onCopy && (
          <button type="button" className="text-[11px] text-text-secondary hover:text-brand" onClick={onCopy}>
            复制
          </button>
        )}
      </div>
      <div className="space-y-3 px-5 py-3">
        <div>
          <p className="text-[14px] font-medium leading-relaxed text-text-primary">{qa.question || `问题 ${index + 1}`}</p>
          {qa.why && <p className="mt-1.5 text-[12px] leading-relaxed text-text-secondary">为什么会问：{qa.why}</p>}
        </div>
        {hasFramework && (
          <div className="rounded-[6px] bg-page-bg px-3 py-2.5">
            <p className="mb-1 text-[11px] text-text-secondary">回答框架（点名你的经历）</p>
            <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-text-primary">{qa.structure}</p>
          </div>
        )}
        {qa.followUp && <p className="text-[12px] leading-relaxed text-amber-700">可能追问：{qa.followUp}</p>}
        {hasFullAnswer && (
          <div className="rounded-[6px] border border-border/70 px-3 py-2.5">
            <p className="mb-1 text-[11px] text-text-secondary">完整回答</p>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-text-primary">{qa.answer}</p>
          </div>
        )}
        {qa.optimizedAnswer && (
          <div className="border-t border-border pt-3">
            <p className="mb-1.5 text-[11px] font-medium text-brand">优化版回答（基于简历）</p>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-text-primary">{qa.optimizedAnswer}</p>
          </div>
        )}
        {showActions && (
          <div className="flex flex-wrap gap-2 pt-1">
            {onGenerate && (
              <button
                type="button"
                disabled={generateDisabled}
                className={`rounded-[6px] px-3 py-1.5 text-xs disabled:opacity-50 ${
                  needsGenerate
                    ? "bg-brand text-white hover:bg-brand-hover"
                    : "border border-border text-text-secondary hover:border-brand hover:text-brand"
                }`}
                onClick={onGenerate}
              >
                {qa.generating ? "生成中..." : hasFullAnswer ? "重新生成回答" : "生成完整回答"}
              </button>
            )}
            {onOptimize && (
              <button
                type="button"
                disabled={generateDisabled}
                className="rounded-[6px] border border-brand/30 bg-brand/5 px-3 py-1.5 text-xs text-brand hover:bg-brand/10 disabled:opacity-50"
                onClick={onOptimize}
              >
                {qa.generating ? "优化中..." : "根据简历优化"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
