"use client";

import { useEffect, useState } from "react";

import { HistoryListItem } from "@/components/tools/history-list-item";
import { V20Button, V20Card, V20ContextPanel, V20Input, V20PageHeader, V20Textarea } from "@/components/tools/v20-ui";
import { interviewReviewRepo, scriptRepo, type InterviewReviewRecord } from "@/lib/local-db";
import { toolPrompts } from "@/lib/tool-prompts";
import { generate as generateAI } from "@/services/ai-direct";
import { transcribeAudio } from "@/services/transcribe";

const PROCESS_STEPS = ["抽取问答", "逐点优化", "生成总评"];

type ReviewPoint = {
  label: string;
  original: string;
  issue: string;
  better: string;
};

type ReviewQA = {
  title: string;
  question: string;
  answer: string;
  points?: ReviewPoint[];
  optimizedAnswer?: string;
};

type ReviewSummary = {
  overall: string;
  strengths: string[];
  weaknesses: string[];
  threeDayPlan: string[];
};

function parseJsonArray<T>(raw: string): T[] | null {
  const trimmed = raw.trim();
  const tryParse = (text: string) => {
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  };
  try {
    return tryParse(trimmed);
  } catch {
    // fall through
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return tryParse(fenced[1].trim());
    } catch {
      // fall through
    }
  }
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start >= 0 && end > start) {
    try {
      return tryParse(trimmed.slice(start, end + 1));
    } catch {
      // fall through
    }
  }
  return null;
}

function parseJsonObject<T extends object>(raw: string): T | null {
  const trimmed = raw.trim();
  const tryParse = (text: string) => JSON.parse(text) as T;
  try {
    return tryParse(trimmed);
  } catch {
    // fall through
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return tryParse(fenced[1].trim());
    } catch {
      // fall through
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return tryParse(trimmed.slice(start, end + 1));
    } catch {
      // fall through
    }
  }
  return null;
}

function normalizeQA(raw: unknown): ReviewQA {
  const q = raw as Record<string, unknown>;
  return {
    title: String(q?.title || "未命名"),
    question: String(q?.question || ""),
    answer: String(q?.answer || ""),
  };
}

function loadStoredReview(record: InterviewReviewRecord): { qaList: ReviewQA[]; summary: ReviewSummary | null } {
  try {
    const parsed = JSON.parse(record.qaPairs) as { qaList?: ReviewQA[]; summary?: ReviewSummary };
    if (parsed?.qaList) {
      return { qaList: parsed.qaList, summary: parsed.summary || null };
    }
  } catch {
    // legacy plain text
  }
  return { qaList: [], summary: null };
}

