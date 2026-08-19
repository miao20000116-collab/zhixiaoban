"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold tracking-tight text-text-primary">{title}</h2>
      {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
    </div>
  );
}

export function ListSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="mb-3 text-[14px] font-medium text-[#222]">{title}</h3>
      <ul className="space-y-2">
        {items.map((item, idx) => (
          <li key={idx} className="flex items-start gap-2 text-[14px] text-[#666]">
            <span className="mt-1 shrink-0 text-brand">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function KeywordTags({ keywords }: { keywords: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {keywords.map((kw) => (
        <span key={kw} className="rounded-full border border-border bg-page-bg px-2.5 py-1 text-xs text-text-secondary">
          {kw}
        </span>
      ))}
    </div>
  );
}

export function EvidenceBadge({ strength }: { strength: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    strong: { label: "强", cls: "bg-green-100 text-green-700" },
    medium: { label: "中", cls: "bg-blue-100 text-blue-700" },
    weak: { label: "弱", cls: "bg-amber-100 text-amber-700" },
    none: { label: "无", cls: "bg-gray-100 text-gray-500" },
  };
  const item = map[strength] || map.none;
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", item.cls)}>{item.label}</span>;
}

export function ScoreRing({ score, size = "lg" }: { score: number; size?: "sm" | "lg" }) {
  const circumference = 2 * Math.PI * 15.5;
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const dashOffset = circumference * (1 - clamped / 100);
  const ringColor = clamped >= 70 ? "#22c55e" : clamped >= 50 ? "#f59e0b" : "#ef4444";
  const textColor = clamped >= 70 ? "#16a34a" : clamped >= 50 ? "#d97706" : "#dc2626";

  return (
    <div className={cn("flex flex-col items-center justify-center", size === "lg" ? "h-40 w-40" : "h-24 w-24")}>
      <div className={cn("relative", size === "lg" ? "h-32 w-32" : "h-20 w-20")}>
        <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e5e7eb" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            stroke={ringColor}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("font-bold", size === "lg" ? "text-3xl" : "text-xl")} style={{ color: textColor }}>
            {clamped}
          </span>
          {size === "lg" && <span className="mt-0.5 text-xs text-text-secondary">匹配度</span>}
        </div>
      </div>
    </div>
  );
}

export function StepNav({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex justify-end gap-2">{children}</div>;
}

export function importanceClass(imp: string) {
  if (imp === "high") return "bg-red-100 text-red-700";
  if (imp === "medium") return "bg-amber-100 text-amber-700";
  return "bg-gray-100 text-gray-500";
}

export function importanceLabel(imp: string) {
  if (imp === "high") return "高";
  if (imp === "medium") return "中";
  return "低";
}

export function scoreTextClass(score: number) {
  if (score >= 70) return "text-green-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-600";
}

export function scoreBarClass(score: number) {
  if (score >= 70) return "bg-green-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-red-500";
}
