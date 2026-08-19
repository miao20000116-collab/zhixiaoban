"use client";

import { useEffect } from "react";

import { seedDemoPersonaIfNeeded } from "@/lib/seed-demo-persona";
import { fetchToolsAiConfig } from "@/lib/tool-api-keys";

/** Prefetch server AI config so detectAIMode / server proxy work without opening settings. */
export function ToolsAiInit() {
  useEffect(() => {
    void fetchToolsAiConfig();
    void seedDemoPersonaIfNeeded();
  }, []);

  return null;
}
