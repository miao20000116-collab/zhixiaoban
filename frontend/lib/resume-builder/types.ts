export interface Experience {
  company: string;
  role: string;
  location?: string;
  start: string;
  end: string;
  bullets: string[];
}

export interface Project {
  name: string;
  role?: string;
  link?: string;
  date?: string;
  bullets: string[];
}

export interface Education {
  school: string;
  degree: string;
  location?: string;
  start?: string;
  end: string;
  detail?: string;
}

export interface SkillGroup {
  group: string;
  items: string[];
}

export interface ResumeData {
  name: string;
  headline: string;
  location: string;
  email: string;
  phone: string;
  links: { name: string; url: string }[];
  summary: string;
  experience: Experience[];
  projects: Project[];
  education: Education[];
  skills: SkillGroup[];
}

export interface ChatMessage {
  role: "assistant" | "user";
  content: string;
}

export interface TemplateInfo {
  id: string;
  name: string;
  desc: string;
  ats: string;
  suitable: string[];
}

export type BuilderStage = "target" | "collect" | "confirm" | "template";

export const STAGES: { key: BuilderStage; label: string }[] = [
  { key: "target", label: "目标设定" },
  { key: "collect", label: "经历采集" },
  { key: "confirm", label: "信息确认" },
  { key: "template", label: "模板生成" },
];

export const defaultResumeData: ResumeData = {
  name: "",
  headline: "",
  location: "",
  email: "",
  phone: "",
  links: [],
  summary: "",
  experience: [],
  projects: [],
  education: [],
  skills: [],
};

export const PHASE_LABELS: Record<string, string> = {
  greeting: "开始对话",
  target: "目标岗位",
  contact: "联系方式",
  experience: "工作经历",
  project: "项目经历",
  education: "教育背景",
  skills: "技能",
  summary: "总结",
  done: "已收集完成",
};

export const STARTER_MESSAGE =
  "你好！我来帮你采集 AI 产品经理的求职素材。先聊聊基本情况——\n\n**你想找什么方向的岗位？你的名字和邮箱是什么？**";
