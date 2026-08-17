import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

/** Escape a string for safe use inside RegExp. */
export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Split plain text and wrap query hits in <mark>.
 * `active` = current find result (stronger highlight).
 */
export function highlightPlainText(
  text: string,
  query: string,
  opts?: { active?: boolean; className?: string },
): ReactNode {
  const q = query.trim();
  if (!q || !text) return text;

  const re = new RegExp(`(${escapeRegExp(q)})`, "gi");
  const parts = text.split(re);
  if (parts.length === 1) return text;

  const qLower = q.toLowerCase();
  return parts.map((part, i) => {
    if (part.toLowerCase() !== qLower) return part;
    return (
      <mark
        key={`h-${i}`}
        data-find-hit={opts?.active ? "active" : "hit"}
        className={cn(
          "rounded-[3px] px-0.5 py-px font-medium not-italic",
          opts?.active
            ? "bg-amber-300/90 text-foreground shadow-[0_0_0_1px_rgba(217,119,6,0.35)]"
            : "bg-amber-200/70 text-foreground",
          opts?.className,
        )}
      >
        {part}
      </mark>
    );
  });
}

/** Recursively highlight string leaves inside React children (for markdown trees). */
export function highlightReactChildren(
  children: ReactNode,
  query: string,
  opts?: { active?: boolean },
): ReactNode {
  const q = query.trim();
  if (!q) return children;

  return Children.map(children, (child) => {
    if (typeof child === "string") {
      return highlightPlainText(child, q, opts);
    }
    if (typeof child === "number") {
      return highlightPlainText(String(child), q, opts);
    }
    if (Array.isArray(child)) {
      return highlightReactChildren(child, q, opts);
    }
    if (isValidElement(child)) {
      const el = child as ReactElement<{ children?: ReactNode }>;
      if (el.props.children == null) return child;
      return cloneElement(el, {
        children: highlightReactChildren(el.props.children, q, opts),
      });
    }
    return child;
  });
}
