import type { Project, ResumeData } from "./types";

const AI_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "Prompt 设计", re: /prompt|提示词/i },
  { label: "RAG", re: /\brag\b|检索增强/i },
  { label: "Agent / 智能体", re: /agent|智能体|多智能体/i },
  { label: "大模型应用", re: /大模型|LLM|GPT|文心|通义|千问|DeepSeek|Claude/i },
  { label: "模型评估", re: /评测|评估|效果验收|A\/B/i },
  { label: "多模态", re: /多模态|语音|OCR|图像生成/i },
  { label: "推荐系统", re: /推荐|召回|排序/i },
  { label: "向量检索", re: /向量|embedding/i },
  { label: "数据驱动", re: /数据|埋点|留存|转化率/i },
];

export function extractAICapabilities(data: ResumeData): string[] {
  const caps = new Set<string>();
  const haystack = [
    ...data.skills.flatMap((s) => s.items),
    ...data.experience.flatMap((e) => e.bullets),
    ...data.projects.flatMap((p) => p.bullets),
    data.headline,
    data.summary,
  ].join("\n");
  for (const p of AI_PATTERNS) {
    if (p.re.test(haystack)) caps.add(p.label);
  }
  return [...caps];
}

export function computeProjectStrength(projects: Project[]) {
  if (!projects.length) return { label: "未采集", detail: "尚未采集项目经历" };
  let strong = 0;
  for (const p of projects) {
    const all = p.bullets.join(" ");
    let s = 0;
    if (/\d/.test(all)) s++;
    if (/我负责|主导|牵头|独立|负责/.test(all)) s++;
    if (/提升|增长|降低|节省|效率|覆盖|留存|转化|成本/.test(all)) s++;
    if (all.length > 40) s++;
    if (s >= 3) strong++;
  }
  if (strong === projects.length) return { label: "强", detail: `${strong}/${projects.length} 个项目证据完整` };
  if (strong >= 1) return { label: "中", detail: `${strong}/${projects.length} 个项目证据较完整` };
  return { label: "弱", detail: "项目普遍缺少量化结果与个人贡献表述" };
}

export function computeResumeProfile(data: ResumeData) {
  const modules = [
    { label: "目标岗位", done: !!data.headline },
    { label: "联系方式", done: !!(data.email && data.phone) },
    { label: "工作经历", done: data.experience.length > 0 },
    { label: "项目经历", done: data.projects.length > 0 },
    { label: "教育背景", done: data.education.length > 0 },
    { label: "技能标签", done: data.skills.length > 0 },
    { label: "个人总结", done: !!data.summary },
  ];
  const collected = modules.filter((m) => m.done).length;
  const completion = Math.round((collected / modules.length) * 100);

  const allBullets = [...data.experience.flatMap((e) => e.bullets), ...data.projects.flatMap((p) => p.bullets)];
  const quantified = allBullets.filter((b) => /\d/.test(b)).length;
  const quantRatio = allBullets.length ? Math.round((quantified / allBullets.length) * 100) : 0;

  const aiCapabilities = extractAICapabilities(data);
  const projectStrength = computeProjectStrength(data.projects);

  const missing: string[] = [];
  if (!data.phone) missing.push("联系电话缺失");
  if (!data.summary) missing.push("个人总结未填写");
  if (allBullets.length && quantRatio < 50) missing.push("量化成果偏少，建议补充数据指标");
  if (data.projects.length && data.projects.some((p) => !/\d/.test(p.bullets.join(" ")))) {
    missing.push("部分项目缺量化结果");
  }

  const risks: string[] = [];
  if (aiCapabilities.length === 0) risks.push("未识别到 AI 能力标签，建议补充 AI 相关技能");
  if (data.experience.length && data.experience.some((e) => !e.start || !e.end)) {
    risks.push("部分经历时间不完整");
  }
  if (quantified === 0 && allBullets.length > 0) risks.push("全部经历缺少量化数据，说服力不足");
  if (data.education.length === 0) risks.push("教育背景缺失");

  return { modules, completion, quantRatio, aiCapabilities, projectStrength, missing, risks };
}

export function hasEnoughData(data: ResumeData) {
  return !!data.name && !!data.headline && data.experience.length > 0 && data.education.length > 0;
}

