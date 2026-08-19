import { preHtml } from "@/lib/document-export";
import { escHtml } from "@/lib/resume-wizard/template-utils";
import type { ScriptQAPair } from "@/lib/script-qa-types";

function displayAnswer(qa: ScriptQAPair) {
  return qa.optimizedAnswer?.trim() || qa.answer?.trim() || "";
}

function qaHeading(qa: ScriptQAPair, index: number) {
  const tag = [qa.type, qa.priority ? `优先级 ${qa.priority}` : ""].filter(Boolean).join(" · ");
  const label = qa.title || qa.question?.slice(0, 40) || `问题 ${index + 1}`;
  return tag ? `${index + 1}. 【${tag}】${label}` : `${index + 1}. ${label}`;
}

export function buildScriptMarkdown(title: string, items: ScriptQAPair[]) {
  const exportedAt = new Date().toLocaleString("zh-CN");
  const blocks = items.map((qa, index) => {
    const lines: string[] = [`## ${qaHeading(qa, index)}`, ""];
    if (qa.question) lines.push(`**问题：** ${qa.question}`, "");
    if (qa.why) lines.push(`**为什么会问：** ${qa.why}`, "");
    if (qa.source) lines.push(`**来源：** ${qa.source}`, "");
    if (qa.structure?.trim()) lines.push("**回答框架：**", "", qa.structure.trim(), "");
    if (qa.followUp?.trim()) lines.push(`**可能追问：** ${qa.followUp}`, "");
    if (qa.answer?.trim()) lines.push("**完整回答：**", "", qa.answer.trim(), "");
    if (qa.optimizedAnswer?.trim()) lines.push("**优化版回答（基于简历）：**", "", qa.optimizedAnswer.trim(), "");
    if (!displayAnswer(qa) && !qa.structure?.trim()) lines.push("_（暂无回答内容）_", "");
    return lines.join("\n").trim();
  });

  return [`# ${title || "逐字稿"}`, "", `> 导出时间：${exportedAt}`, "", ...blocks.flatMap((block) => [block, "", "---", ""])].join("\n").trim();
}

export function buildScriptHtml(title: string, items: ScriptQAPair[]) {
  const exportedAt = escHtml(new Date().toLocaleString("zh-CN"));
  const sections = items
    .map((qa, index) => {
      const parts: string[] = [
        `<section style="margin-bottom:28px;page-break-inside:avoid;">`,
        `<h2 style="font-size:16px;margin:0 0 10px;color:#1a1a1a;">${escHtml(qaHeading(qa, index))}</h2>`,
      ];
      if (qa.question) {
        parts.push(`<p style="margin:0 0 8px;"><strong>问题：</strong>${escHtml(qa.question)}</p>`);
      }
      if (qa.why) {
        parts.push(`<p style="margin:0 0 8px;color:#555;font-size:13px;"><strong>为什么会问：</strong>${escHtml(qa.why)}</p>`);
      }
      if (qa.source) {
        parts.push(`<p style="margin:0 0 8px;color:#777;font-size:12px;"><strong>来源：</strong>${escHtml(qa.source)}</p>`);
      }
      if (qa.structure?.trim()) {
        parts.push(
          `<div style="margin:10px 0;padding:10px 12px;background:#f7f5f2;border-radius:6px;">`,
          `<p style="margin:0 0 6px;font-size:12px;color:#666;">回答框架</p>`,
          preHtml(qa.structure.trim()),
          `</div>`,
        );
      }
      if (qa.followUp?.trim()) {
        parts.push(`<p style="margin:8px 0;color:#b45309;font-size:13px;"><strong>可能追问：</strong>${escHtml(qa.followUp)}</p>`);
      }
      if (qa.answer?.trim()) {
        parts.push(`<p style="margin:12px 0 6px;font-size:13px;"><strong>完整回答</strong></p>`, preHtml(qa.answer.trim()));
      }
      if (qa.optimizedAnswer?.trim()) {
        parts.push(
          `<p style="margin:12px 0 6px;font-size:13px;color:#8b6914;"><strong>优化版回答（基于简历）</strong></p>`,
          preHtml(qa.optimizedAnswer.trim()),
        );
      }
      parts.push(`</section>`);
      return parts.join("");
    })
    .join(`<hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;" />`);

  return `<div style="font-family:Segoe UI,Microsoft YaHei,sans-serif;padding:24px;line-height:1.6;color:#1a1a1a;">
<h1 style="font-size:22px;margin:0 0 8px;">${escHtml(title || "逐字稿")}</h1>
<p style="margin:0 0 24px;font-size:12px;color:#888;">导出时间：${exportedAt}</p>
${sections}
</div>`;
}

export function pickScriptExportItems(all: ScriptQAPair[], selected: Set<number>) {
  if (selected.size === 0) return all;
  return [...selected].sort((a, b) => a - b).map((index) => all[index]).filter(Boolean);
}
