"use client";

import { useCallback, useEffect, useRef, type PointerEvent } from "react";

import { cn } from "@/lib/utils";

interface ResizeHandleProps {
  /** Which edge is being dragged relative to the panel being resized. */
  side: "left" | "right";
  value: number;
  min: number;
  max: number;
  onChange: (width: number) => void;
  className?: string;
}

/**
 * Thin drag handle. `side: "left"` means the handle sits on the left edge of a
 * panel (dragging right increases width). `side: "right"` is the opposite.
 */
export function ResizeHandle({
  side,
  value,
  min,
  max,
  onChange,
  className,
}: ResizeHandleProps) {
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startWidth.current = value;
      e.currentTarget.setPointerCapture(e.pointerId);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [value],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      const delta = e.clientX - startX.current;
      const next =
        side === "right" ? startWidth.current + delta : startWidth.current - delta;
      onChange(Math.min(max, Math.max(min, Math.round(next))));
    },
    [max, min, onChange, side],
  );

  const endDrag = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // already released
    }
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 24 : 8;
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onChange(side === "right" ? value - step : value + step);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          onChange(side === "right" ? value + step : value - step);
        }
      }}
      className={cn(
        "group relative z-10 w-1 shrink-0 cursor-col-resize touch-none bg-transparent",
        "hover:bg-border active:bg-primary/40",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className,
      )}
      title="拖拽调整宽度"
    >
      <span className="pointer-events-none absolute inset-y-0 -left-1 -right-1" />
    </div>
  );
}
