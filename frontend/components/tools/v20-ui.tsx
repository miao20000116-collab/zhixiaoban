"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function V20PageHeader({
  title,
  description,
  extra,
}: {
  title: string;
  description?: string;
  extra?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <div>
        <h1 className="text-[24px] font-semibold text-text-primary">{title}</h1>
        {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
      </div>
      {extra}
    </div>
  );
}

export function V20Card({
  children,
  className,
  padding = true,
}: {
  children: ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[8px] border border-border bg-white shadow-[0_1px_8px_rgba(0,0,0,0.06)]",
        padding && "p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function V20Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-brand text-white hover:bg-brand-hover",
    outline: "border border-brand text-brand hover:bg-brand/5",
    ghost: "border border-border text-text-secondary hover:border-brand hover:text-brand",
    danger: "border border-border text-text-secondary hover:border-red-300 hover:text-red-500",
  }[variant];
  return (
    <button
      type="button"
      className={cn(
        "rounded-[6px] px-[18px] py-2 text-sm disabled:opacity-50",
        styles,
        className,
      )}
      {...props}
    />
  );
}

export function V20Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-[6px] border border-border bg-white p-3 text-[14px] text-text-primary outline-none focus:border-brand",
        props.className,
      )}
    />
  );
}

export function V20Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full resize-y rounded-[6px] border border-border bg-white p-3 text-[14px] leading-relaxed text-text-primary outline-none focus:border-brand",
        props.className,
      )}
    />
  );
}

export function V20Select(props: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      {...props}
      className={cn(
        "w-full rounded-[6px] border border-border bg-white p-3 text-[14px] text-text-primary outline-none focus:border-brand",
        props.className,
      )}
    />
  );
}

export function V20Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-text-secondary">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-brand" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function V20Empty({ icon, children }: { icon?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center py-12 text-center">
      {icon && <p className="mb-4 text-5xl">{icon}</p>}
      <div className="text-sm text-text-secondary">{children}</div>
    </div>
  );
}

export function V20ContextPanel({
  task,
  inputs,
  missing,
  risks,
  actions,
}: {
  task?: string;
  inputs?: { label: string; provided: boolean }[];
  missing?: string[];
  risks?: string[];
  actions?: { label: string; href?: string; onClick?: () => void }[];
}) {
  return (
    <div className="rounded-[8px] border border-border bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
      <div className="border-b border-border px-4 py-3">
        <span className="text-sm font-medium text-text-primary">上下文建议</span>
      </div>
      <div className="space-y-4 px-4 py-3">
        {task && (
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[11px] text-text-secondary">当前任务</span>
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] text-brand">{task}</span>
          </div>
        )}
        {inputs && inputs.length > 0 && (
          <div>
            <div className="mb-1.5 text-[11px] text-text-secondary">已有输入</div>
            <div className="flex flex-wrap gap-1.5">
              {inputs.map((item) => (
                <span
                  key={item.label}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px]",
                    item.provided
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-border bg-page-bg text-text-secondary",
                  )}
                >
                  {item.label}
                  {item.provided ? " · 已提供" : " · 未提供"}
                </span>
              ))}
            </div>
          </div>
        )}
        {missing && missing.length > 0 && (
          <div>
            <div className="mb-1.5 text-[11px] text-text-secondary">缺失信息</div>
            <ul className="space-y-1">
              {missing.map((item) => (
                <li key={item} className="text-[12px] text-text-secondary">
                  - {item}
                </li>
              ))}
            </ul>
          </div>
        )}
        {risks && risks.length > 0 && (
          <div>
            <div className="mb-1.5 text-[11px] text-text-secondary">风险提醒</div>
            <ul className="space-y-1">
              {risks.map((item) => (
                <li key={item} className="text-[12px] text-amber-700">
                  - {item}
                </li>
              ))}
            </ul>
          </div>
        )}
        {actions && actions.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-2">
            {actions.map((action) =>
              action.href ? (
                <Link
                  key={action.label}
                  href={action.href}
                  className="rounded-[6px] border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-brand hover:text-brand"
                >
                  {action.label}
                </Link>
              ) : (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className="rounded-[6px] border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-brand hover:text-brand"
                >
                  {action.label}
                </button>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function V20Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-brand hover:underline">
      {children}
    </Link>
  );
}
