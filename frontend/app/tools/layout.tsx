import type { ReactNode } from "react";
import Link from "next/link";

import { CalmQuote } from "@/components/atmosphere/calm-quote";
import { SeasonSwitcher } from "@/components/atmosphere/season-switcher";
import { FeatureSidebar } from "@/components/layout/feature-sidebar";
import { ToolsAiInit } from "@/components/tools/tools-ai-init";

export default function ToolsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="atmosphere-shell flex h-screen flex-col overflow-hidden">
      <ToolsAiInit />
      <header className="atmosphere-panel relative flex h-12 shrink-0 items-center gap-2 border-b px-3 sm:gap-3 sm:px-5">
        <Link href="/" className="flex items-center gap-2">
          <h1 className="shrink-0 font-[family-name:var(--font-quote)] text-base font-semibold tracking-wide sm:text-[17px]">职小伴</h1>
          <span className="hidden shrink-0 rounded-full bg-muted/80 px-2 py-0.5 text-[11px] text-muted-foreground lg:inline">职业智能</span>
        </Link>

        <CalmQuote className="mx-2 hidden min-w-0 flex-1 truncate text-left md:block lg:mx-4 lg:text-center" />

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
          <SeasonSwitcher className="mr-0.5" />
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="hidden h-full shrink-0 overflow-hidden md:block">
          <FeatureSidebar className="h-full" />
        </div>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex w-full flex-col px-12 py-8 max-lg:px-6 max-lg:pt-6 max-lg:pb-16">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