export function getBuilderStage(data: ResumeData, isConfirmed: boolean): "target" | "collect" | "confirm" | "template" {
  if (!hasEnoughData(data)) {
    return data.name && data.headline ? "collect" : "target";
  }
  return isConfirmed ? "template" : "confirm";
}

export function mergeResumeData(current: ResumeData, parsed: Partial<ResumeData>): ResumeData {
  const next = { ...current };
  if (parsed.name) next.name = parsed.name;
  if (parsed.headline) next.headline = parsed.headline;
  if (parsed.email) next.email = parsed.email;
  if (parsed.phone) next.phone = parsed.phone;
  if (parsed.location) next.location = parsed.location;
  if (parsed.summary) next.summary = parsed.summary;
  if (parsed.experience && Array.isArray(parsed.experience)) next.experience = parsed.experience;
  if (parsed.projects && Array.isArray(parsed.projects)) next.projects = parsed.projects;
  if (parsed.education && Array.isArray(parsed.education)) next.education = parsed.education;
  if (parsed.skills && Array.isArray(parsed.skills)) next.skills = parsed.skills;
  if (parsed.links && Array.isArray(parsed.links)) next.links = parsed.links;
  return next;
}

export function parseDataFromResponse(response: string, current: ResumeData): ResumeData {
  const dataMatch = response.match(/<data>([\s\S]*?)<\/data>/);
  if (!dataMatch) return current;
  try {
    return mergeResumeData(current, JSON.parse(dataMatch[1].trim()) as Partial<ResumeData>);
  } catch {
    return current;
  }
}

export function cleanAssistantDisplay(response: string) {
  return response.replace(/<data>[\s\S]*?<\/data>/g, "").replace("<complete />", "").trim();
}

export function inferPhase(data: ResumeData, current: string): string {
  if (data.summary) return "summary";
  if (data.skills.length > 0) return "skills";
  if (data.education.length > 0) return "education";
  if (data.projects.length > 0) return "project";
  if (data.experience.length > 0) return "experience";
  if (data.name && data.headline) return "target";
  return current || "greeting";
}

export function formatDataSummary(data: ResumeData): string {
  const lines: string[] = [];
  if (data.name && data.headline) lines.push(`${data.name} — ${data.headline}`);
  if (data.email || data.location) lines.push(`${data.email || "-"} ｜ ${data.location || "-"}`);
  if (data.experience.length > 0) {
    lines.push("");
    lines.push("--- 工作经历 ---");
    for (const e of data.experience) {
      lines.push(`${e.company} · ${e.role}（${e.start}—${e.end}）`);
      for (const b of e.bullets) lines.push(`  • ${b.slice(0, 60)}${b.length > 60 ? "..." : ""}`);
    }
  }
  if (data.education.length > 0) {
    lines.push("");
    lines.push("--- 教育背景 ---");
    for (const e of data.education) lines.push(`${e.school} · ${e.degree}`);
  }
  return lines.join("\n");
}

export function buildResumeText(data: ResumeData): string {
  const parts = [`${data.name || "未命名"} | ${data.headline || "求职"}`];
  if (data.email) parts.push(`联系方式：${data.email} | ${data.location || ""}`);
  if (data.summary) parts.push(`\n【Summary】\n${data.summary}`);
  for (const exp of data.experience) {
    parts.push(`\n【${exp.company}】${exp.role} (${exp.start} - ${exp.end})`);
    parts.push(exp.bullets.map((b) => `• ${b}`).join("\n"));
  }
  if (data.projects.length > 0) {
    parts.push("\n【项目经历】");
    for (const proj of data.projects) {
      parts.push(`${proj.name}${proj.role ? ` - ${proj.role}` : ""}`);
      parts.push(proj.bullets.map((b) => `• ${b}`).join("\n"));
    }
  }
  if (data.education.length > 0) {
    const edu = data.education[0];
    parts.push(`\n【教育背景】${edu.school} | ${edu.degree} (${edu.end})`);
  }
  if (data.skills.length > 0) {
    parts.push("\n【技能】");
    for (const g of data.skills) parts.push(`${g.group}：${g.items.join("、")}`);
  }
  return parts.join("\n");
}

export function renderMarkdownBold(text: string) {
  return text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
}
