"use client";

import { useEffect, useMemo, useState } from "react";

import { V20Button, V20Card, V20PageHeader } from "@/components/tools/v20-ui";
import {
  AI_MODELS,
  DEFAULT_TASK_MODELS,
  TASK_LABELS,
  getCurrentModel,
  getTaskModelMap,
  setCurrentModel,
  setTaskModel,
} from "@/lib/ai-model-settings";
import {
  fetchToolsAiConfig,
  getUserApiKeys,
  saveUserApiKeys,
  type ServerProviderStatus,
  type ToolApiKeyConfig,
  type ToolsAiConfig,
} from "@/lib/tool-api-keys";
import { cn } from "@/lib/utils";

const BROWSER_PROVIDERS = [
  { key: "deepseek" as const, label: "DeepSeek V4 Flash（简历优化专用）", hint: "platform.deepseek.com", optional: true },
  { key: "zhipu" as const, label: "智谱 GLM", hint: "open.bigmodel.cn" },
  { key: "siliconflow" as const, label: "硅基流动 DeepSeek", hint: "siliconflow.cn", optional: true },
  { key: "doubao" as const, label: "火山引擎豆包（推荐，速度快）", hint: "console.volcengine.com/ark" },
];

export default function ToolSettingsPage() {
  const [keys, setKeys] = useState<ToolApiKeyConfig>(() => getUserApiKeys());
  const [saved, setSaved] = useState(false);
  const [showApiKeys, setShowApiKeys] = useState(true);
  const [currentModel, setCurrentModelState] = useState(getCurrentModel);
  const [taskModels, setTaskModels] = useState<Record<string, string>>(() => getTaskModelMap());
  const [serverConfig, setServerConfig] = useState<ToolsAiConfig | null>(null);

  useEffect(() => {
    void fetchToolsAiConfig().then((config) => {
      setServerConfig(config);
      if (config?.defaultModel && !localStorage.getItem("ai_current_model")) {
        setCurrentModel(config.defaultModel);
        setCurrentModelState(config.defaultModel);
      }
    });
  }, []);

  const taskLabels = useMemo(() => serverConfig?.taskLabels || TASK_LABELS, [serverConfig]);
  const models = useMemo(() => serverConfig?.models || AI_MODELS, [serverConfig]);

  const providerStatus = (key: keyof ToolApiKeyConfig): ServerProviderStatus | undefined =>
    serverConfig?.providers?.[key];

  const statusBadge = (key: keyof ToolApiKeyConfig) => {
    const server = providerStatus(key);
    const browser = keys[key]?.trim();
    if (server?.configured) {
      return (
        <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] text-green-700">
          职小伴服务端已配置{server.masked ? ` · ${server.masked}` : ""}
        </span>
      );
    }
    if (browser) {
      return <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">浏览器 Key 已填写</span>;
    }
    return <span className="rounded-full bg-page-bg px-2 py-0.5 text-[11px] text-text-secondary">未配置</span>;
  };

  return (
    <div>
      <V20PageHeader
        title="设置"
        description="与面试全流程 2.0 相同的模型配置方式；DeepSeek / 硅基流动优先使用职小伴服务端 .env Key"
      />

      {serverConfig?.serverKeysEnabled && (
        <V20Card className="mb-4 border-green-200 bg-green-50/40">
          <p className="text-sm text-green-800">
            已检测到职小伴后端 Key：DeepSeek（OPENAI_API_KEY）
            {serverConfig.providers.siliconflow?.configured ? "、硅基流动（SPEECH_API_KEY）" : ""}。
            工具页会优先走服务端，无需重复填写。
          </p>
        </V20Card>
      )}

      <V20Card className="mb-4">
        <h2 className="mb-4 text-[18px] font-medium text-text-primary">默认 AI 模型</h2>
        <p className="mb-4 text-sm text-text-secondary">
          所有功能默认使用的 AI 模型。如果首选模型不可用，会自动降级到其他模型。
        </p>
        <div className="space-y-3">
          {models.map((m) => (
            <label
              key={m.id}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-[6px] border p-3 transition-colors",
                currentModel === m.id ? "border-brand bg-brand/5" : "border-border hover:border-brand/50",
              )}
            >
              <input
                type="radio"
                name="default-model"
                checked={currentModel === m.id}
                onChange={() => {
                  setCurrentModel(m.id);
                  setCurrentModelState(m.id);
                }}
                className="h-4 w-4 text-brand"
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-text-primary">{m.name}</div>
                <div className="text-xs text-text-secondary">{m.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </V20Card>

      <V20Card className="mb-4">
        <h2 className="mb-4 text-[18px] font-medium text-text-primary">任务模型分配</h2>
        <p className="mb-4 text-sm text-text-secondary">为不同任务指定专门的模型（未设置则跟随默认模型）</p>
        <div className="space-y-3">
          {Object.entries(taskLabels).map(([task, label]) => (
            <div key={task} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-sm text-text-primary">{label}</span>
              <select
                value={taskModels[task] || ""}
                onChange={(e) => {
                  const value = e.target.value;
                  setTaskModel(task, value);
                  setTaskModels((prev) => ({ ...prev, [task]: value }));
                }}
                className="flex-1 rounded-[6px] border border-border p-2.5 text-[14px] text-text-primary outline-none focus:border-brand"
              >
                <option value="">跟随默认</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <V20Button
            variant="ghost"
            onClick={() => {
              localStorage.setItem("ai_task_model_map", JSON.stringify(DEFAULT_TASK_MODELS));
              setTaskModels({ ...DEFAULT_TASK_MODELS });
            }}
          >
            恢复默认任务分配
          </V20Button>
        </div>
      </V20Card>

      <V20Card className="mb-4">
        <button
          type="button"
          className="mb-2 flex w-full cursor-pointer items-center justify-between select-none"
          onClick={() => setShowApiKeys((v) => !v)}
        >
          <h2 className="text-lg font-semibold text-text-primary">API Key 配置</h2>
          <span className="text-sm text-text-secondary">{showApiKeys ? "收起" : "展开"}</span>
        </button>
        <p className="mb-4 text-sm text-text-secondary">
          DeepSeek 与硅基流动优先使用职小伴服务端 .env 中的 Key（OPENAI_API_KEY / SPEECH_API_KEY）。
          智谱、豆包等需在浏览器本地填写；也可在此填写浏览器 Key 作为覆盖。
          <br />
          Key 保存在 localStorage（<code className="text-xs">ai_api_keys</code>），与面试全流程 2.0 一致。
        </p>
        {showApiKeys && (
          <div className="space-y-4">
            {BROWSER_PROVIDERS.map((provider) => (
              <div key={provider.key} className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs font-medium text-text-primary">{provider.label}</label>
                  {statusBadge(provider.key)}
                  {provider.optional && (
                    <span className="text-[10px] text-text-secondary">（可选，服务端已配时可留空）</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={keys[provider.key]}
                    onChange={(e) => {
                      setSaved(false);
                      setKeys((prev) => ({ ...prev, [provider.key]: e.target.value }));
                    }}
                    placeholder={`申请地址：${provider.hint}`}
                    className="flex-1 rounded-[6px] border border-border p-2.5 font-mono text-[13px] text-text-primary outline-none focus:border-brand"
                  />
                  <V20Button variant="ghost" className="shrink-0 px-3 text-xs" onClick={() => setKeys((prev) => ({ ...prev, [provider.key]: "" }))}>
                    清空
                  </V20Button>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-3">
              <V20Button
                onClick={() => {
                  saveUserApiKeys(keys);
                  setSaved(true);
                }}
              >
                保存 API Key
              </V20Button>
              {saved && <span className="text-sm text-green-600">已保存到当前浏览器</span>}
            </div>
          </div>
        )}
      </V20Card>

      <V20Card>
        <h2 className="mb-4 text-[18px] font-medium text-text-primary">说明</h2>
        <ul className="space-y-2 text-sm text-text-secondary">
          <li>- 职小伴主对话 Agent 使用后端 .env 中的 DeepSeek Key，与工具页共用同一套服务端配置。</li>
          <li>- 工具页调用顺序：服务端 Key → 浏览器 localStorage Key → 自动降级下一模型。</li>
          <li>- 本地工具数据（简历、JD 分析等）保存在浏览器 IndexedDB，不会上传云端。</li>
        </ul>
      </V20Card>
    </div>
  );
}
