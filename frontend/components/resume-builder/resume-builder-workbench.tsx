"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { V20Button, V20Card, V20PageHeader } from "@/components/tools/v20-ui";
import {
  COLLECTION_SYSTEM_PROMPT,
  EXAMPLE_CONVERSATION,
  EXAMPLE_RESUME_DATA,
  buildRenderPrompt,
} from "@/lib/resume-builder/builder-prompts";
import {
  cleanAssistantDisplay,
  computeResumeProfile,
  formatDataSummary,
  getBuilderStage,
  inferPhase,
  parseDataFromResponse,
  renderMarkdownBold,
} from "@/lib/resume-builder/profile-utils";
import {
  FALLBACK_TEMPLATES,
  ensureResumePaperGrows,
  stripMarkdownHtmlFence,
  wrapHtml,
} from "@/lib/resume-wizard/template-utils";
import {
  PHASE_LABELS,
  STAGES,
  STARTER_MESSAGE,
  defaultResumeData,
  type ChatMessage,
  type ResumeData,
  type TemplateInfo,
} from "@/lib/resume-builder/types";
import { resumeRepo } from "@/lib/local-db";
import { generate as aiGenerate } from "@/services/ai-direct";
import { cn } from "@/lib/utils";

const PREVIEW_LOAD_STEPS = ["选择模板", "加载样式文件", "渲染预览"];
const RENDER_RESUME_STEPS = ["读取模板样式", "整理采集素材", "AI 渲染简历", "生成预览"];

function StepProgress({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="space-y-2">
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={label} className="flex items-center gap-2.5">
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium",
                done ? "bg-brand text-white" : active ? "border border-brand bg-brand/10 text-brand" : "bg-page-bg text-text-secondary",
              )}
            >
              {done ? "✓" : index + 1}
            </span>
            <span className={cn("text-xs", active ? "font-medium text-text-primary" : done ? "text-text-secondary" : "text-text-secondary/70")}>
              {label}
              {active && <span className="ml-1.5 inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand/30 border-t-brand align-[-2px]" />}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ResumeSummaryCard({ resumeData, completion }: { resumeData: ResumeData; completion: number }) {
  return (
    <div className="rounded-[8px] border border-border bg-white p-3 text-left shadow-sm">
      <div className="text-sm font-medium text-text-primary">{resumeData.name || "未命名"}</div>
      <div className="mt-0.5 text-xs text-brand">{resumeData.headline || "目标岗位待填写"}</div>
      <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px] text-text-secondary">
        <span>工作经历 {resumeData.experience.length} 段</span>
        <span>项目经历 {resumeData.projects.length} 个</span>
        <span>教育背景 {resumeData.education.length} 条</span>
        <span>完成度 {completion}%</span>
      </div>
    </div>
  );
}

