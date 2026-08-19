"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { V20Button, V20Card } from "@/components/tools/v20-ui";
import type { FinalResume } from "@/lib/resume-wizard/types";
import {
  FALLBACK_TEMPLATES,
  buildRenderPrompt,
  convertResumeData,
  ensureResumePaperGrows,
  stripMarkdownHtmlFence,
  wrapHtml,
  type ResumeTemplateInfo,
} from "@/lib/resume-wizard/template-utils";
import { generate as aiGenerate } from "@/services/ai-direct";
import { cn } from "@/lib/utils";

export function TemplateBeautify({ resume }: { resume: FinalResume }) {
  const [templates, setTemplates] = useState<ResumeTemplateInfo[]>(FALLBACK_TEMPLATES);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const [genSuccess, setGenSuccess] = useState(false);
  const [genError, setGenError] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [editContent, setEditContent] = useState("");
  const editRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetch("/templates/templates.json")
      .then((resp) => resp.json())
      .then((data: ResumeTemplateInfo[]) => setTemplates(data))
      .catch(() => setTemplates(FALLBACK_TEMPLATES));
  }, []);

  const selectTemplate = (tpl: ResumeTemplateInfo) => {
    setActiveTemplateId(tpl.id);
    setGenSuccess(false);
    setGenError("");
  };

  const generateWithTemplate = async () => {
    if (!activeTemplateId) return;
    setGenLoading(true);
    setGenSuccess(false);
    setGenError("");

    try {
      const resp = await fetch(`/templates/${activeTemplateId}.html`);
      const tplHtml = await resp.text();
      const data = convertResumeData(resume);
      const prompt = buildRenderPrompt(data, activeTemplateId, tplHtml);

      const result = await aiGenerate(
        [
          { role: "system", content: "你是一位简历 HTML 渲染专家。直接输出 HTML，不要 markdown 代码块。" },
          { role: "user", content: prompt },
        ],
        { task: "resume", temperature: 0.3, max_tokens: 16384 },
      );

      setPreviewHtml(ensureResumePaperGrows(stripMarkdownHtmlFence(result.content)));
      setGenSuccess(true);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setGenLoading(false);
    }
  };

  const saveEdit = () => {
    if (editRef.current) setPreviewHtml(ensureResumePaperGrows(editRef.current.innerHTML));
    setShowEditModal(false);
  };

  const openEdit = () => {
    setEditContent(ensureResumePaperGrows(previewHtml));
    setShowEditModal(true);
  };

  const resizePreviewFrame = (frame: HTMLIFrameElement | null) => {
    if (!frame) return;
    try {
      const doc = frame.contentDocument;
      if (!doc) return;
      const height = Math.max(
        doc.body?.scrollHeight || 0,
        doc.documentElement?.scrollHeight || 0,
        Math.round(297 * 3.78),
      );
      frame.style.height = `${height + 24}px`;
    } catch {
      frame.style.height = "297mm";
    }
  };

  const exportWord = () => {
    if (!previewHtml) return;
    const name = `${resume.personalInfo?.name || "简历"}-${resume.jobIntent || "求职"}`;
    const blob = new Blob(["\ufeff" + wrapHtml(name, previewHtml)], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    if (!previewHtml) return;
    const name = `${resume.personalInfo?.name || "简历"}-${resume.jobIntent || "求职"}`;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(wrapHtml(name, previewHtml));
    win.document.close();
    setTimeout(() => {
      win.focus();
      win.print();
    }, 500);
  };

  return (
    <div className="mt-6">
      <V20Card>
        <h3 className="mb-1 text-[15px] font-medium text-text-primary">🎨 模板美化</h3>
        <p className="mb-4 text-xs text-text-secondary">选择模板 → 生成带排版的美化版简历 → 编辑/导出</p>

        <div className="flex gap-3 overflow-x-auto pb-2">
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              title={tpl.name}
              onClick={() => selectTemplate(tpl)}
              className={cn(
                "w-24 shrink-0 cursor-pointer overflow-hidden rounded-[6px] border-2 transition-all",
                activeTemplateId === tpl.id
                  ? "border-brand shadow-md opacity-100"
                  : "border-transparent opacity-60 hover:border-gray-300 hover:opacity-90",
              )}
            >
              <Image
                src={`/templates/${tpl.id}.png`}
                alt={tpl.name}
                width={96}
                height={136}
                className="aspect-[210/297] w-full object-cover"
                unoptimized
              />
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <V20Button disabled={!activeTemplateId || genLoading} onClick={() => void generateWithTemplate()}>
            {genLoading ? "⏳ 生成中..." : "✨ 生成美化版"}
          </V20Button>
          {previewHtml && (
            <>
              <V20Button
                variant="ghost"
                onClick={openEdit}
              >
                ✏️ 编辑
              </V20Button>
              <V20Button variant="ghost" onClick={exportWord}>
                📄 Word
              </V20Button>
              <V20Button variant="ghost" onClick={exportPdf}>
                📕 PDF
              </V20Button>
            </>
          )}
          {genSuccess && <span className="text-xs text-green-600">✅ 已生成</span>}
          {genError && <span className="text-xs text-red-500">{genError}</span>}
        </div>

        {previewHtml && (
          <div className="mt-4 flex justify-center overflow-auto rounded-[8px] bg-[#e8e8e8] p-3" style={{ maxHeight: "70vh" }}>
            <div className="bg-white shadow-lg" style={{ width: "210mm", minHeight: "297mm" }}>
              <iframe
                title="简历预览"
                srcDoc={previewHtml}
                className="w-full border-0 bg-white"
                style={{ minHeight: "297mm", height: "297mm" }}
                sandbox="allow-same-origin"
                onLoad={(e) => resizePreviewFrame(e.currentTarget)}
              />
            </div>
          </div>
        )}
      </V20Card>

      {showEditModal && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
            <h2 className="text-sm font-medium">✏️ 编辑简历</h2>
            <div className="flex items-center gap-2">
              <V20Button
                variant="ghost"
                className="px-3 py-1.5 text-xs"
                onClick={() => {
                  const el = editRef.current;
                  if (!el) return;
                  const editable = el.getAttribute("contenteditable") === "true";
                  el.setAttribute("contenteditable", editable ? "false" : "true");
                }}
              >
                🔓 解锁编辑
              </V20Button>
              <V20Button className="px-3 py-1.5 text-xs" onClick={saveEdit}>
                ✅ 完成
              </V20Button>
              <V20Button variant="ghost" className="px-3 py-1.5 text-xs hover:text-red-500" onClick={() => setShowEditModal(false)}>
                ✕
              </V20Button>
            </div>
          </div>
          <div className="flex flex-1 justify-center overflow-auto bg-[#e8e8e8] p-6">
            <div className="bg-white shadow-lg" style={{ width: "210mm", minHeight: "297mm" }}>
              <div
                ref={editRef}
                className="min-h-[297mm] bg-white"
                spellCheck={false}
                dangerouslySetInnerHTML={{ __html: editContent }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
