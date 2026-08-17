"use client";

import { useEffect, useState } from "react";

import { useSeasonTheme } from "@/components/atmosphere/season-theme-provider";
import { cn } from "@/lib/utils";

export function CalmQuote({ className }: { className?: string }) {
  const { quote } = useSeasonTheme();
  const [visible, setVisible] = useState(true);
  const [shown, setShown] = useState(quote);

  useEffect(() => {
    if (quote === shown) return;
    const hide = window.setTimeout(() => {
      setVisible(false);
    }, 0);
    const t = window.setTimeout(() => {
      setShown(quote);
      setVisible(true);
    }, 320);
    return () => {
      window.clearTimeout(hide);
      window.clearTimeout(t);
    };
  }, [quote, shown]);

  return (
    <p
      className={cn(
        "font-[family-name:var(--font-quote)] text-[12px] leading-relaxed tracking-[0.03em] text-[color:var(--season-quote)]/90 transition-opacity duration-300 sm:text-[13px]",
        visible ? "opacity-100" : "opacity-0",
        className,
      )}
      aria-live="polite"
    >
      {shown}
    </p>
  );
}
