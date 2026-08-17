"use client";

import { cn } from "@/lib/utils";
import type { FollowUpChip } from "@/lib/follow-up-suggestions";

interface FollowUpChipsProps {
  chips: FollowUpChip[];
  onSelect: (message: string) => void;
  disabled?: boolean;
  className?: string;
}

/** Quiet next-step guides — same tone as assistant bubbles, no extra color blocks. */
export function FollowUpChips({
  chips,
  onSelect,
  disabled,
  className,
}: FollowUpChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div
      className={cn(
        "mt-2.5 flex max-w-[min(100%,42rem)] flex-wrap gap-1.5 pl-0.5",
        className,
      )}
    >
      {chips.map((chip) => (
        <button
          key={`${chip.label}-${chip.message.slice(0, 16)}`}
          type="button"
          disabled={disabled}
          title={chip.message}
          onClick={() => onSelect(chip.message)}
          className={cn(
            "max-w-full rounded-full border border-[color:var(--season-border)]",
            "bg-[color:var(--season-panel)] px-3 py-1.5 text-left text-[12px] leading-snug",
            "text-muted-foreground transition-colors",
            "hover:border-foreground/15 hover:bg-[color:var(--season-panel)] hover:text-foreground",
            "disabled:pointer-events-none disabled:opacity-45",
          )}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
