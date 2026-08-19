import type { FinalResume } from "./types";

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const result = document.execCommand("copy");
    document.body.removeChild(textarea);
    return result;
  }
}

export function formatResumeAsText(resume: FinalResume): string {
  const lines: string[] = [];

  lines.push(resume.personalInfo.name);
  lines.push(`${resume.personalInfo.email} | ${resume.personalInfo.phone} | ${resume.personalInfo.location}`);
  lines.push("");

  if (resume.jobIntent) {
    lines.push(`求职意向：${resume.jobIntent}`);
    lines.push("");
  }

  if (resume.summary) {
    lines.push("【个人摘要】");
    lines.push(resume.summary);
    lines.push("");
  }

  if (resume.coreSkills.length > 0) {
    lines.push("【核心能力】");
    lines.push(resume.coreSkills.join("、"));
    lines.push("");
  }

  if (resume.workExperience.length > 0) {
    lines.push("【工作经历】");
    for (const exp of resume.workExperience) {
      lines.push(`${exp.company} | ${exp.role} | ${exp.period}`);
      for (const b of exp.bullets) {
        lines.push(`  • ${b}`);
      }
    }
    lines.push("");
  }

  if (resume.projectExperience.length > 0) {
    lines.push("【项目经历】");
    for (const proj of resume.projectExperience) {
      lines.push(`${proj.name} | ${proj.role} | ${proj.period}`);
      for (const b of proj.bullets) {
        lines.push(`  • ${b}`);
      }
    }
    lines.push("");
  }

  if (resume.skillsAndTools) {
    lines.push("【技能工具】");
    lines.push(resume.skillsAndTools);
    lines.push("");
  }

  if (resume.education.school) {
    lines.push("【教育背景】");
    lines.push(`${resume.education.school} | ${resume.education.degree} | ${resume.education.period}`);
  }

  return lines.join("\n");
}
