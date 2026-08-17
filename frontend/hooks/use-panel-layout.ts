"use client";

import { useCallback, useEffect, useState } from "react";

/** Layout priority: Center > Left > Right (profile is least important). */
export const PANEL = {
  left: { min: 180, max: 300, default: 240 },
  right: { min: 240, max: 400, default: 288 },
} as const;

/**
 * Breakpoints (px)
 * - < 768:  chat only; left as drawer; right hidden
 * - 768–1199: left + chat; right auto-hidden (user can reopen)
 * - ≥ 1200: three columns; right visible by default
 */
export const BREAKPOINTS = {
  mobile: 768,
  hideRight: 1200,
  compactLeft: 1100,
} as const;

const STORAGE_KEY = "ai-career.panel-layout.v1";

type StoredLayout = {
  leftWidth: number;
  rightWidth: number;
  /** User preference when viewport is wide enough for a right column. */
  rightPreferredOpen: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function readStored(): Partial<StoredLayout> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<StoredLayout>;
  } catch {
    return {};
  }
}

function writeStored(next: StoredLayout) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function defaultLeftWidth(viewport: number) {
  return viewport < BREAKPOINTS.compactLeft ? 200 : PANEL.left.default;
}

export function usePanelLayout() {
  const [viewport, setViewport] = useState(1400);
  const [leftWidth, setLeftWidthState] = useState<number>(PANEL.left.default);
  const [rightWidth, setRightWidthState] = useState<number>(PANEL.right.default);
  const [rightPreferredOpen, setRightPreferredOpen] = useState(true);
  const [rightForcedOpen, setRightForcedOpen] = useState(false);
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const isMobile = viewport < BREAKPOINTS.mobile;
  const isNarrowForRight = viewport < BREAKPOINTS.hideRight;

  // Right visibility: least priority
  // - mobile: never
  // - mid: only if user explicitly toggled open this session (rightForcedOpen)
  // - wide: follow preference
  const rightOpen = isMobile
    ? false
    : isNarrowForRight
      ? rightForcedOpen
      : rightPreferredOpen;

  useEffect(() => {
    window.setTimeout(() => {
      const stored = readStored();
      const w = window.innerWidth;
      setViewport(w);
      setLeftWidthState(
        clamp(stored.leftWidth ?? defaultLeftWidth(w), PANEL.left.min, PANEL.left.max),
      );
      setRightWidthState(
        clamp(stored.rightWidth ?? PANEL.right.default, PANEL.right.min, PANEL.right.max),
      );
      setRightPreferredOpen(stored.rightPreferredOpen ?? true);
      setRightForcedOpen(false);
      setHydrated(true);
    }, 0);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeStored({
      leftWidth,
      rightWidth,
      rightPreferredOpen,
    });
  }, [hydrated, leftWidth, rightWidth, rightPreferredOpen]);

  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      setViewport((prev) => {
        if (prev >= BREAKPOINTS.hideRight && w < BREAKPOINTS.hideRight) {
          setRightForcedOpen(false);
        }
        if (prev >= BREAKPOINTS.mobile && w < BREAKPOINTS.mobile) {
          setLeftDrawerOpen(false);
          setRightForcedOpen(false);
        }
        return w;
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const setLeftWidth = useCallback((w: number) => {
    setLeftWidthState(clamp(Math.round(w), PANEL.left.min, PANEL.left.max));
  }, []);

  const setRightWidth = useCallback((w: number) => {
    setRightWidthState(clamp(Math.round(w), PANEL.right.min, PANEL.right.max));
  }, []);

  const toggleRight = useCallback(() => {
    if (isMobile) return;
    if (isNarrowForRight) {
      setRightForcedOpen((v) => !v);
    } else {
      setRightPreferredOpen((v) => !v);
    }
  }, [isMobile, isNarrowForRight]);

  const toggleLeftDrawer = useCallback(() => {
    setLeftDrawerOpen((v) => !v);
  }, []);

  return {
    hydrated,
    isMobile,
    isNarrowForRight,
    leftWidth,
    rightWidth,
    rightOpen,
    leftDrawerOpen,
    setLeftWidth,
    setRightWidth,
    toggleRight,
    setLeftDrawerOpen,
    toggleLeftDrawer,
    leftLimits: PANEL.left,
    rightLimits: PANEL.right,
  };
}
