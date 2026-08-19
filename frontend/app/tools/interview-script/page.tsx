"use client";

import { useEffect, useMemo, useState } from "react";

import { HistoryListItem } from "@/components/tools/history-list-item";
import { ScriptQACard } from "@/components/tools/script-qa-card";
import { V20Button, V20Card, V20Empty, V20Link, V20PageHeader, V20Textarea } from "@/components/tools/v20-ui";
import { downloadTextFile, downloadWordHtml, printPdfFromHtml, sanitizeFileName } from "@/lib/document-export";
import { parseScriptQaPairs, resumeRepo, scriptRepo, type ScriptQAPair, type ScriptRecord } from "@/lib/local-db";
import { buildScriptHtml, buildScriptMarkdown, pickScriptExportItems } from "@/lib/script-export";
import { qaCardText } from "@/lib/script-qa-types";
import { toolPrompts } from "@/lib/tool-prompts";
import { generate as generateAI } from "@/services/ai-direct";
import { readFileText } from "@/services/file-parser";

export default function InterviewScriptPage() {
  const [scripts, setScripts] = useState<ScriptRecord[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [qaItems, setQaItems] = useState<ScriptQAPair[]>([]);
  const [resumeText, setResumeText] = useState("");
  const [savedResumes, setSavedResumes] = useState<Array<{ id: number; title: string; rawContent: string }>>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [generatingIdx, setGeneratingIdx] = useState<number | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [toast, setToast] = useState("");

  const refreshSavedResumes = async () => {
    const list = await resumeRepo.list();
    setSavedResumes(
      list
        .filter((r) => r.id != null)
        .map((r) => ({
          id: r.id!,
          title: r.title || "未命名简历",
          rawContent: r.optimizedContent || r.rawContent || "",
        }))
        .filter((r) => r.rawContent.trim()),
    );
  };

  useEffect(() => {
    void scriptRepo.list().then(setScripts);
    void refreshSavedResumes();
  }, []);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2500);
  };

  const activeScript = useMemo(() => scripts.find((item) => item.id === activeId) ?? null, [activeId, scripts]);

  const persist = async (nextTitle = title, nextQa = qaItems, nextResume = resumeText) => {
    if (!activeScript?.id) return;
    await scriptRepo.update(activeScript.id, {
      title: nextTitle,
      qaPairs: JSON.stringify(nextQa.map(({ generating, ...q }) => q)),
      resumeText: nextResume.trim() || undefined,
    });
    setScripts(await scriptRepo.list());
  };

  const openScript = (script: ScriptRecord) => {
    setActiveId(script.id ?? null);
    setTitle(script.title);
    setQaItems(parseScriptQaPairs(script.qaPairs));
    setResumeText(script.resumeText || "");
    setSelected(new Set());
  };

  const buildGeneratePrompt = (qa: ScriptQAPair) => `面试问题：${qa.question}

简历素材：
${resumeText.trim()}

${qa.structure ? `按此框架组织回答：\n${qa.structure}` : "请结合简历给出完整口述回答。"}`;

  const buildOptimizePrompt = (qa: ScriptQAPair) => {
    const current = qa.optimizedAnswer || qa.answer || qa.structure || "";
    return `面试问题：${qa.question}

当前回答：
${current}

简历素材：
${resumeText.trim()}

${qa.structure ? `可参考框架：\n${qa.structure}` : ""}`;
  };

  const generateAnswer = async (idx: number) => {
    const qa = qaItems[idx];
    if (!qa || generatingIdx !== null || batchBusy) return;
    if (!resumeText.trim()) {
      flash("请先填写或选择简历");
      return;
    }
    setGeneratingIdx(idx);
    setQaItems((prev) => prev.map((q, i) => (i === idx ? { ...q, generating: true } : q)));
    try {
      const res = await generateAI(
        [{ role: "system", content: toolPrompts.interviewPredictFullAnswer }, { role: "user", content: buildGeneratePrompt(qa) }],
        { temperature: 0.55, max_tokens: 4096, task: "predict" },
      );
      const content = res.content.trim();
      setQaItems((prev) => {
        const next = prev.map((q, i) =>
          i === idx ? { ...q, answer: content, optimizedAnswer: "", generating: false } : q,
        );
        void persist(title, next);
        return next;
      });
      flash("完整回答已生成");
    } catch (err) {
      flash(err instanceof Error ? err.message : "生成失败");
      setQaItems((prev) => prev.map((q, i) => (i === idx ? { ...q, generating: false } : q)));
    } finally {
      setGeneratingIdx(null);
    }
  };

  const optimizeAnswer = async (idx: number) => {
    const qa = qaItems[idx];
    if (!qa || generatingIdx !== null || batchBusy) return;
    if (!resumeText.trim()) {
      flash("请先填写或选择简历");
      return;
    }
    if (!qa.answer && !qa.structure) {
      flash("请先生成回答或补充回答框架");
      return;
    }
    setGeneratingIdx(idx);
    setQaItems((prev) => prev.map((q, i) => (i === idx ? { ...q, generating: true } : q)));
    try {
      const res = await generateAI(
        [{ role: "system", content: toolPrompts.interviewScriptOptimizeAnswer }, { role: "user", content: buildOptimizePrompt(qa) }],
        { temperature: 0.5, max_tokens: 4096, task: "predict" },
      );
      const content = res.content.trim();
      setQaItems((prev) => {
        const next = prev.map((q, i) => (i === idx ? { ...q, optimizedAnswer: content, generating: false } : q));
        void persist(title, next);
        return next;
      });
      flash("已根据简历优化");
    } catch (err) {
      flash(err instanceof Error ? err.message : "优化失败");
      setQaItems((prev) => prev.map((q, i) => (i === idx ? { ...q, generating: false } : q)));
    } finally {
      setGeneratingIdx(null);
    }
  };

  const optimizeAll = async () => {
    if (!resumeText.trim()) {
      flash("请先填写或选择简历");
      return;
    }
    if (!qaItems.length) return;
    setBatchBusy(true);
    let working = qaItems.map((q) => ({ ...q }));
    try {
      for (let i = 0; i < working.length; i += 1) {
        let qa = working[i];
        if (!qa.question) continue;
        working = working.map((q, idx) => (idx === i ? { ...q, generating: true } : q));
        setQaItems([...working]);

        if (!qa.answer?.trim() && qa.structure?.trim()) {
          const gen = await generateAI(
            [{ role: "system", content: toolPrompts.interviewPredictFullAnswer }, { role: "user", content: buildGeneratePrompt(qa) }],
            { temperature: 0.55, max_tokens: 4096, task: "predict" },
          );
          qa = { ...qa, answer: gen.content.trim() };
        }

        const res = await generateAI(
          [{ role: "system", content: toolPrompts.interviewScriptOptimizeAnswer }, { role: "user", content: buildOptimizePrompt(qa) }],
          { temperature: 0.5, max_tokens: 4096, task: "predict" },
        );
        working = working.map((q, idx) =>
          idx === i ? { ...qa, optimizedAnswer: res.content.trim(), generating: false } : { ...q, generating: false },
        );
        setQaItems([...working]);
      }
      await persist(title, working);
      flash(`已优化全部 ${working.length} 题`);
    } catch (err) {
      flash(err instanceof Error ? err.message : "批量优化失败");
      setQaItems((prev) => prev.map((q) => ({ ...q, generating: false })));
    } finally {
      setBatchBusy(false);
      setGeneratingIdx(null);
    }
  };

  const generateAllAnswers = async () => {
    if (!resumeText.trim()) {
      flash("请先填写、上传或选择简历");
      return;
    }
    if (!qaItems.length) return;
    setBatchBusy(true);
    let working = qaItems.map((q) => ({ ...q }));
    try {
      for (let i = 0; i < working.length; i += 1) {
        const qa = working[i];
        if (!qa.question || qa.answer?.trim()) continue;
        working = working.map((q, idx) => (idx === i ? { ...q, generating: true } : q));
        setQaItems([...working]);
        const res = await generateAI(
          [{ role: "system", content: toolPrompts.interviewPredictFullAnswer }, { role: "user", content: buildGeneratePrompt(qa) }],
          { temperature: 0.55, max_tokens: 4096, task: "predict" },
        );
        working = working.map((q, idx) =>
          idx === i ? { ...q, answer: res.content.trim(), optimizedAnswer: "", generating: false } : { ...q, generating: false },
        );
        setQaItems([...working]);
      }
      await persist(title, working);
      flash("全部完整回答已生成");
    } catch (err) {
      flash(err instanceof Error ? err.message : "批量生成失败");
      setQaItems((prev) => prev.map((q) => ({ ...q, generating: false })));
    } finally {
      setBatchBusy(false);
      setGeneratingIdx(null);
    }
  };

  const saveResumeLocal = async () => {
    if (!resumeText.trim()) return;
    await resumeRepo.create({
      title: `逐字稿简历-${new Date().toLocaleDateString("zh-CN")}`,
      rawContent: resumeText.trim(),
    });
    await refreshSavedResumes();
    flash("简历已存到本地");
  };

  const copySelected = async () => {
    const text = [...selected]
      .sort()
      .map((index) => qaCardText(qaItems[index]))
      .join("\n\n---\n\n");
    await navigator.clipboard.writeText(text);
    flash("已复制选中题目");
  };

  const exportItems = () => pickScriptExportItems(qaItems, selected);
  const exportFileBase = sanitizeFileName(title || "逐字稿");

  const exportMarkdown = () => {
    const items = exportItems();
    if (!items.length) {
      flash("没有可导出的内容");
      return;
    }
    downloadTextFile(`${exportFileBase}.md`, buildScriptMarkdown(title, items), "text/markdown;charset=utf-8");
    flash(selected.size ? `已导出 ${items.length} 题（Markdown）` : "已导出 Markdown");
  };

  const exportWord = () => {
    const items = exportItems();
    if (!items.length) {
      flash("没有可导出的内容");
      return;
    }
    downloadWordHtml(title || "逐字稿", buildScriptHtml(title, items));
    flash(selected.size ? `已导出 ${items.length} 题（Word）` : "已导出 Word");
  };

  const exportPdf = () => {
    const items = exportItems();
    if (!items.length) {
      flash("没有可导出的内容");
      return;
    }
    const ok = printPdfFromHtml(title || "逐字稿", buildScriptHtml(title, items));
    if (!ok) flash("无法打开打印窗口，请检查浏览器弹窗拦截");
    else flash(selected.size ? `已打开 ${items.length} 题 PDF 打印` : "已打开 PDF 打印");
  };

  return (
    <div>
      <V20PageHeader title="逐字稿" description="与面试押题同结构，支持基于简历生成与优化回答" />
      {toast && <div className="mb-3 rounded-[6px] border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">{toast}</div>}

      {!activeScript ? (
        scripts.length === 0 ? (
          <V20Empty icon="📄">
            <p>还没有逐字稿</p>
            <p className="mt-2 text-xs">
              从 <V20Link href="/tools/interview-predict">面试押题</V20Link> 或 <V20Link href="/tools/interview-review">面试复盘</V20Link> 导入
            </p>
          </V20Empty>
        ) : (
          <div className="space-y-2">
            {scripts.map((script) => (
              <HistoryListItem
                key={script.id}
                title={script.title}
                preview={(script.qaPairs || "").replace(/\s+/g, " ").slice(0, 120)}
                subtitle={new Date(script.createdAt).toLocaleString("zh-CN")}
                onOpen={() => openScript(script)}
                onRename={async (nextTitle) => {
                  if (script.id == null) return;
                  await scriptRepo.update(script.id, { title: nextTitle });
                  setScripts(await scriptRepo.list());
                  flash("已重命名");
                }}
                onDelete={async () => {
                  if (script.id == null) return;
                  await scriptRepo.remove(script.id);
                  setScripts(await scriptRepo.list());
                  flash("已删除");
                }}
              />
            ))}
          </div>
        )
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="text-sm text-brand hover:text-brand-hover" onClick={() => setActiveId(null)}>
              ← 返回
            </button>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => void persist()}
              className="min-w-[200px] flex-1 border-b border-transparent bg-transparent text-[16px] font-medium text-text-primary outline-none hover:border-border focus:border-brand"
            />
            <V20Button variant="outline" onClick={() => void persist()} disabled={batchBusy || generatingIdx !== null}>
              保存
            </V20Button>
            {qaItems.length > 0 && (
              <>
                <button
                  type="button"
                  disabled={batchBusy || generatingIdx !== null}
                  className="rounded-[4px] border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-brand hover:text-brand disabled:opacity-50"
                  onClick={exportMarkdown}
                >
                  导出 Markdown
                </button>
                <button
                  type="button"
                  disabled={batchBusy || generatingIdx !== null}
                  className="rounded-[4px] border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-brand hover:text-brand disabled:opacity-50"
                  onClick={exportWord}
                >
                  导出 Word
                </button>
                <button
                  type="button"
                  disabled={batchBusy || generatingIdx !== null}
                  className="rounded-[4px] border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-brand hover:text-brand disabled:opacity-50"
                  onClick={exportPdf}
                >
                  导出 PDF
                </button>
              </>
            )}
            <button
              type="button"
              className="rounded-[4px] border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-red-300 hover:text-red-500"
              onClick={() => {
                if (!activeScript.id) return;
                if (!window.confirm(`确定删除「${activeScript.title}」？`)) return;
                void scriptRepo.remove(activeScript.id).then(async () => {
                  setScripts(await scriptRepo.list());
                  setActiveId(null);
                  flash("已删除");
                });
              }}
            >
              删除
            </button>
          </div>

          <V20Card>
            <div className="mb-2 flex h-8 items-center justify-between gap-2">
              <div>
                <h2 className="text-[15px] font-medium text-text-primary">简历素材</h2>
                <p className="text-[11px] text-text-secondary">上传 / 选择已保存简历，用于生成完整回答</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <label className="inline-flex h-7 cursor-pointer items-center rounded-[4px] border border-border px-2 text-[11px] text-text-secondary hover:border-brand hover:text-brand">
                  上传
                  <input
                    type="file"
                    accept=".txt,.md,.docx,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      void readFileText(file).then((text) => {
                        setResumeText(text);
                        void persist(title, qaItems, text);
                        flash("简历已上传");
                      });
                      e.target.value = "";
                    }}
                  />
                </label>
                <select
                  className="h-7 max-w-[148px] rounded-[4px] border border-border bg-white px-2 text-[11px] text-text-secondary outline-none hover:border-brand"
                  value=""
                  onChange={(e) => {
                    const found = savedResumes.find((r) => String(r.id) === e.target.value);
                    if (found) {
                      setResumeText(found.rawContent);
                      void persist(title, qaItems, found.rawContent);
                      flash("已载入简历");
                    }
                  }}
                >
                  <option value="">{savedResumes.length > 0 ? `已保存 (${savedResumes.length})` : "暂无已保存"}</option>
                  {savedResumes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title.slice(0, 22)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!resumeText.trim()}
                  onClick={() => void saveResumeLocal()}
                  className="inline-flex h-7 items-center rounded-[4px] border border-border px-2 text-[11px] text-text-secondary hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
                >
                  存本地
                </button>
              </div>
            </div>
            <V20Textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              onBlur={() => void persist(title, qaItems, resumeText)}
              className="min-h-[120px] text-[13px]"
              placeholder="粘贴或上传简历全文，生成完整回答时会引用其中的项目与数据"
            />
          </V20Card>

          {qaItems.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-border bg-white px-4 py-2.5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
              <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-text-primary">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand"
                  checked={selected.size === qaItems.length}
                  onChange={() => setSelected(selected.size === qaItems.length ? new Set() : new Set(qaItems.map((_, i) => i)))}
                />
                全选（{selected.size}/{qaItems.length}）
                {selected.size > 0 && <span className="text-xs text-text-secondary">· 导出仅含选中</span>}
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!selected.size}
                  className="rounded-[6px] border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-brand hover:text-brand disabled:opacity-50"
                  onClick={() => void copySelected()}
                >
                  复制选中
                </button>
                <button
                  type="button"
                  disabled={batchBusy || generatingIdx !== null || !resumeText.trim()}
                  className="rounded-[6px] border border-brand bg-brand/5 px-3 py-1.5 text-xs text-brand hover:bg-brand/10 disabled:opacity-50"
                  onClick={() => void generateAllAnswers()}
                >
                  {batchBusy ? "生成中..." : "生成全部完整回答"}
                </button>
                <button
                  type="button"
                  disabled={batchBusy || generatingIdx !== null || !resumeText.trim()}
                  className="rounded-[6px] bg-brand px-3 py-1.5 text-xs text-white hover:bg-brand-hover disabled:opacity-50"
                  onClick={() => void optimizeAll()}
                >
                  {batchBusy ? "批量优化中..." : "根据简历优化全部"}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {qaItems.map((qa, index) => (
              <ScriptQACard
                key={`${qa.question}-${index}`}
                qa={qa}
                index={index}
                selected={selected.has(index)}
                onSelect={(checked) => {
                  const next = new Set(selected);
                  if (checked) next.add(index);
                  else next.delete(index);
                  setSelected(next);
                }}
                onCopy={() => void navigator.clipboard.writeText(qaCardText(qa)).then(() => flash("已复制"))}
                onGenerate={() => void generateAnswer(index)}
                onOptimize={() => void optimizeAnswer(index)}
                generateDisabled={generatingIdx !== null || batchBusy}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
