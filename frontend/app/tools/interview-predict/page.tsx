"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { HistoryListItem } from "@/components/tools/history-list-item";
import { V20Button, V20Card, V20ContextPanel, V20Input, V20PageHeader, V20Spinner, V20Textarea } from "@/components/tools/v20-ui";
import { useAIDirect } from "@/hooks/use-ai-direct";
import { downloadTextFile, downloadWordHtml, printPdfFromHtml, sanitizeFileName } from "@/lib/document-export";
import { jdRepo, interviewPredictRepo, resumeAnalysisRepo, resumeRepo, scriptRepo, type InterviewPredictRecord } from "@/lib/local-db";
import { buildScriptHtml, buildScriptMarkdown } from "@/lib/script-export";
import { consumePredictHandoff } from "@/lib/tool-handoff";
import { toolPrompts } from "@/lib/tool-prompts";
import type { UserInput } from "@/lib/resume-wizard/types";
import { readFileText } from "@/services/file-parser";
import { generate as generateAI } from "@/services/ai-direct";

type SavedItem = { id: number; title: string; rawContent: string };

type PredictQA = {
  title: string;
  question: string;
  answer: string;
  type: string;
  why: string;
  source: string;
  structure: string;
  followUp: string;
  priority: string;
  generating?: boolean;
};

function normalizeQA(raw: unknown): PredictQA {
  const q = raw as Record<string, unknown>;
  return {
    title: String(q?.title || ""),
    question: String(q?.question || ""),
    answer: String(q?.answer || ""),
    type: String(q?.type || "产品方法"),
    why: String(q?.why || ""),
    source: String(q?.source || "题库"),
    structure: String(q?.structure || ""),
    followUp: String(q?.followUp || ""),
    priority: String(q?.priority || "中"),
  };
}

function parsePredictJson(raw: string): PredictQA[] {
  const trimmed = raw.trim();
  const tryParse = (text: string) => {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) return parsed.map(normalizeQA).filter((q) => q.question.trim());
    return null;
  };

  try {
    const direct = tryParse(trimmed);
    if (direct?.length) return direct;
  } catch {
    // fall through
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      const fromFence = tryParse(fenced[1].trim());
      if (fromFence?.length) return fromFence;
    } catch {
      // fall through
    }
  }

  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start >= 0 && end > start) {
    try {
      const sliced = tryParse(trimmed.slice(start, end + 1));
      if (sliced?.length) return sliced;
    } catch {
      // fall through
    }
  }

  throw new Error("无法解析押题结果，请重试");
}

function qaCardText(qa: PredictQA): string {
  return `【${qa.type}｜优先级：${qa.priority}】${qa.title}\n问题：${qa.question}\n为什么会问：${qa.why}\n来源：${qa.source}\n回答框架：\n${qa.structure}${qa.followUp ? `\n可能追问：${qa.followUp}` : ""}${qa.answer ? `\n\n参考回答：\n${qa.answer}` : ""}`;
}

function priorityClass(priority: string) {
  if (priority === "高") return "bg-red-50 text-red-700 border-red-200";
  if (priority === "中") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-page-bg text-text-secondary border-border";
}

function serializeQuestions(qs: PredictQA[]) {
  return JSON.stringify(qs.map(({ generating, ...q }) => q));
}

function buildPredictTitle(company: string, position: string, mode: string, count: number) {
  const label = [company.trim(), position.trim()].filter(Boolean).join(" · ") || mode;
  return `${label} · ${count} 题`;
}

function parseStoredQuestions(raw: string): PredictQA[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeQA).filter((q) => q.question.trim());
  } catch {
    return [];
  }
}