export default function InterviewReviewPage() {
  const [inputMode, setInputMode] = useState<"audio" | "text">("text");
  const [stage, setStage] = useState<"idle" | "analyzing" | "done">("idle");
  const [progressStep, setProgressStep] = useState(0);
  const [error, setError] = useState("");
  const [textInput, setTextInput] = useState("");
  const [qaList, setQaList] = useState<ReviewQA[]>([]);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [history, setHistory] = useState<InterviewReviewRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [company, setCompany] = useState("");
  const [position, setPosition] = useState("");
  const [round, setRound] = useState("");
  const [fileName, setFileName] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    void interviewReviewRepo.list().then(setHistory);
  }, []);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2500);
  };

  const analyzeText = async (source: string) => {
    setStage("analyzing");
    setError("");
    setQaList([]);
    setSummary(null);
    setProgressStep(0);

    const meta = `公司：${company || "未知"}\n岗位：${position || "未知"}\n轮次：${round || "未知"}\n\n`;

    try {
      const qaRes = await generateAI(
        [
          { role: "system", content: toolPrompts.interviewReviewQaExtract },
          { role: "user", content: `${meta}面试对话：\n${source}` },
        ],
        { temperature: 0.3, max_tokens: 8192, task: "score" },
      );
      const extracted = parseJsonArray<unknown>(qaRes.content)?.map(normalizeQA).filter((q) => q.question && q.answer) || [];
      if (!extracted.length) {
        throw new Error("未能从对话中抽取问答，请检查文本是否包含「面试官：」和「我：」格式");
      }
      setProgressStep(1);

      const critiqueRes = await generateAI(
        [
          { role: "system", content: toolPrompts.interviewReviewCritique },
          { role: "user", content: JSON.stringify(extracted, null, 2) },
        ],
        { temperature: 0.5, max_tokens: 16384, task: "score" },
      );
      const critiques = parseJsonArray<{ index: number; points?: ReviewPoint[]; optimizedAnswer?: string }>(critiqueRes.content) || [];
      const merged = extracted.map((qa, index) => {
        const critique = critiques.find((c) => c.index === index) || critiques[index];
        return {
          ...qa,
          points: critique?.points || [],
          optimizedAnswer: critique?.optimizedAnswer || "",
        };
      });
      setQaList(merged);
      setProgressStep(2);

      const summaryRes = await generateAI(
        [
          { role: "system", content: toolPrompts.interviewReviewSummary },
          {
            role: "user",
            content: `${meta}完整对话：\n${source}\n\n已抽取 ${merged.length} 组问答（不要再复述问答原文，只写总评 JSON）`,
          },
        ],
        { temperature: 0.45, max_tokens: 2048, task: "score" },
      );
      const parsedSummary = parseJsonObject<ReviewSummary>(summaryRes.content);
      setSummary(
        parsedSummary || {
          overall: "已完成问答抽取与逐点优化，请查看下方各题点评。",
          strengths: [],
          weaknesses: [],
          threeDayPlan: [],
        },
      );
      setStage("done");
      flash(`分析完成：${merged.length} 组问答`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析失败");
      setStage("idle");
    }
  };

  const save = async () => {
    if (!qaList.length) return;
    const payload = { qaList, summary };
    await interviewReviewRepo.create({
      title: `${company || "未命名公司"}-${position || "岗位"}-${round || "面试"}`,
      fileName: fileName || (inputMode === "audio" ? "audio-upload" : "文本输入"),
      fileSize: textInput.length,
      duration: 0,
      rawTranscript: textInput,
      annotatedTranscript: textInput,
      transcriptSegments: qaList.length,
      qaPairs: JSON.stringify(payload),
      review: summary?.overall || "",
      company: company || undefined,
      position: position || undefined,
      round: round || undefined,
      interviewDate: new Date().toISOString().slice(0, 10),
    });
    const pairs = qaList.map((qa) => ({
      title: qa.title,
      question: qa.question,
      answer: qa.answer,
      optimizedAnswer: qa.optimizedAnswer || "",
    }));
    await scriptRepo.create({ title: `${company || "面试"}复盘逐字稿`, targetRole: position || undefined, qaPairs: JSON.stringify(pairs) });
    setHistory(await interviewReviewRepo.list());
    flash("复盘已保存");
  };

  const loadHistoryRecord = (item: InterviewReviewRecord) => {
    const loaded = loadStoredReview(item);
    setQaList(loaded.qaList);
    setSummary(loaded.summary);
    setCompany(item.company || "");
    setPosition(item.position || "");
    setRound(item.round || "");
    setTextInput(item.rawTranscript || "");
    setStage("done");
    setShowHistory(false);
    flash(`已载入：${item.title}`);
  };

  return (
    <div>
      <V20PageHeader
        title="面试复盘"
        description="粘贴对话后，逐题拆解回答要点、指出问题并给出口语化改法"
        extra={
          history.length > 0 ? (
            <button type="button" className="text-sm text-brand hover:text-brand-hover" onClick={() => setShowHistory((v) => !v)}>
              {showHistory ? "收起历史" : `历史记录 (${history.length})`}
            </button>
          ) : null
        }
      />

      {toast && <div className="mb-3 rounded-[6px] border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">{toast}</div>}
      {error && stage === "idle" && (
        <div className="mb-3 rounded-[6px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      )}

      {showHistory && history.length > 0 && (
        <div className="mb-4 space-y-2">
          {history.map((item) => (
            <HistoryListItem
              key={item.id}
              title={item.title}
              subtitle={new Date(item.createdAt).toLocaleString("zh-CN")}
              onOpen={() => loadHistoryRecord(item)}
              onRename={async (nextTitle) => {
                if (item.id == null) return;
                await interviewReviewRepo.update(item.id, { title: nextTitle });
                setHistory(await interviewReviewRepo.list());
                flash("已重命名");
              }}
              onDelete={async () => {
                if (item.id == null) return;
                await interviewReviewRepo.remove(item.id);
                setHistory(await interviewReviewRepo.list());
                flash("已删除");
              }}
            />
          ))}
        </div>
      )}

      {stage === "idle" && (
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="min-w-0 flex-1">
            <div className="mb-4 flex w-fit gap-1 rounded-[8px] border border-border bg-page-bg p-1">
              <button type="button" className={`rounded-[6px] px-4 py-1.5 text-sm ${inputMode === "audio" ? "bg-white font-medium text-text-primary shadow-sm" : "text-text-secondary"}`} onClick={() => setInputMode("audio")}>
                上传录音
              </button>
              <button type="button" className={`rounded-[6px] px-4 py-1.5 text-sm ${inputMode === "text" ? "bg-white font-medium text-text-primary shadow-sm" : "text-text-secondary"}`} onClick={() => setInputMode("text")}>
                粘贴文本
              </button>
            </div>
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs text-text-secondary">公司</label>
                <V20Input value={company} onChange={(e) => setCompany(e.target.value)} className="p-2 text-[13px]" placeholder="选填" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-secondary">岗位</label>
                <V20Input value={position} onChange={(e) => setPosition(e.target.value)} className="p-2 text-[13px]" placeholder="选填" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-secondary">轮次</label>
                <V20Input value={round} onChange={(e) => setRound(e.target.value)} className="p-2 text-[13px]" placeholder="一面/二面" />
              </div>
            </div>
            {inputMode === "audio" ? (
              <V20Card>
                <h2 className="mb-4 text-[15px] font-medium text-text-primary">上传面试录音</h2>
                <label className="block cursor-pointer rounded-lg border-2 border-dashed border-border p-12 text-center hover:border-brand">
                  <p className="mb-1 text-sm font-medium text-text-primary">点击上传面试录音</p>
                  <p className="text-xs text-text-secondary">支持 mp3 / wav / m4a</p>
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setFileName(file.name);
                      void transcribeAudio(file).then((text) => {
                        setTextInput(text);
                        setInputMode("text");
                      });
                    }}
                  />
                </label>
              </V20Card>
            ) : (
              <V20Card>
                <h2 className="mb-4 text-[15px] font-medium text-text-primary">粘贴面试对话</h2>
                <p className="mb-3 text-xs text-text-secondary">请用「面试官：」「我：」标注每一轮对话，AI 会逐题拆解你的回答并给出改法。</p>
                <V20Textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  className="min-h-[280px] rounded-[8px] p-4"
                  placeholder={"面试官：请做个自我介绍。\n我：您好，我叫..."}
                />
                <div className="mt-4 flex gap-3">
                  <V20Button disabled={!textInput.trim()} onClick={() => void analyzeText(textInput)}>
                    开始分析
                  </V20Button>
                  <V20Button variant="ghost" onClick={() => setTextInput("")}>
                    清空
                  </V20Button>
                </div>
              </V20Card>
            )}
          </div>
          <div className="w-full shrink-0 lg:w-[300px]">
            <V20ContextPanel
              task="面试复盘"
              inputs={[{ label: "录音/文本", provided: false }]}
              missing={["请粘贴带「面试官/我」标注的对话文本"]}
              actions={[
                { label: "打开逐字稿", href: "/tools/interview-script" },
                { label: "答题评分", href: "/tools/answer-scoring" },
              ]}
            />
          </div>
        </div>
      )}

      {stage === "analyzing" && (
        <V20Card className="mb-4 p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-brand" />
            <span className="text-sm font-medium text-text-primary">AI 分析中：{PROCESS_STEPS[progressStep] || "处理中"}...</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {PROCESS_STEPS.map((label, index) => (
              <div key={label} className="flex items-center gap-1">
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${index <= progressStep ? "bg-brand text-white" : "bg-page-bg text-text-secondary"}`}>
                  {label}
                </span>
                {index < PROCESS_STEPS.length - 1 && <span className="text-text-secondary/40">→</span>}
              </div>
            ))}
          </div>
        </V20Card>
      )}

      {stage === "done" && (
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex flex-wrap gap-2">
              <V20Button onClick={() => void save()}>保存复盘</V20Button>
              <V20Button
                variant="ghost"
                onClick={() => {
                  setStage("idle");
                  setQaList([]);
                  setSummary(null);
                  setError("");
                }}
              >
                新的复盘
              </V20Button>
            </div>

            {summary && (
              <V20Card>
                <h2 className="mb-3 text-[15px] font-medium text-text-primary">总评概览</h2>
                <p className="mb-4 text-[14px] leading-relaxed text-text-primary">{summary.overall}</p>
                {summary.strengths.length > 0 && (
                  <div className="mb-3">
                    <p className="mb-1.5 text-xs font-medium text-green-700">做得好的</p>
                    <ul className="space-y-1 text-[13px] text-text-primary">
                      {summary.strengths.map((s) => (
                        <li key={s}>· {s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {summary.weaknesses.length > 0 && (
                  <div className="mb-3">
                    <p className="mb-1.5 text-xs font-medium text-amber-700">需改进的</p>
                    <ul className="space-y-1 text-[13px] text-text-primary">
                      {summary.weaknesses.map((s) => (
                        <li key={s}>· {s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {summary.threeDayPlan.length > 0 && (
                  <div className="rounded-[6px] bg-page-bg px-3 py-2.5">
                    <p className="mb-1.5 text-xs font-medium text-brand">三天练习计划</p>
                    <ul className="space-y-1 text-[13px] text-text-primary">
                      {summary.threeDayPlan.map((s) => (
                        <li key={s}>· {s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </V20Card>
            )}

            <div className="space-y-3">
              <h2 className="text-[15px] font-medium text-text-primary">问答优化（{qaList.length} 题）</h2>
              {qaList.map((qa, idx) => (
                <V20Card key={`${qa.title}-${idx}`} className="overflow-hidden p-0">
                  <div className="border-b border-border bg-page-bg/50 px-5 py-3">
                    <p className="text-sm font-medium text-text-primary">
                      第 {idx + 1} 题 · {qa.title}
                    </p>
                  </div>
                  <div className="space-y-0">
                    <div className="border-b border-border/60 px-5 py-3">
                      <p className="mb-1 text-[11px] text-text-secondary">面试官</p>
                      <p className="text-[14px] leading-relaxed text-text-secondary">{qa.question}</p>
                    </div>
                    <div className="border-b border-border/60 px-5 py-3">
                      <p className="mb-1 text-[11px] font-medium text-text-primary">你的原回答</p>
                      <p className="text-[14px] leading-relaxed text-text-primary">{qa.answer}</p>
                    </div>
                    {qa.points && qa.points.length > 0 && (
                      <div className="border-b border-border/60 px-5 py-3">
                        <p className="mb-3 text-[11px] font-medium text-brand">逐点点评</p>
                        <div className="space-y-3">
                          {qa.points.map((pt) => (
                            <div key={pt.label} className="rounded-[6px] border border-border bg-page-bg/40 px-3 py-2.5">
                              <p className="mb-1 text-xs font-medium text-text-primary">
                                要点 {pt.label}：{pt.original}
                              </p>
                              <p className="mb-1 text-[12px] text-red-600/90">
                                <span className="font-medium">问题：</span>
                                {pt.issue}
                              </p>
                              <p className="text-[12px] leading-relaxed text-green-700">
                                <span className="font-medium">建议这样说：</span>
                                {pt.better}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {qa.optimizedAnswer && (
                      <div className="bg-amber-50/30 px-5 py-3">
                        <p className="mb-1 text-[11px] font-medium text-amber-700">整合优化版（可直接背）</p>
                        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-text-primary">{qa.optimizedAnswer}</p>
                      </div>
                    )}
                  </div>
                </V20Card>
              ))}
            </div>
          </div>
          <div className="w-full shrink-0 lg:w-[300px]">
            <V20ContextPanel
              task="面试复盘"
              inputs={[
                { label: "问答提取", provided: qaList.length > 0 },
                { label: "逐点优化", provided: qaList.some((q) => (q.points?.length || 0) > 0) },
                { label: "总评", provided: Boolean(summary) },
              ]}
              actions={[
                { label: "打开逐字稿", href: "/tools/interview-script" },
                { label: "答题评分", href: "/tools/answer-scoring" },
              ]}
            />
          </div>
        </div>
      )}
    </div>
  );
}