export function ResumeBuilderWorkbench() {
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", content: STARTER_MESSAGE }]);
  const [resumeData, setResumeData] = useState<ResumeData>({ ...defaultResumeData });
  const [currentPhase, setCurrentPhase] = useState("greeting");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [showSupplement, setShowSupplement] = useState(false);
  const [supplementInput, setSupplementInput] = useState("");
  const [templates, setTemplates] = useState<TemplateInfo[]>(FALLBACK_TEMPLATES);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateInfo | null>(null);
  const [templatePreviewHtml, setTemplatePreviewHtml] = useState("");
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [templatePreviewLoading, setTemplatePreviewLoading] = useState(false);
  const [previewLoadStep, setPreviewLoadStep] = useState(0);
  const [resumePreviewHtml, setResumePreviewHtml] = useState("");
  const [renderLoading, setRenderLoading] = useState(false);
  const [renderStep, setRenderStep] = useState(0);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [previewTab, setPreviewTab] = useState<"template" | "resume">("template");
  const [showEditModal, setShowEditModal] = useState(false);
  const [editContent, setEditContent] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editRef = useRef<HTMLDivElement>(null);
  const templateAutoInitRef = useRef(false);

  const builderStage = getBuilderStage(resumeData, isConfirmed);
  const stageIndex = STAGES.findIndex((s) => s.key === builderStage);
  const resumeProfile = useMemo(() => computeResumeProfile(resumeData), [resumeData]);
  const phaseLabel = PHASE_LABELS[currentPhase] || currentPhase;

  useEffect(() => {
    void fetch("/templates/templates.json")
      .then((r) => r.json())
      .then((data: TemplateInfo[]) => setTemplates(data))
      .catch(() => setTemplates(FALLBACK_TEMPLATES));
  }, []);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (builderStage !== "template" || templates.length === 0 || selectedTemplate || templateAutoInitRef.current) return;
    templateAutoInitRef.current = true;
    void (async () => {
      try {
        // Step-by-step: 先加载「模板预览」，再自动生成「我的简历」（填入你的采集信息）
        await previewTemplate(templates[0]);
        await generateResume();
      } catch {
        // 保底：即使自动生成失败，也至少展示模板预览
      }
    })();
  }, [builderStage, templates, selectedTemplate]);

  const restartCollection = () => {
    setMessages([{ role: "assistant", content: STARTER_MESSAGE }]);
    setResumeData({ ...defaultResumeData });
    setCurrentPhase("greeting");
    setDraft("");
    setIsConfirmed(false);
    setShowSupplement(false);
    setSupplementInput("");
    setActiveTemplateId(null);
    setSelectedTemplate(null);
    setTemplatePreviewHtml("");
    setPreviewLoaded(false);
    setTemplatePreviewLoading(false);
    setPreviewLoadStep(0);
    setResumePreviewHtml("");
    setRenderStep(0);
    setSaveSuccess(false);
    templateAutoInitRef.current = false;
  };

  const loadExample = () => {
    setMessages(EXAMPLE_CONVERSATION.map((m) => ({ ...m })));
    setResumeData(JSON.parse(JSON.stringify(EXAMPLE_RESUME_DATA)) as ResumeData);
    setCurrentPhase("done");
    setIsConfirmed(true);
    setActiveTemplateId(null);
    setSelectedTemplate(null);
    setTemplatePreviewHtml("");
    setPreviewLoaded(false);
    setTemplatePreviewLoading(false);
    setPreviewLoadStep(0);
    setResumePreviewHtml("");
    setRenderStep(0);
    templateAutoInitRef.current = false;
  };

  const runAiTurn = async (history: ChatMessage[]) => {
    const result = await aiGenerate(
      [
        { role: "system", content: COLLECTION_SYSTEM_PROMPT },
        ...history.map((m) => ({ role: m.role, content: m.content })),
      ],
      { task: "builder", temperature: 0.7, max_tokens: 4096 },
    );

    const response = result.content;
    let nextData = defaultResumeData;
    setResumeData((prev) => {
      nextData = parseDataFromResponse(response, prev);
      return nextData;
    });
    setCurrentPhase(inferPhase(nextData, currentPhase));

    const isComplete = response.includes("<complete />");
    const display = cleanAssistantDisplay(response);
    const assistantContent = isComplete
      ? display || "素材采集完成，请确认信息后进入模板生成。"
      : display || "继续说说吧～";

    if (isComplete) setCurrentPhase("done");
    setMessages((prev) => [...prev, { role: "assistant", content: assistantContent }]);
  };

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || loading) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setDraft("");
    setLoading(true);
    try {
      await runAiTurn(next);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `请求失败：${err instanceof Error ? err.message : "未知错误"}` },
      ]);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  };

  const sendSupplement = async () => {
    const text = supplementInput.trim();
    if (!text || loading) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setSupplementInput("");
    setLoading(true);
    try {
      const result = await aiGenerate(
        [
          { role: "system", content: `${COLLECTION_SYSTEM_PROMPT}\n\n用户正在补充更多信息，继续追问。` },
          ...next.map((m) => ({ role: m.role, content: m.content })),
        ],
        { task: "builder", temperature: 0.7, max_tokens: 4096 },
      );
      const response = result.content;
      setResumeData((prev) => {
        const nextData = parseDataFromResponse(response, prev);
        setCurrentPhase(inferPhase(nextData, currentPhase));
        return nextData;
      });
      const display = cleanAssistantDisplay(response);
      setMessages((prev) => [...prev, { role: "assistant", content: display || "还有要补充的吗？" }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `请求失败：${err instanceof Error ? err.message : "未知错误"}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const confirmData = () => {
    setIsConfirmed(true);
  };

  const previewTemplate = async (tpl: TemplateInfo) => {
    setSelectedTemplate(tpl);
    setActiveTemplateId(tpl.id);
    setPreviewTab("template");
    setTemplatePreviewLoading(true);
    setPreviewLoaded(false);
    setTemplatePreviewHtml("");
    // 切换模板时清空「我的简历」，避免展示上一次模板生成的结果
    setResumePreviewHtml("");
    setSaveSuccess(false);
    setRenderStep(0);
    setPreviewLoadStep(0);
    try {
      setPreviewLoadStep(1);
      await new Promise((r) => setTimeout(r, 120));
      const resp = await fetch(`/templates/${tpl.id}.html`);
      setPreviewLoadStep(2);
      const html = await resp.text();
      setTemplatePreviewHtml(html);
      setPreviewLoaded(true);
      setPreviewLoadStep(PREVIEW_LOAD_STEPS.length);
    } catch {
      setTemplatePreviewHtml("");
      setPreviewLoaded(false);
    } finally {
      setTemplatePreviewLoading(false);
    }
  };

  const generateResume = async () => {
    if (!selectedTemplate) return;
    setRenderLoading(true);
    setRenderStep(0);
    setPreviewTab("resume");
    try {
      setRenderStep(0);
      await new Promise((r) => setTimeout(r, 200));
      const resp = await fetch(`/templates/${selectedTemplate.id}.html`);
      const templateHtml = await resp.text();
      setRenderStep(1);
      await new Promise((r) => setTimeout(r, 200));
      setRenderStep(2);
      const result = await aiGenerate(
        [
          { role: "system", content: "你是一位简历 HTML 渲染专家。直接输出 HTML，不要 markdown 代码块，不要额外说明。" },
          { role: "user", content: buildRenderPrompt(resumeData, selectedTemplate.id, templateHtml) },
        ],
        { task: "resume", temperature: 0.3, max_tokens: 16384 },
      );
      setRenderStep(3);
      setResumePreviewHtml(ensureResumePaperGrows(stripMarkdownHtmlFence(result.content)));
      setRenderStep(RENDER_RESUME_STEPS.length);
    } catch (err) {
      setPreviewTab("template");
      alert(err instanceof Error ? err.message : "生成失败");
    } finally {
      setRenderLoading(false);
    }
  };

  const saveResume = async () => {
    if (!resumePreviewHtml) return;
    const name = resumeData.name || "未命名";
    const headline = resumeData.headline || "求职";
    await resumeRepo.create({
      title: `${name}-${headline}-简历`,
      rawContent: messages.map((m) => m.content).join("\n"),
      optimizedContent: resumePreviewHtml,
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 4000);
  };

  const exportWord = () => {
    if (!resumePreviewHtml) return;
    const name = `${resumeData.name || "简历"}-${resumeData.headline || "求职"}`;
    const blob = new Blob(["\ufeff" + wrapHtml(name, resumePreviewHtml)], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    if (!resumePreviewHtml) return;
    const name = `${resumeData.name || "简历"}-${resumeData.headline || "求职"}`;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(wrapHtml(name, resumePreviewHtml));
    win.document.close();
    setTimeout(() => {
      win.focus();
      win.print();
    }, 500);
  };

  const saveEdits = () => {
    if (editRef.current) setResumePreviewHtml(ensureResumePaperGrows(editRef.current.innerHTML));
    setShowEditModal(false);
  };

  return (
    <div>
      <V20PageHeader
        title="AI 经历采集"
        description="AI 追问对话采集素材，实时生成简历画像"
        extra={
          !isConfirmed ? (
            <V20Button variant="outline" onClick={loadExample}>
              加载示例
            </V20Button>
          ) : (
            <V20Button variant="outline" onClick={restartCollection}>
              重新开始
            </V20Button>
          )
        }
      />

      <V20Card className="mb-4 px-5 py-4" padding={false}>
        <div className="flex items-center">
          {STAGES.map((stage, index) => (
            <div key={stage.key} className="flex flex-1 items-center last:flex-none">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs",
                    index < stageIndex
                      ? "bg-brand text-white"
                      : index === stageIndex
                        ? "border border-brand/30 bg-brand/10 text-brand"
                        : "bg-page-bg text-text-secondary",
                  )}
                >
                  {index < stageIndex ? "✓" : index + 1}
                </span>
                <span className={cn("truncate text-sm", index === stageIndex ? "font-medium text-text-primary" : "text-text-secondary")}>
                  {stage.label}
                </span>
              </div>
              {index < STAGES.length - 1 && (
                <div className={cn("mx-3 h-px flex-1", index < stageIndex ? "bg-brand/40" : "bg-border")} />
              )}
            </div>
          ))}
        </div>
      </V20Card>

      {builderStage !== "template" ? (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
          <div className="min-w-0 flex-1">
            <div className="flex h-[min(520px,calc(100vh-14rem))] flex-col rounded-[8px] border border-border bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <span className="text-sm font-medium text-text-primary">AI 追问对话</span>
                <span className="rounded-full bg-page-bg px-2 py-0.5 text-[11px] text-text-secondary">{phaseLabel}</span>
              </div>
              <div ref={chatRef} className="flex-1 space-y-3 overflow-y-auto p-4">
                {messages.map((item, index) => (
                  <div key={index} className={cn("flex", item.role === "user" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-[12px] px-4 py-2.5 text-sm leading-relaxed",
                        item.role === "user"
                          ? "rounded-br-[4px] bg-brand text-white"
                          : "rounded-bl-[4px] bg-page-bg text-text-primary",
                      )}
                      dangerouslySetInnerHTML={{ __html: renderMarkdownBold(item.content) }}
                    />
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="rounded-[12px] rounded-bl-[4px] bg-page-bg px-4 py-3 text-sm text-text-secondary">
                      <span className="inline-flex gap-1">
                        {[0, 150, 300].map((delay) => (
                          <span
                            key={delay}
                            className="h-2 w-2 animate-bounce rounded-full bg-text-secondary/40"
                            style={{ animationDelay: `${delay}ms` }}
                          />
                        ))}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {showSupplement && (
                <div className="border-t border-border p-3">
                  <div className="flex gap-2">
                    <input
                      value={supplementInput}
                      onChange={(e) => setSupplementInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void sendSupplement()}
                      className="flex-1 rounded-[6px] border border-border p-2.5 text-sm outline-none focus:border-brand"
                      placeholder="补充更多信息..."
                    />
                    <V20Button disabled={!supplementInput.trim()} onClick={() => void sendSupplement()}>
                      发送
                    </V20Button>
                    <V20Button variant="ghost" onClick={() => setShowSupplement(false)}>
                      收起
                    </V20Button>
                  </div>
                </div>
              )}

              <div className="border-t border-border p-4">
                <div className="flex gap-3">
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendMessage();
                      }
                    }}
                    disabled={loading}
                    rows={2}
                    placeholder={loading ? "AI 思考中..." : "输入你的回答...（Enter 发送，Shift+Enter 换行）"}
                    className="flex-1 resize-none rounded-[8px] border border-border p-3 text-sm text-text-primary outline-none focus:border-brand disabled:opacity-60"
                  />
                  <V20Button className="self-end rounded-[8px] px-5 font-medium" disabled={loading || !draft.trim()} onClick={() => void sendMessage()}>
                    发送
                  </V20Button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-xs text-text-secondary">Enter 发送 · Shift+Enter 换行</p>
                  <button type="button" className="text-xs text-text-secondary hover:text-brand" onClick={() => setShowSupplement(true)}>
                    补充信息
                  </button>
                </div>
              </div>
            </div>
          </div>

          <aside className="flex w-full shrink-0 flex-col lg:w-[300px]">
            <div className="flex h-[min(520px,calc(100vh-14rem))] flex-col overflow-hidden rounded-[8px] border border-border bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <span className="text-sm font-medium text-text-primary">简历画像</span>
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] text-brand">{STAGES[stageIndex]?.label}</span>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-[6px] bg-page-bg px-3 py-2">
                    <div className="text-[10px] text-text-secondary">完成度</div>
                    <div className="mt-0.5 text-lg font-semibold text-brand">{resumeProfile.completion}%</div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white">
                      <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${resumeProfile.completion}%` }} />
                    </div>
                  </div>
                  <div className="rounded-[6px] bg-page-bg px-3 py-2">
                    <div className="text-[10px] text-text-secondary">量化完整度</div>
                    <div className="mt-0.5 text-lg font-semibold text-text-primary">{resumeProfile.quantRatio}%</div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white">
                      <div className="h-full rounded-full bg-green-500 transition-all duration-500" style={{ width: `${resumeProfile.quantRatio}%` }} />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-[6px] border border-border px-3 py-2">
                  <span className="text-[11px] text-text-secondary">项目证据强度</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px]",
                      resumeProfile.projectStrength.label === "强"
                        ? "bg-green-50 text-green-700"
                        : resumeProfile.projectStrength.label === "中"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-red-50 text-red-700",
                    )}
                  >
                    {resumeProfile.projectStrength.label}
                  </span>
                </div>

                <div>
                  <div className="mb-1.5 text-[11px] text-text-secondary">已采集模块</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {resumeProfile.modules.map((m) => (
                      <span
                        key={m.label}
                        className={cn(
                          "truncate rounded-[6px] border px-2 py-1 text-center text-[11px]",
                          m.done ? "border-green-200 bg-green-50 text-green-700" : "border-border bg-page-bg text-text-secondary",
                        )}
                      >
                        {m.label}
                      </span>
                    ))}
                  </div>
                </div>

                {resumeProfile.aiCapabilities.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-[11px] text-text-secondary">AI 能力标签</div>
                    <div className="flex flex-wrap gap-1">
                      {resumeProfile.aiCapabilities.map((c) => (
                        <span key={c} className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] text-brand">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {(resumeProfile.missing.length > 0 || resumeProfile.risks.length > 0) && (
                  <div className="space-y-2 rounded-[6px] border border-amber-200/60 bg-amber-50/40 px-3 py-2">
                    {resumeProfile.missing.slice(0, 3).map((m) => (
                      <p key={m} className="text-[11px] leading-snug text-text-secondary">
                        · {m}
                      </p>
                    ))}
                    {resumeProfile.risks.slice(0, 2).map((r) => (
                      <p key={r} className="text-[11px] leading-snug text-amber-700">
                        · {r}
                      </p>
                    ))}
                  </div>
                )}

                {builderStage === "confirm" && (
                  <div className="rounded-[6px] border border-brand/30 bg-brand/5 p-3">
                    <div className="mb-2 text-xs font-medium text-text-primary">信息确认</div>
                    <div className="mb-3 max-h-28 overflow-y-auto whitespace-pre-wrap rounded-[6px] bg-white p-2 text-[11px] leading-relaxed text-text-secondary">
                      {formatDataSummary(resumeData)}
                    </div>
                    <div className="space-y-2">
                      <V20Button className="w-full bg-green-600 hover:bg-green-700" onClick={confirmData}>
                        确认无误，选择模板
                      </V20Button>
                      <V20Button variant="ghost" className="w-full text-xs" onClick={() => setShowSupplement(true)}>
                        需要补充
                      </V20Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="shrink-0 space-y-2 border-t border-border px-4 py-3">
                <div className="flex flex-wrap gap-1.5">
                  <Link href="/tools/interview-predict" className="rounded-[6px] border border-border px-2.5 py-1 text-[11px] text-text-secondary hover:border-brand hover:text-brand">
                    生成面试押题
                  </Link>
                  <Link href="/tools/jd-analysis" className="rounded-[6px] border border-border px-2.5 py-1 text-[11px] text-text-secondary hover:border-brand hover:text-brand">
                    JD 定向优化
                  </Link>
                </div>
                {messages.length > 1 && (
                  <details className="text-[11px] text-text-secondary">
                    <summary className="cursor-pointer select-none">对话记录（{messages.length} 条）</summary>
                    <div className="mt-2 max-h-24 space-y-1 overflow-y-auto">
                      {messages.slice(-5).map((msg, i) => (
                        <p key={i} className="truncate">
                          <span className={msg.role === "assistant" ? "text-brand" : "text-text-primary"}>
                            {msg.role === "assistant" ? "AI" : "你"}：
                          </span>
                          {msg.content.replace(/\*\*/g, "").slice(0, 40)}
                        </p>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </div>
          </aside>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-stretch">
          <div className="flex h-full min-h-0 min-w-0 flex-col gap-4">
            {/* 与右侧「对话记录」同高：h-80，超出滚动 */}
            <V20Card className="flex h-80 shrink-0 flex-col overflow-hidden" padding={false}>
              <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <h2 className="text-[15px] font-medium text-text-primary">选择模板</h2>
                  <p className="mt-0.5 text-xs text-text-secondary">点击模板预览，确认后生成简历</p>
                </div>
                <button type="button" className="text-xs text-text-secondary hover:text-brand" onClick={restartCollection}>
                  重新采集
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
                  {templates.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => void previewTemplate(tpl)}
                      className={cn(
                        "overflow-hidden rounded-[8px] border text-left transition-all duration-200",
                        activeTemplateId === tpl.id
                          ? "border-brand shadow-md ring-2 ring-brand/20"
                          : "border-border hover:border-brand/50 hover:shadow-sm",
                      )}
                    >
                      <div className="relative aspect-[210/297] overflow-hidden bg-page-bg">
                        <Image src={`/templates/${tpl.id}.png`} alt={tpl.name} width={120} height={170} className="h-full w-full object-cover" unoptimized />
                        {activeTemplateId === tpl.id && (
                          <div className="absolute top-1 right-1 rounded bg-brand px-1.5 py-0.5 text-[9px] text-white">
                            {templatePreviewLoading ? "加载中" : "选中"}
                          </div>
                        )}
                      </div>
                      <div className="px-2 py-1.5">
                        <div className="truncate text-[11px] font-medium text-text-primary">{tpl.name}</div>
                        <span
                          className={cn(
                            "mt-0.5 inline-block rounded px-1 py-0.5 text-[9px]",
                            tpl.ats === "友好" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700",
                          )}
                        >
                          ATS {tpl.ats || "一般"}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </V20Card>

            <V20Card className="flex min-h-0 flex-1 flex-col overflow-hidden" padding={false}>
            <div className="border-b border-border bg-page-bg/40 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-text-primary">
                    {selectedTemplate?.name || "等待选择模板"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-text-secondary">
                    {resumeData.name || "未命名"} · {resumeData.headline || "目标岗位"} · 完成度 {resumeProfile.completion}%
                  </div>
                  <p className="mt-1 text-[11px] text-text-secondary">
                    <span className="font-medium text-text-primary">模板预览</span>：仅样式；
                    <span className="font-medium text-text-primary">我的简历</span>：已填入你的采集信息
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedTemplate && (
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[9px]",
                        selectedTemplate.ats === "友好" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700",
                      )}
                    >
                      ATS {selectedTemplate.ats || "一般"}
                    </span>
                  )}
                  <div className="flex gap-1 rounded-[6px] bg-page-bg p-0.5">
                    <button
                      type="button"
                      className={cn(
                        "rounded-[5px] px-2.5 py-1 text-[11px]",
                        previewTab === "template" ? "bg-white text-text-primary shadow-sm" : "text-text-secondary",
                      )}
                      onClick={() => setPreviewTab("template")}
                    >
                      模板预览
                    </button>
                    <button
                      type="button"
                      disabled={!resumePreviewHtml && !renderLoading}
                      className={cn(
                        "rounded-[5px] px-2.5 py-1 text-[11px]",
                        previewTab === "resume" ? "bg-white text-text-primary shadow-sm" : "text-text-secondary",
                        !resumePreviewHtml && !renderLoading && "opacity-40",
                      )}
                      onClick={() => setPreviewTab("resume")}
                    >
                      我的简历
                    </button>
                  </div>
                  {previewTab === "template" ? (
                    <V20Button
                      className="px-3 py-1.5 text-xs"
                      disabled={!selectedTemplate || renderLoading || templatePreviewLoading}
                      onClick={() => void generateResume()}
                    >
                      {renderLoading ? "生成中..." : "生成简历"}
                    </V20Button>
                  ) : (
                    <div className="flex gap-1">
                      <V20Button
                        variant="ghost"
                        className="px-2 py-1 text-[11px]"
                        disabled={!resumePreviewHtml}
                        onClick={() => {
                          setEditContent(ensureResumePaperGrows(resumePreviewHtml));
                          setShowEditModal(true);
                        }}
                      >
                        编辑
                      </V20Button>
                      <V20Button variant="ghost" className="px-2 py-1 text-[11px]" disabled={!resumePreviewHtml} onClick={exportWord}>
                        Word
                      </V20Button>
                      <V20Button variant="ghost" className="px-2 py-1 text-[11px]" disabled={!resumePreviewHtml} onClick={exportPdf}>
                        PDF
                      </V20Button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {(templatePreviewLoading || renderLoading) && (
              <div className="border-b border-border bg-brand/5 px-4 py-3">
                <div className="mb-2 text-[11px] font-medium text-brand">
                  {renderLoading ? "正在生成你的简历…" : "正在加载模板预览…"}
                </div>
                <StepProgress
                  steps={renderLoading ? RENDER_RESUME_STEPS : PREVIEW_LOAD_STEPS}
                  current={renderLoading ? renderStep : previewLoadStep}
                />
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto bg-[#ececec] p-4">
              {renderLoading ? (
                <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-4 px-2">
                  <ResumeSummaryCard resumeData={resumeData} completion={resumeProfile.completion} />
                  <div className="w-full max-w-[220px] rounded-[8px] border border-border bg-white p-2 shadow-sm">
                    {selectedTemplate && (
                      <Image
                        src={`/templates/${selectedTemplate.id}.png`}
                        alt={selectedTemplate.name}
                        width={200}
                        height={280}
                        className="w-full rounded object-cover opacity-80"
                        unoptimized
                      />
                    )}
                    <p className="mt-2 text-center text-[10px] text-text-secondary">AI 正在将你的素材填入 {selectedTemplate?.name}</p>
                  </div>
                </div>
              ) : previewTab === "template" && previewLoaded && templatePreviewHtml ? (
                <div className="mx-auto" style={{ width: "calc(210mm * 0.75)", height: "calc(297mm * 0.75)" }}>
                  <div className="origin-top-left shadow-lg" style={{ width: "210mm", height: "297mm", transform: "scale(0.75)" }}>
                    <iframe title="模板预览" srcDoc={templatePreviewHtml} className="h-full w-full border-0 bg-white" sandbox="allow-same-origin" />
                  </div>
                </div>
              ) : previewTab === "resume" && resumePreviewHtml ? (
                <div className="mx-auto" style={{ width: "calc(210mm * 0.75)", height: "calc(297mm * 0.75)" }}>
                  <div className="origin-top-left shadow-lg" style={{ width: "210mm", height: "297mm", transform: "scale(0.75)" }}>
                    <iframe title="简历预览" srcDoc={resumePreviewHtml} className="h-full w-full border-0 bg-white" sandbox="allow-same-origin" />
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 px-2">
                  <ResumeSummaryCard resumeData={resumeData} completion={resumeProfile.completion} />
                  {selectedTemplate ? (
                    <div className="w-full max-w-[240px]">
                      <div className="overflow-hidden rounded-[8px] border border-border bg-white shadow-md">
                        <Image
                          src={`/templates/${selectedTemplate.id}.png`}
                          alt={selectedTemplate.name}
                          width={240}
                          height={340}
                          className="w-full object-cover"
                          unoptimized
                        />
                      </div>
                      <p className="mt-2 text-center text-[11px] text-text-secondary">
                        {templatePreviewLoading ? `${selectedTemplate.name} 样式加载中…` : `已选 ${selectedTemplate.name}，可点击上方「生成简历」`}
                      </p>
                    </div>
                  ) : (
                    <div className="text-center text-sm text-text-secondary">
                      <p>正在准备模板列表…</p>
                      <p className="mt-1 text-xs">进入后将自动选中第一个模板并预览</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {resumePreviewHtml && !renderLoading && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
                <span className="text-[11px] text-text-secondary">{selectedTemplate?.name} · 已生成</span>
                <div className="flex flex-wrap gap-1.5">
                  <V20Button className="px-3 py-1.5 text-xs" onClick={() => void saveResume()}>
                    {saveSuccess ? "已保存" : "保存简历"}
                  </V20Button>
                  <Link href="/tools/jd-analysis" className="rounded-[6px] border border-border px-2.5 py-1.5 text-[11px] text-text-secondary hover:border-brand hover:text-brand">
                    JD 优化
                  </Link>
                  <Link href="/tools/interview-predict" className="rounded-[6px] border border-border px-2.5 py-1.5 text-[11px] text-text-secondary hover:border-brand hover:text-brand">
                    面试押题
                  </Link>
                </div>
              </div>
            )}
          </V20Card>
          </div>

          <div className="flex h-full min-h-0 flex-col gap-4">
            <V20Card padding={false}>
              <div className="border-b border-border px-4 py-3">
                <span className="text-sm font-medium text-text-primary">简历画像</span>
              </div>
              <div className="space-y-3 px-4 py-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-[6px] bg-page-bg px-3 py-2">
                    <div className="text-[10px] text-text-secondary">完成度</div>
                    <div className="mt-0.5 text-lg font-semibold text-brand">{resumeProfile.completion}%</div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white">
                      <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${resumeProfile.completion}%` }} />
                    </div>
                  </div>
                  <div className="rounded-[6px] bg-page-bg px-3 py-2">
                    <div className="text-[10px] text-text-secondary">量化完整度</div>
                    <div className="mt-0.5 text-lg font-semibold text-text-primary">{resumeProfile.quantRatio}%</div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white">
                      <div className="h-full rounded-full bg-green-500 transition-all duration-500" style={{ width: `${resumeProfile.quantRatio}%` }} />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-[6px] border border-border px-3 py-2">
                  <span className="text-[11px] text-text-secondary">项目证据强度</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px]",
                      resumeProfile.projectStrength.label === "强"
                        ? "bg-green-50 text-green-700"
                        : resumeProfile.projectStrength.label === "中"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-red-50 text-red-700",
                    )}
                  >
                    {resumeProfile.projectStrength.label}
                  </span>
                </div>

                <div>
                  <div className="mb-1.5 text-[11px] text-text-secondary">已采集模块</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {resumeProfile.modules.map((m) => (
                      <span
                        key={m.label}
                        className={cn(
                          "truncate rounded-[6px] border px-2 py-1 text-center text-[11px]",
                          m.done ? "border-green-200 bg-green-50 text-green-700" : "border-border bg-page-bg text-text-secondary",
                        )}
                      >
                        {m.label}
                      </span>
                    ))}
                  </div>
                </div>

                {(resumeProfile.missing.length > 0 || resumeProfile.risks.length > 0) && (
                  <div className="space-y-1 rounded-[6px] border border-amber-200/60 bg-amber-50/40 px-3 py-2">
                    {resumeProfile.missing.slice(0, 2).map((m) => (
                      <p key={m} className="text-[11px] leading-snug text-text-secondary">
                        · {m}
                      </p>
                    ))}
                    {resumeProfile.risks.slice(0, 2).map((r) => (
                      <p key={r} className="text-[11px] leading-snug text-amber-700">
                        · {r}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </V20Card>

            <V20Card className="min-h-0" padding={false}>
              <div className="border-b border-border px-4 py-3">
                <span className="text-sm font-medium text-text-primary">信息确认</span>
              </div>
              <div className="px-4 py-3">
                <div className="max-h-36 overflow-y-auto whitespace-pre-wrap rounded-[6px] bg-page-bg p-2 text-[11px] leading-relaxed text-text-secondary">
                  {formatDataSummary(resumeData)}
                </div>
              </div>
            </V20Card>

            {messages.length > 0 && (
              <V20Card className="flex h-80 shrink-0 flex-col overflow-hidden" padding={false}>
                <div className="shrink-0 border-b border-border px-4 py-3 text-sm font-medium text-text-primary">
                  对话记录（{messages.length} 条）
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3 text-xs">
                  {messages.map((msg, i) => (
                    <div key={i} className={cn("pb-1.5", i < messages.length - 1 && "border-b border-border/50")}>
                      <span className={cn("font-medium", msg.role === "assistant" ? "text-brand" : "text-text-primary")}>
                        {msg.role === "assistant" ? "AI" : "你"}：
                      </span>
                      <span className="text-text-secondary">
                        {msg.content.replace(/\*\*/g, "").slice(0, 80)}
                        {msg.content.length > 80 ? "..." : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </V20Card>
            )}
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-medium text-text-primary">编辑简历</h2>
              <span className="text-xs text-text-secondary">点击任意文字直接修改</span>
            </div>
            <div className="flex items-center gap-2">
              <V20Button
                variant="ghost"
                className="px-3 py-1.5 text-xs"
                onClick={() => {
                  const el = editRef.current;
                  if (!el) return;
                  el.setAttribute("contenteditable", el.getAttribute("contenteditable") === "true" ? "false" : "true");
                }}
              >
                解锁编辑
              </V20Button>
              <V20Button className="px-4 py-1.5 text-xs" onClick={saveEdits}>
                完成编辑
              </V20Button>
              <V20Button variant="ghost" className="px-3 py-1.5 text-xs hover:text-red-500" onClick={() => setShowEditModal(false)}>
                关闭
              </V20Button>
            </div>
          </div>
          <div className="flex flex-1 justify-center overflow-auto bg-[#e8e8e8] p-6">
            <div className="bg-white shadow-lg" style={{ width: "210mm", minHeight: "297mm" }}>
              <div ref={editRef} className="min-h-[297mm] bg-white" spellCheck={false} dangerouslySetInnerHTML={{ __html: editContent }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
