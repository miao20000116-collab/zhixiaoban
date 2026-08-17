function resolveApiUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim() || "";
  if (typeof window === "undefined") {
    return configured || "http://127.0.0.1:8000";
  }
  // Local Next → FastAPI via rewrite (avoids CORS / Failed to fetch flakes).
  if (
    !configured ||
    configured.includes("localhost") ||
    configured.includes("127.0.0.1")
  ) {
    return "/backend-api";
  }
  return configured;
}

const API_URL = resolveApiUrl();
const USER_STORAGE_KEY = "ai-career.guest-user.v1";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ApiDetailObject = {
  code?: string;
  message?: string;
  msg?: string;
};

function getGuestUserId(): string {
  if (typeof window === "undefined") return "server-render";
  try {
    const existing = localStorage.getItem(USER_STORAGE_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const value = `guest-${id}`;
    localStorage.setItem(USER_STORAGE_KEY, value);
    return value;
  } catch {
    return "guest-fallback";
  }
}

export function apiHeaders(extra?: HeadersInit): HeadersInit {
  return {
    "X-Test-User": getGuestUserId(),
    ...(extra || {}),
  };
}

export function jsonHeaders(extra?: HeadersInit): HeadersInit {
  return apiHeaders({
    "Content-Type": "application/json",
    ...(extra || {}),
  });
}

/** Extract a human-readable message from FastAPI / plain error bodies. */
export async function readApiError(
  response: Response,
  fallback: string,
): Promise<{ message: string; code?: string }> {
  const raw = (await response.text()).trim();
  if (!raw) return { message: fallback };
  try {
    const parsed = JSON.parse(raw) as { detail?: unknown };
    const detail = parsed.detail;
    if (typeof detail === "string" && detail.trim()) {
      return { message: detail };
    }
    if (detail && typeof detail === "object" && !Array.isArray(detail)) {
      const obj = detail as ApiDetailObject;
      const message = obj.message || obj.msg || fallback;
      return { message, code: obj.code };
    }
    if (Array.isArray(detail)) {
      const parts = detail
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object" && "msg" in item) {
            return String((item as { msg: unknown }).msg);
          }
          return "";
        })
        .filter(Boolean);
      if (parts.length) return { message: parts.join("；") };
    }
  } catch {
    // not JSON — use raw text
  }
  return { message: raw };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: jsonHeaders(options?.headers),
    ...options,
  });

  if (!response.ok) {
    const err = await readApiError(response, response.statusText);
    throw new ApiError(err.message, response.status, err.code);
  }

  return response.json() as Promise<T>;
}

export async function healthCheck(): Promise<{ status: string; service: string }> {
  return request("/api/health");
}

export { API_URL };

/** Same-origin media URL for local dev (avoids localhost vs 127.0.0.1 audio load failures). */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const raw = url.trim();
  if (raw.startsWith("/")) return `${API_URL}${raw}`;
  try {
    const parsed = new URL(raw);
    if (parsed.pathname.startsWith("/media/")) {
      return `${API_URL}${parsed.pathname}`;
    }
  } catch {
    // keep absolute third-party URLs as-is
  }
  return raw;
}
