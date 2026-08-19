import type { FinalResume } from "./types";

export interface ResumeTemplateInfo {
  id: string;
  name: string;
  desc: string;
  ats: string;
  suitable: string[];
}

export interface RenderResumeData {
  name: string;
  headline: string;
  location: string;
  email: string;
  phone: string;
  summary: string;
  experience: Array<{
    company: string;
    role: string;
    start: string;
    end: string;
    bullets: string[];
  }>;
  projects: Array<{
    name: string;
    role: string;
    bullets: string[];
  }>;
  education: Array<{
    school: string;
    degree: string;
    end: string;
  }>;
  skills: Array<{
    group: string;
    items: string[];
  }>;
}

export function convertResumeData(resume: FinalResume): RenderResumeData {
  return {
    name: resume.personalInfo?.name || "姓名",
    headline: resume.jobIntent || "",
    location: resume.personalInfo?.location || "",
    email: resume.personalInfo?.email || "",
    phone: resume.personalInfo?.phone || "",
    summary: resume.summary || "",
    experience: (resume.workExperience || []).map((w) => ({
      company: w.company,
      role: w.role,
      start: w.period?.split("—")[0]?.trim() || w.period?.split(" - ")[0]?.trim() || "",
      end: w.period?.split("—")[1]?.trim() || w.period?.split(" - ")[1]?.trim() || "",
      bullets: w.bullets || [],
    })),
    projects: (resume.projectExperience || []).map((p) => ({
      name: p.name,
      role: p.role,
      bullets: p.bullets || [],
    })),
    education: [
      {
        school: resume.education?.school || "",
        degree: resume.education?.degree || "",
        end: resume.education?.period?.split(" - ")[1] || resume.education?.period || "",
      },
    ],
    skills: [
      {
        group: "技能",
        items: (resume.coreSkills || []).concat(
          resume.skillsAndTools
            ?.split(/[·、,，]/)
            .map((s) => s.trim())
            .filter(Boolean) || [],
        ),
      },
    ],
  };
}

export function buildRenderPrompt(data: RenderResumeData, _templateId: string, templateHtml: string): string {
  return `你是一位简历 HTML 渲染专家。

## 任务
将用户的结构化简历数据，填入指定的 HTML 模板中，输出可直接在浏览器预览和打印的完整简历 HTML。

## 规则
1. **保留模板的 <style> 完全不动**
2. **把模板中的示例内容替换为用户真实数据**
3. **没有的板块整块删除**
4. **内容可多页**：纸张高度用 min-height，不要写死 height；内容多时允许自然增高，不要裁切
5. **保持原有 HTML 结构（class、布局 div 等）不变**

## 用户数据
${JSON.stringify(data, null, 2)}

## 模板 HTML
${templateHtml}

直接输出完整 HTML，不要 markdown 代码块，不要额外说明。`;
}

export function escHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function wrapHtml(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title>
<style>@media print{@page{margin:0;size:letter}body{padding:0;background:#fff}}</style></head><body>${body}</body></html>`;
}

export function stripMarkdownHtmlFence(html: string) {
  return html.trim().replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/i, "");
}

/** 避免生成结果把纸张锁成单页高度，导致底部内容溢出到灰底上 */
export function ensureResumePaperGrows(html: string) {
  let out = html
    .replace(/(\.page\s*\{[^}]*?)(?<!min-)height\s*:\s*(11in|297mm)/gi, "$1min-height: $2")
    .replace(/(<(?:div|section)[^>]*class=["'][^"']*\bpage\b[^"']*["'][^>]*style=["'][^"']*?)(?<!min-)height\s*:\s*(11in|297mm)/gi, "$1min-height: $2");

  const growCss = `<style data-resume-paper-grow>
html, body { height: auto !important; min-height: 0 !important; background: #fff !important; }
.page {
  height: auto !important;
  min-height: 297mm !important;
  overflow: visible !important;
  background: #fff !important;
}
.page .side, .page aside.side, .page .main, .page .body {
  min-height: 100% !important;
  height: auto !important;
  overflow: visible !important;
}
</style>`;

  if (/data-resume-paper-grow/.test(out)) return out;
  if (/<\/head>/i.test(out)) return out.replace(/<\/head>/i, `${growCss}</head>`);
  return `${growCss}${out}`;
}

export const FALLBACK_TEMPLATES: ResumeTemplateInfo[] = [
  { id: "classic-ats", name: "Classic ATS", desc: "", ats: "友好", suitable: [] },
  { id: "modern-sidebar", name: "Modern 侧栏", desc: "", ats: "", suitable: [] },
  { id: "pillar", name: "Pillar", desc: "", ats: "", suitable: [] },
];