function MaterialField({
  label,
  value,
  onChange,
  placeholder,
  savedItems,
  onPickSaved,
  onUpload,
  onSaveCurrent,
  canSave,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  savedItems: SavedItem[];
  onPickSaved: (id: string) => void;
  onUpload?: (file: File) => void;
  onSaveCurrent: () => void;
  canSave: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-2 flex h-8 items-center justify-between gap-2">
        <label className="shrink-0 text-sm font-medium text-text-primary">{label}</label>
        <div className="flex min-w-0 shrink-0 items-center gap-1.5">
          {onUpload && (
            <label className="inline-flex h-7 cursor-pointer items-center rounded-[4px] border border-border px-2 text-[11px] leading-none text-text-secondary hover:border-brand hover:text-brand">
              上传
              <input
                type="file"
                accept=".txt,.md,.docx,.pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUpload(file);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          <select
            className="h-7 max-w-[148px] rounded-[4px] border border-border bg-white px-2 text-[11px] text-text-secondary outline-none hover:border-brand"
            value=""
            onChange={(e) => {
              if (e.target.value) onPickSaved(e.target.value);
            }}
          >
            <option value="">
              {savedItems.length > 0 ? `已保存 (${savedItems.length})` : "暂无已保存"}
            </option>
            {savedItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title.slice(0, 22)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!canSave}
            onClick={onSaveCurrent}
            className="inline-flex h-7 items-center rounded-[4px] border border-border px-2 text-[11px] text-text-secondary hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
            title="把当前内容存到本地，下次可从「已保存」选择"
          >
            存本地
          </button>
        </div>
      </div>
      <V20Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-[160px] min-h-[160px] text-[13px]"
        placeholder={placeholder}
      />
    </div>
  );
}

export default function InterviewPredictPage() {
  const ai = useAIDirect();
  const [resumes, setResumes] = useState<SavedItem[]>([]);
  const [jds, setJds] = useState<SavedItem[]>([]);
  const [jdText, setJdText] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [company, setCompany] = useState("");
  const [position, setPosition] = useState("");
  const [questions, setQuestions] = useState<PredictQA[]>([]);
  const [generatingAnswerIdx, setGeneratingAnswerIdx] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState<InterviewPredictRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyRecordId, setHistoryRecordId] = useState<number | null>(null);
  const [handoffHint, setHandoffHint] = useState("");
  const [toast, setToast] = useState("");

  const refreshSaved = async () => {
    const [resumeList, jdList, analysisList] = await Promise.all([
      resumeRepo.list(),
      jdRepo.list(),
      resumeAnalysisRepo.list(),
    ]);

    const fromResumes: SavedItem[] = resumeList
      .filter((r) => r.id != null)
      .map((r) => ({
        id: r.id!,
        title: r.title || "未命名简历",
        rawContent: r.optimizedContent || r.rawContent || "",
      }))
      .filter((r) => r.rawContent.trim());

    const fromJds: SavedItem[] = jdList
      .filter((j) => j.id != null)
      .map((j) => ({
        id: j.id!,
        title: j.title || j.company || "未命名 JD",
        rawContent: j.rawContent || "",
      }))
      .filter((j) => j.rawContent.trim());

    // JD 定向优化历史里也常有 JD，补进可选列表（id 用负数避免和 jdRepo 冲突）
    const fromAnalysis: SavedItem[] = [];
    for (const rec of analysisList) {
      if (rec.id == null || !rec.userInput) continue;
      try {
        const input = JSON.parse(rec.userInput) as UserInput;
        const jd = (input.jobDescription || "").trim();
        if (!jd) continue;
        const title = `${input.targetRole || "优化记录"} · JD`;
        if (fromJds.some((j) => j.rawContent === jd) || fromAnalysis.some((j) => j.rawContent === jd)) continue;
        fromAnalysis.push({
          id: -Number(rec.id),
          title,
          rawContent: jd,
        });
      } catch {
        // ignore bad records
      }
    }

    setResumes(fromResumes);
    setJds([...fromJds, ...fromAnalysis]);
  };

  useEffect(() => {
    void refreshSaved();
    void interviewPredictRepo.list().then(setHistory);

    const handoff = consumePredictHandoff();
    if (!handoff) return;
    if (handoff.resumeText) setResumeText(handoff.resumeText);
    if (handoff.jdText) setJdText(handoff.jdText);
    if (handoff.company) setCompany(handoff.company);
    if (handoff.position) setPosition(handoff.position);
    setHandoffHint(
      handoff.source === "jd-analysis"
        ? "已从「JD 定向优化」带入简历与 JD，可直接生成押题"
        : "已带入上一页材料，可直接生成押题",
    );
  }, []);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  };

  const predictMode = useMemo(() => {
    if (jdText && resumeText) return "定制化押题";
    if (jdText) return "岗位通用押题";
    if (resumeText) return "简历深挖押题";
    return "通用题库";
  }, [jdText, resumeText]);

  const typeSummary = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const q of questions) {
      counts[q.type] = (counts[q.type] || 0) + 1;
    }
    return Object.entries(counts).map(([type, count]) => `${type} ${count}`).join(" · ");
  }, [questions]);

  const buildUserContent = () => {
    const parts = [
      jdText.trim() ? `【JD】\n${jdText.trim()}` : "",
      resumeText.trim() ? `【候选人简历】\n${resumeText.trim()}` : "",
      company.trim() || position.trim()
        ? `【公司/岗位】\n${[company.trim(), position.trim()].filter(Boolean).join(" · ")}`
        : "",
    ].filter(Boolean);
    return parts.join("\n\n") || "（未提供任何材料，请基于 AI 产品经理通用题库输出）";
  };

  const generate = async () => {
    setSaved(false);
    setHistoryRecordId(null);
    setQuestions([]);
    ai.reset();
    try {
      const response = await ai.send(
        [{ role: "system", content: toolPrompts.interviewPredict }, { role: "user", content: buildUserContent() }],
        { temperature: 0.65, max_tokens: 16384, task: "predict" },
      );
      const content = response.content?.trim() || "";
      if (!content) {
        flash("AI 返回了空内容，请稍后重试或缩短 JD/简历长度");
        return;
      }
      const parsed = parsePredictJson(content);
      setQuestions(parsed);
      flash(`已生成 ${parsed.length} 道题（${predictMode}）`);
    } catch (err) {
      if (!(err instanceof Error && err.message.includes("无法解析"))) throw err;
      flash(err.message);
    }
  };

  const generateAnswer = async (idx: number) => {
    const qa = questions[idx];
    if (!qa || generatingAnswerIdx !== null) return;
    if (!resumeText.trim()) {
      flash("请先填写简历，才能生成针对你的完整回答");
      return;
    }
    setGeneratingAnswerIdx(idx);
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, generating: true } : q)));
    try {
      const res = await generateAI(
        [
          { role: "system", content: toolPrompts.interviewPredictFullAnswer },
          {
            role: "user",
            content: `面试问题：${qa.question}

简历素材：
${resumeText.trim()}

${jdText.trim() ? `JD 要点：\n${jdText.trim().slice(0, 2500)}\n` : ""}
按此框架组织回答：
${qa.structure}`,
          },
        ],
        { temperature: 0.55, max_tokens: 4096, task: "predict" },
      );
      setQuestions((prev) =>
        prev.map((q, i) => (i === idx ? { ...q, answer: res.content.trim(), generating: false } : q)),
      );
      flash("完整回答已生成");
    } catch (err) {
      flash(err instanceof Error ? err.message : "生成回答失败");
      setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, generating: false } : q)));
    } finally {
      setGeneratingAnswerIdx(null);
    }
  };

  const addToScript = async () => {
    if (!questions.length) return;
    const pairs = questions.map((q) => ({
      title: q.title || q.type,
      question: q.question,
      answer: q.answer,
      type: q.type,
      why: q.why,
      structure: q.structure,
      followUp: q.followUp,
      priority: q.priority,
      source: q.source,
    }));
    await scriptRepo.create({
      title: `押题-${predictMode}-${new Date().toLocaleDateString("zh-CN")}`,
      qaPairs: JSON.stringify(pairs),
      resumeText: resumeText.trim() || undefined,
    });
    setSaved(true);
    flash(`已将 ${pairs.length} 道题加入逐字稿`);
  };

  const saveToHistory = async () => {
    if (!questions.length) return;
    const payload = {
      title: buildPredictTitle(company, position, predictMode, questions.length),
      mode: predictMode,
      company: company.trim() || undefined,
      position: position.trim() || undefined,
      jdText: jdText.trim() || undefined,
      resumeText: resumeText.trim() || undefined,
      questions: serializeQuestions(questions),
    };
    try {
      const isUpdate = historyRecordId != null;
      if (isUpdate) {
        await interviewPredictRepo.update(historyRecordId, payload);
      } else {
        const id = await interviewPredictRepo.create(payload);
        setHistoryRecordId(typeof id === "number" ? id : null);
      }
      const list = await interviewPredictRepo.list();
      setHistory(list);
      flash(isUpdate ? "历史记录已更新" : "已保存到历史记录");
    } catch {
      flash("保存失败，请稍后重试");
    }
  };

  const loadHistoryRecord = (record: InterviewPredictRecord) => {
    setCompany(record.company || "");
    setPosition(record.position || "");
    setJdText(record.jdText || "");
    setResumeText(record.resumeText || "");
    setQuestions(parseStoredQuestions(record.questions));
    setHistoryRecordId(record.id ?? null);
    setSaved(false);
    setShowHistory(false);
    ai.reset();
    flash(`已载入：${record.title}`);
  };

  const saveJdLocal = async () => {
    if (!jdText.trim()) return;
    await jdRepo.create({
      title: position ? `${position} JD` : `JD ${new Date().toLocaleDateString("zh-CN")}`,
      company: company || undefined,
      rawContent: jdText.trim(),
    });
    await refreshSaved();
    flash("JD 已存到本地，可从「已保存」下拉选择");
  };

  const saveResumeLocal = async () => {
    if (!resumeText.trim()) return;
    await resumeRepo.create({
      title: position ? `${position} 简历` : `简历 ${new Date().toLocaleDateString("zh-CN")}`,
      rawContent: resumeText.trim(),
    });
    await refreshSaved();
    flash("简历已存到本地，可从「已保存」下拉选择");
  };

  const exportTitle = buildPredictTitle(company, position, predictMode, questions.length);
  const exportFileBase = sanitizeFileName(exportTitle || "面试押题");

  const exportMarkdown = () => {
    if (!questions.length) return;
    downloadTextFile(`${exportFileBase}.md`, buildScriptMarkdown(exportTitle, questions), "text/markdown;charset=utf-8");
    flash("已导出 Markdown");
  };

  const exportWord = () => {
    if (!questions.length) return;
    downloadWordHtml(exportTitle || "面试押题", buildScriptHtml(exportTitle, questions));
    flash("已导出 Word");
  };

  const exportPdf = () => {
    if (!questions.length) return;
    const ok = printPdfFromHtml(exportTitle || "面试押题", buildScriptHtml(exportTitle, questions));
    if (!ok) flash("无法打开打印窗口，请检查浏览器弹窗拦截");
    else flash("已打开 PDF 打印");
  };

  return (
    <div>
      <V20PageHeader
        title="面试押题"
        description="灵活输入 JD / 简历 / 公司岗位，自动判断押题模式"
        extra={
          history.length > 0 ? (
            <button type="button" className="text-sm text-brand hover:text-brand-hover" onClick={() => setShowHistory((v) => !v)}>
              {showHistory ? "收起历史" : `历史记录 (${history.length})`}
            </button>
          ) : null
        }
      />
      {handoffHint && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-[8px] border border-brand/20 bg-brand/5 px-4 py-2.5 text-sm text-text-primary">
          <span>{handoffHint}</span>
          <button type="button" className="shrink-0 text-xs text-text-secondary hover:text-brand" onClick={() => setHandoffHint("")}>
            知道了
          </button>
        </div>
      )}
      {toast && (
        <div className="mb-3 rounded-[6px] border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">{toast}</div>
      )}

      {showHistory && history.length > 0 && (
        <div className="mb-4 space-y-2">
          {history.map((record) => {
            const preview = parseStoredQuestions(record.questions);
            const firstQuestion = preview[0]?.question || "";
            return (
              <HistoryListItem
                key={record.id}
                title={record.title}
                preview={firstQuestion}
                subtitle={`${preview.length} 道题 · ${new Date(record.createdAt).toLocaleString("zh-CN")}`}
                badge={<span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] text-brand">{record.mode}</span>}
                onOpen={() => loadHistoryRecord(record)}
                onRename={async (nextTitle) => {
                  if (record.id == null) return;
                  await interviewPredictRepo.update(record.id, { title: nextTitle });
                  setHistory(await interviewPredictRepo.list());
                  flash("已重命名");
                }}
                onDelete={async () => {
                  if (record.id == null) return;
                  await interviewPredictRepo.remove(record.id);
                  setHistory(await interviewPredictRepo.list());
                  if (historyRecordId === record.id) {
                    setHistoryRecordId(null);
                    setQuestions([]);
                  }
                  flash("已删除");
                }}
              />
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-4">
          <V20Card>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-medium text-text-primary">输入材料</h2>
              <span className="text-[11px] text-text-secondary">至少填一项；都不填则出通用题库</span>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
              <MaterialField
                label="JD"
                value={jdText}
                onChange={setJdText}
                placeholder="粘贴 JD 全文，或从右侧「已保存」选择"
                savedItems={jds}
                onPickSaved={(id) => {
                  const found = jds.find((item) => String(item.id) === id);
                  if (found) setJdText(found.rawContent);
                }}
                onUpload={(file) => void readFileText(file).then(setJdText)}
                onSaveCurrent={() => void saveJdLocal()}
                canSave={Boolean(jdText.trim())}
              />
              <MaterialField
                label="简历"
                value={resumeText}
                onChange={setResumeText}
                placeholder="粘贴简历全文，或上传 / 从「已保存」选择"
                savedItems={resumes}
                onPickSaved={(id) => {
                  const found = resumes.find((item) => String(item.id) === id);
                  if (found) setResumeText(found.rawContent);
                }}
                onUpload={(file) => void readFileText(file).then(setResumeText)}
                onSaveCurrent={() => void saveResumeLocal()}
                canSave={Boolean(resumeText.trim())}
              />
            </div>

            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-text-secondary">目标公司</label>
                <V20Input value={company} onChange={(e) => setCompany(e.target.value)} className="p-2.5 text-[13px]" placeholder="如：字节跳动（选填）" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-secondary">目标岗位</label>
                <V20Input value={position} onChange={(e) => setPosition(e.target.value)} className="p-2.5 text-[13px]" placeholder="如：AI 产品经理（选填）" />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <V20Button className="font-medium" disabled={ai.loading} onClick={() => void generate()}>
                {ai.loading ? "生成中..." : "生成押题"}
              </V20Button>
              <span className="rounded-full bg-brand/10 px-2.5 py-1 text-[11px] text-brand">当前：{predictMode}</span>
              {(jdText || resumeText || company || position) && (
                <button
                  type="button"
                  className="rounded-[6px] border border-border px-3 py-2 text-xs text-text-secondary hover:text-red-500"
                  onClick={() => {
                    setJdText("");
                    setResumeText("");
                    setCompany("");
                    setPosition("");
                    setQuestions([]);
                    setHistoryRecordId(null);
                    ai.reset();
                  }}
                >
                  清空输入
                </button>
              )}
            </div>
            {jds.length === 0 && resumes.length === 0 && (
              <p className="mt-3 text-[11px] leading-relaxed text-text-secondary">
                提示：点开「已保存」若显示「暂无已保存」，说明本地还没有入库记录。可粘贴内容后点「存本地」；或从「JD 定向优化 → 导出」点「带着简历去押题 / 保存到本地库」。
              </p>
            )}
          </V20Card>

          {ai.loading && (
            <V20Card>
              <V20Spinner label="生成中..." />
            </V20Card>
          )}

          {ai.error && !ai.loading && (
            <V20Card className="border-red-200 bg-red-50">
              <p className="text-sm font-medium text-red-700">生成失败</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-red-600">{ai.error}</p>
              <p className="mt-3 text-xs text-red-500/80">
                请确认后端已启动（localhost:8000），或在「设置」页配置浏览器 API Key 后重试。
              </p>
              <button
                type="button"
                className="mt-3 rounded-[6px] border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-100"
                onClick={() => void generate()}
              >
                重试
              </button>
            </V20Card>
          )}

          {questions.length > 0 && !ai.loading && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-border bg-white px-4 py-2.5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                <div className="text-xs text-text-secondary">
                  已生成 {questions.length} 道题 · {typeSummary}
                  {historyRecordId ? " · 已载入历史" : ""}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-[6px] border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-brand hover:text-brand"
                    onClick={() => void saveToHistory()}
                  >
                    {historyRecordId ? "更新历史" : "保存到历史"}
                  </button>
                  <button
                    type="button"
                    className="rounded-[6px] border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-brand hover:text-brand"
                    onClick={() => void navigator.clipboard.writeText(questions.map(qaCardText).join("\n\n---\n\n")).then(() => flash("已复制全部题目"))}
                  >
                    复制全部
                  </button>
                  <button
                    type="button"
                    className="rounded-[6px] border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-brand hover:text-brand"
                    onClick={exportMarkdown}
                  >
                    导出 Markdown
                  </button>
                  <button
                    type="button"
                    className="rounded-[6px] border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-brand hover:text-brand"
                    onClick={exportWord}
                  >
                    导出 Word
                  </button>
                  <button
                    type="button"
                    className="rounded-[6px] border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-brand hover:text-brand"
                    onClick={exportPdf}
                  >
                    导出 PDF
                  </button>
                  <button type="button" className="rounded-[6px] bg-brand px-3 py-1.5 text-xs text-white hover:bg-brand-hover" onClick={() => void addToScript()}>
                    {saved ? "已加入逐字稿" : "加入逐字稿"}
                  </button>
                  <Link href="/tools/interview-script" className="rounded-[6px] border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-brand hover:text-brand">
                    打开逐字稿
                  </Link>
                </div>
              </div>

              <div className="space-y-3">
                {questions.map((qa, idx) => (
                  <div key={`${qa.question}-${idx}`} className="overflow-hidden rounded-[8px] border border-border bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                    <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
                      <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] text-brand">{qa.type}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] ${priorityClass(qa.priority)}`}>
                        优先级 {qa.priority}
                      </span>
                      <span className="text-[11px] text-text-secondary">来源 {qa.source}</span>
                      {qa.title && <span className="text-[11px] font-medium text-text-primary">{qa.title}</span>}
                      <div className="flex-1" />
                      <button
                        type="button"
                        className="text-[11px] text-text-secondary hover:text-brand"
                        onClick={() => void navigator.clipboard.writeText(qaCardText(qa)).then(() => flash("已复制"))}
                      >
                        复制
                      </button>
                    </div>
                    <div className="space-y-3 px-5 py-3">
                      <div>
                        <p className="text-[14px] font-medium leading-relaxed text-text-primary">{qa.question}</p>
                        {qa.why && <p className="mt-1.5 text-[12px] leading-relaxed text-text-secondary">为什么会问：{qa.why}</p>}
                      </div>
                      {qa.structure && (
                        <div className="rounded-[6px] bg-page-bg px-3 py-2.5">
                          <p className="mb-1 text-[11px] text-text-secondary">回答框架（点名你的经历）</p>
                          <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-text-primary">{qa.structure}</p>
                        </div>
                      )}
                      {qa.followUp && <p className="text-[12px] leading-relaxed text-amber-700">可能追问：{qa.followUp}</p>}
                      {qa.answer && (
                        <div className="border-t border-border pt-3">
                          <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-[11px] font-medium text-brand">参考回答（基于你的简历）</span>
                            <button
                              type="button"
                              className="text-[11px] text-text-secondary hover:text-brand"
                              onClick={() => void navigator.clipboard.writeText(qa.answer).then(() => flash("已复制回答"))}
                            >
                              复制回答
                            </button>
                          </div>
                          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-text-primary">{qa.answer}</p>
                        </div>
                      )}
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          disabled={generatingAnswerIdx !== null}
                          className="rounded-[6px] border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-brand hover:text-brand disabled:opacity-50"
                          onClick={() => void generateAnswer(idx)}
                        >
                          {qa.generating ? "生成中..." : qa.answer ? "重新生成回答" : "生成完整回答"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {!questions.length && !ai.loading && !ai.error && (
            <div className="flex flex-col items-center rounded-[8px] border border-dashed border-border bg-white px-5 py-10">
              <p className="text-sm text-text-secondary">还没有押题结果</p>
              <p className="mt-1 text-xs text-text-secondary">填写 JD + 简历可出 8～10 道定制题；每题可单独「生成完整回答」</p>
            </div>
          )}
        </div>

        <div className="w-full shrink-0 lg:sticky lg:top-4 lg:w-[280px]">
          <V20ContextPanel
            task={predictMode}
            inputs={[
              { label: "JD", provided: Boolean(jdText) },
              { label: "简历", provided: Boolean(resumeText) },
              { label: "公司/岗位", provided: Boolean(company || position) },
            ]}
            missing={!jdText && !resumeText ? ["未提供 JD 或简历，将使用通用题库"] : []}
            actions={[
              { label: "导出 Markdown", onClick: exportMarkdown },
              { label: "导出 Word", onClick: exportWord },
              { label: "导出 PDF", onClick: exportPdf },
              { label: "加入逐字稿", onClick: () => void addToScript() },
              { label: "打开逐字稿", href: "/tools/interview-script" },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
