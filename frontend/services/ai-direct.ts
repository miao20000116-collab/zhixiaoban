"use client";

import { getCurrentModel, getModelForTask } from "@/lib/ai-model-settings";
import {
  fetchToolsAiConfig,
  getApiKey,
  isServerProviderConfigured,
} from "@/lib/tool-api-keys";
import { API_URL, jsonHeaders } from "@/services/api";

type Message = { role: string; content: string };

type ProviderConfig = {
  directEndpoint: string;
  model: string;
  name: string;
  providerKey: "zhipu" | "siliconflow" | "doubao" | "deepseek";
  serverModel?: string;
};

const PROVIDERS: Record<string, ProviderConfig> = {
  "zhipu-glm4-flash": {
    directEndpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    model: "glm-4-flash",
    name: "智谱 GLM-4-Flash",
    providerKey: "zhipu",
  },
  "siliconflow-deepseek": {
    directEndpoint: "https://api.siliconflow.cn/v1/chat/completions",
    model: "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",
    name: "硅基流动 DeepSeek-R1",
    providerKey: "siliconflow",
    serverModel: "siliconflow-deepseek",
  },
  doubao: {
    directEndpoint: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    model: "doubao-lite-128k",
    name: "豆包 Lite",
    providerKey: "doubao",
  },
  "deepseek-v4-flash": {
    directEndpoint: "https://api.deepseek.com/v1/chat/completions",
    model: "deepseek-chat",
    name: "DeepSeek",
    providerKey: "deepseek",
    serverModel: "deepseek-v4-flash",
  },
};

const FALLBACK_CHAIN = ["deepseek-v4-flash", "zhipu-glm4-flash", "siliconflow-deepseek", "doubao"];

export interface AIGenerateOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  signal?: AbortSignal;
  task?: string;
}

export interface ChatResult {
  content: string;
  provider: string;
  fallback: boolean;
  source?: "server" | "browser";
}

async function ensureServerConfig() {
  await fetchToolsAiConfig();
}

async function callServerProxy(
  modelKey: string,
  messages: Message[],
  options: AIGenerateOptions,
): Promise<ChatResult | null> {
  const config = PROVIDERS[modelKey];
  if (!config?.serverModel) return null;
  if (!isServerProviderConfigured(config.providerKey)) return null;

  const response = await fetch(`${API_URL}/api/tools/chat`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      model: config.serverModel,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: Math.min(Math.max(options.max_tokens ?? 4096, 256), 32768),
    }),
    signal: options.signal,
  });

  if (response.status === 501) return null;
  if (!response.ok) {
    const text = await response.text();
    let detail = text.slice(0, 240);
    try {
      const parsed = JSON.parse(text) as { detail?: string | Array<{ msg?: string }> };
      if (typeof parsed.detail === "string") detail = parsed.detail;
      else if (Array.isArray(parsed.detail)) {
        detail = parsed.detail.map((item) => item.msg || "").filter(Boolean).join("；") || detail;
      }
    } catch {
      // keep raw text slice
    }
    throw new Error(`服务端 AI 请求失败 (${response.status})${detail ? `: ${detail}` : ""}`);
  }

  const data = (await response.json()) as { content: string; provider: string; source?: string };
  return {
    content: data.content,
    provider: data.provider,
    fallback: false,
    source: "server",
  };
}

async function callProviderDirect(modelKey: string, messages: Message[], options: AIGenerateOptions) {
  const config = PROVIDERS[modelKey];
  if (!config) throw new Error(`未知模型: ${modelKey}`);

  const apiKey = getApiKey(config.providerKey);
  if (!apiKey) return null;

  const response = await fetch(config.directEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 4096,
      stream: Boolean(options.stream),
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${config.name} 请求失败 (${response.status}): ${text.slice(0, 180)}`);
  }

  if (options.stream) {
    if (!response.body) throw new Error("无响应流");
    return { body: response.body as ReadableStream<Uint8Array>, provider: config.name, content: "" };
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || "",
    provider: `${config.name}（浏览器 Key）`,
    body: undefined as ReadableStream<Uint8Array> | undefined,
  };
}

function isModelAvailable(modelKey: string) {
  const config = PROVIDERS[modelKey];
  if (!config) return false;
  if (config.serverModel && isServerProviderConfigured(config.providerKey)) return true;
  return !!getApiKey(config.providerKey);
}

function resolveModelChain(options: AIGenerateOptions) {
  const preferred = options.model || (options.task ? getModelForTask(options.task) : getCurrentModel());
  const chain = [preferred, ...FALLBACK_CHAIN.filter((item) => item !== preferred)];
  const available = chain.filter(isModelAvailable);
  return available.length > 0 ? available : chain;
}

export async function generate(messages: Message[], options: AIGenerateOptions = {}): Promise<ChatResult> {
  await ensureServerConfig();
  const chain = resolveModelChain(options);
  const errors: string[] = [];
  let triedAny = false;

  for (let i = 0; i < chain.length; i += 1) {
    const modelKey = chain[i];
    const config = PROVIDERS[modelKey];
    if (!config) continue;

    try {
      // 1) 职小伴服务端 Key（DeepSeek / 硅基流动）优先
      if (config.serverModel && isServerProviderConfigured(config.providerKey)) {
        triedAny = true;
        const serverResult = await callServerProxy(modelKey, messages, options);
        if (serverResult) {
          return { ...serverResult, fallback: i > 0 };
        }
      }

      // 2) 浏览器本地 Key（可选覆盖 / 智谱 / 豆包）
      const browserResult = await callProviderDirect(modelKey, messages, options);
      if (browserResult) {
        triedAny = true;
        return {
          content: browserResult.content,
          provider: browserResult.provider,
          fallback: i > 0,
          source: "browser",
        };
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      triedAny = true;
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (errors.length) throw new Error(errors.join("\n"));
  if (!triedAny) {
    throw new Error(
      "没有可用的 AI 通道。请确认职小伴后端已启动（会自动使用 OPENAI_API_KEY / SPEECH_API_KEY），或在设置页填写浏览器 API Key。",
    );
  }
  throw new Error(
    errors.length
      ? `AI 调用失败：${errors[errors.length - 1]}`
      : "AI 服务暂时不可用，请稍后重试。可在「设置」页配置浏览器 API Key 作为备用。",
  );
}

export async function generateStream(messages: Message[], options: AIGenerateOptions = {}) {
  await ensureServerConfig();
  const chain = resolveModelChain(options);
  const errors: string[] = [];
  let triedAny = false;

  for (let i = 0; i < chain.length; i += 1) {
    const modelKey = chain[i];
    const config = PROVIDERS[modelKey];
    if (!config) continue;
    if (!getApiKey(config.providerKey)) continue;

    try {
      triedAny = true;
      const result = await callProviderDirect(modelKey, messages, { ...options, stream: true });
      if (!result?.body) continue;
      return {
        stream: result.body,
        provider: result.provider,
        fallback: i > 0,
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (errors.length) throw new Error(errors.join("\n"));
  if (!triedAny) {
    throw new Error("流式输出需要浏览器本地 API Key。非流式请求会优先使用职小伴服务端 Key。");
  }
  throw new Error("流式调用失败，请稍后重试。");
}

export async function readStream(
  stream: ReadableStream<Uint8Array>,
  onToken: (token: string) => void,
  onDone?: () => void,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const lines = chunk.split("\n");
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload);
          const token = json.choices?.[0]?.delta?.content;
          if (typeof token === "string") onToken(token);
        } catch {
          // ignore malformed SSE chunks
        }
      }
    }
  }

  onDone?.();
}
