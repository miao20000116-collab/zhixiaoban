"use client";

import { SEASONS } from "@/lib/season-theme";
import { useSeasonTheme } from "@/components/atmosphere/season-theme-provider";
import { cn } from "@/lib/utils";

export function SeasonSwitcher({ className }: { className?: string }) {
  const { season, setSeason } = useSeasonTheme();

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-[color:var(--season-border)] bg-[color:var(--season-panel)]/70 p-0.5 backdrop-blur-sm",
        className,
      )}
      role="radiogroup"
      aria-label="季节氛围"
    >
      {SEASONS.map((item) => {
        const active = season === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={item.hint}
            onClick={() => setSeason(item.id)}
            className={cn(
              "min-w-8 rounded-full px-2.5 py-1 text-xs tracking-wide transition-all duration-300",
              active
                ? "bg-[color:var(--season-accent)] text-[color:var(--season-accent-fg)] shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
