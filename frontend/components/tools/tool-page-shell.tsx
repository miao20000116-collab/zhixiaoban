"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Settings2 } from "lucide-react";

import { FeatureSidebar } from "@/components/layout/feature-sidebar";
import { cn } from "@/lib/utils";

export function ToolPageShell({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-screen bg-background", className)}>
      <div className="hidden md:block">
        <FeatureSidebar />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b px-6">
          <Link href="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            返回小伴 Agent
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">{title}</h1>
            {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/tools/settings"
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Settings2 className="h-4 w-4" />
              <span className="hidden sm:inline">工具设置</span>
            </Link>
            {actions}
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}

export function ToolCard({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border bg-card p-5 shadow-sm", className)}>
      {(title || description) && (
        <div className="mb-4">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}
