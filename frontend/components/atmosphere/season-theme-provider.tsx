"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  CALM_QUOTES,
  defaultSeasonByMonth,
  isSeason,
  SEASON_STORAGE_KEY,
  type Season,
} from "@/lib/season-theme";

const QUOTE_INTERVAL_MS = 3 * 60 * 1000;

type SeasonThemeContextValue = {
  season: Season;
  setSeason: (season: Season) => void;
  quote: string;
};

const SeasonThemeContext = createContext<SeasonThemeContextValue | null>(null);

export function SeasonThemeProvider({ children }: { children: ReactNode }) {
  const [season, setSeasonState] = useState<Season>("spring");
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const stored = localStorage.getItem(SEASON_STORAGE_KEY);
      setSeasonState(isSeason(stored) ? stored : defaultSeasonByMonth());
      setQuoteIndex(Math.floor(Math.random() * CALM_QUOTES.length));
      setReady(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.season = season;
    localStorage.setItem(SEASON_STORAGE_KEY, season);
  }, [ready, season]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setQuoteIndex((i) => (i + 1) % CALM_QUOTES.length);
    }, QUOTE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  const setSeason = useCallback((next: Season) => {
    setSeasonState(next);
  }, []);

  const value = useMemo(
    () => ({
      season,
      setSeason,
      quote: CALM_QUOTES[quoteIndex] ?? CALM_QUOTES[0],
    }),
    [season, setSeason, quoteIndex],
  );

  return (
    <SeasonThemeContext.Provider value={value}>{children}</SeasonThemeContext.Provider>
  );
}

export function useSeasonTheme() {
  const ctx = useContext(SeasonThemeContext);
  if (!ctx) {
    throw new Error("useSeasonTheme must be used within SeasonThemeProvider");
  }
  return ctx;
}
