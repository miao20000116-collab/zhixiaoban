const STORAGE_KEY = "ai_api_keys";
const LEGACY_STORAGE_KEY = "tool_ai_api_keys";

export interface ToolApiKeyConfig {
  zhipu: string;
  siliconflow: string;
  doubao: string;
  deepseek: string;
}

const defaultKeys: ToolApiKeyConfig = {
  zhipu: "",
  siliconflow: "",
  doubao: "",
  deepseek: "",
};

function migrateLegacyKeys(): ToolApiKeyConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacy) return null;
    const parsed = JSON.parse(legacy);
    window.localStorage.setItem(STORAGE_KEY, legacy);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    return {
      zhipu: parsed.zhipu || "",
      siliconflow: parsed.siliconflow || "",
      doubao: parsed.doubao || "",
      deepseek: parsed.deepseek || "",
    };
  } catch {
    return null;
  }
}

export function getUserApiKeys(): ToolApiKeyConfig {
  if (typeof window === "undefined") return { ...defaultKeys };
  const migrated = migrateLegacyKeys();
  if (migrated) return migrated;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultKeys };
    const parsed = JSON.parse(raw);
    return {
      zhipu: parsed.zhipu || "",
      siliconflow: parsed.siliconflow || "",
      doubao: parsed.doubao || "",
      deepseek: parsed.deepseek || "",
    };
  } catch {
    return { ...defaultKeys };
  }
}

export function saveUserApiKeys(keys: ToolApiKeyConfig) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

export function clearUserApiKeys() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function getApiKey(provider: keyof ToolApiKeyConfig) {
  return getUserApiKeys()[provider] || "";
}

export type ServerProviderStatus = {
  configured: boolean;
  source: "server" | "browser";
  label: string;
  masked?: string;
  base?: string;
  model?: string;
};

export type ToolsAiConfig = {
  models: Array<{ id: string; name: string; desc: string; serverProvider?: string | null }>;
  providers: Record<string, ServerProviderStatus>;
  defaultModel: string;
  taskLabels: Record<string, string>;
  defaultTaskModels: Record<string, string>;
  storageKey: string;
  serverKeysEnabled: boolean;
};

let cachedServerConfig: ToolsAiConfig | null = null;

export function getCachedToolsAiConfig() {
  return cachedServerConfig;
}

export function isServerKeysEnabled() {
  return cachedServerConfig?.serverKeysEnabled ?? false;
}

export function isServerProviderConfigured(provider: keyof ToolApiKeyConfig) {
  return cachedServerConfig?.providers?.[provider]?.configured ?? false;
}

export async function fetchToolsAiConfig(): Promise<ToolsAiConfig | null> {
  try {
    const { API_URL, jsonHeaders } = await import("@/services/api");
    const response = await fetch(`${API_URL}/api/tools/ai-config`, { headers: jsonHeaders() });
    if (!response.ok) return cachedServerConfig;
    cachedServerConfig = (await response.json()) as ToolsAiConfig;
    return cachedServerConfig;
  } catch {
    return cachedServerConfig;
  }
}

/** Whether browser-side key exists for a provider (optional override). */
export function hasBrowserApiKey(provider: keyof ToolApiKeyConfig) {
  return !!getApiKey(provider);
}
