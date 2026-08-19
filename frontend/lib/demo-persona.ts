import type { ResumeData } from "@/lib/resume-builder/types";
import type { UserInput } from "@/lib/resume-wizard/types";

/** 全站演示人设：与「AI 经历采集 / JD 定向优化」示例一致。禁止写入真实雇主产品名。 */
export const DEMO_PERSONA = {
  name: "张明",
  role: "AI 产品经理",
  company: "字节跳动",
  industry: "互联网/AI",
  location: "北京",
  email: "zhangming@email.com",
  phone: "139-1234-5678",
  resumeTitle: "张明 · AI 产品经理（示例）",
  jdTitle: "AI 产品经理 JD（示例）",
  project: "智能创作助手",
} as const;

export const DEMO_JD_TEXT = `【岗位职责】
1. 负责 AI 产品的策划与落地，结合大模型（LLM）能力设计创新产品方案
2. 进行市场分析与用户调研，挖掘用户智能化场景下的真实需求
3. 撰写产品 PRD，协同算法、工程、设计等团队推动产品迭代
4. 制定产品数据指标体系，通过数据分析驱动产品优化决策
5. 跟踪 AI 行业前沿动态，持续探索 AI 能力与业务场景的结合点

【任职要求】
1. 本科及以上学历，3-5 年互联网产品经理经验，有 AI 产品经验优先
2. 对 NLP、大模型、对话系统等 AI 技术有深入理解
3. 具备优秀的逻辑思维与数据分析能力，能独立完成复杂产品设计
4. 有增长或用户产品经验，擅长数据驱动决策
5. 有技术背景或能与算法团队高效沟通

【加分项】
1. 有 AI Agent / Copilot 产品设计经验
2. 有从 0 到 1 产品落地经验
3. 有大厂工作经验`;

export const EXAMPLE_RESUME_DATA: ResumeData = {
  name: DEMO_PERSONA.name,
  headline: DEMO_PERSONA.role,
  location: DEMO_PERSONA.location,
  email: DEMO_PERSONA.email,
  phone: DEMO_PERSONA.phone,
  links: [{ name: "GitHub", url: "https://github.com/zhangming" }],
  summary:
    "AI 产品经理，4 年互联网产品经验，其中 2 年 AI 产品方向。在字节跳动期间主导「智能创作助手」从 0 到 1 落地，集成大模型能力辅助内容创作，月活用户覆盖 500 万+。具备 AI 产品全链路设计能力，擅长将大模型技术转化为可落地的产品功能，追求数据驱动的产品决策。",
  experience: [
    {
      company: "字节跳动",
      role: "AI 产品经理",
      location: "北京",
      start: "2023.03",
      end: "至今",
      bullets: [
        "主导「智能创作助手」产品从 0 到 1，集成大模型能力辅助用户生成短视频文案和标题，上线后创作者使用率 35%，日均生成内容 2 万+ 条。",
        "负责 AI 标签推荐系统的产品策略，优化内容分发效率，核心指标 CTR 提升 12%，用户阅读时长提升 8%。",
        "设计并推动 A/B 实验框架落地，建立产品决策的数据驱动文化，实验迭代周期从 2 周缩短至 3 天。",
        "协同算法团队优化模型效果，建立人机协作的标注反馈闭环，模型准确率提升 18%。",
      ],
    },
    {
      company: "某互联网公司",
      role: "产品经理",
      location: "北京",
      start: "2022.07",
      end: "2023.02",
      bullets: [
        "负责用户增长方向产品工作，设计裂变活动与分享机制，实现月活跃用户增长 25%。",
        "搭建用户分层运营体系，基于用户行为数据制定差异化运营策略，用户留存率提升 15%。",
      ],
    },
  ],
  projects: [
    {
      name: "AI 智能创作助手",
      role: "产品负责人",
      date: "2023.06 - 2024",
      bullets: [
        "从需求调研到上线的全流程产品工作，洞察创作者「选题难、文案慢」的痛点。",
        "设计基于大模型的智能文案生成功能，通过多轮用户测试优化 prompt，生成内容采纳率从 22% 提升至 35%。",
        "上线后创作者日均发布量提升 40%，功能月活用户 150 万+。",
      ],
    },
    {
      name: "AI 标签推荐系统",
      role: "产品经理",
      date: "2023",
      bullets: [
        "主导内容标签体系重构，结合 NLP 技术实现自动化标签提取与分类。",
        "设计标签权重算法，优化推荐系统的内容分发策略，CTR 提升 12%。",
      ],
    },
  ],
  education: [
    {
      school: "北京邮电大学",
      degree: "计算机科学与技术 本科",
      location: "北京",
      end: "2022",
    },
  ],
  skills: [
    { group: "产品能力", items: ["需求分析", "PRD 撰写", "竞品分析", "用户研究", "数据分析", "A/B 测试"] },
    { group: "AI 能力", items: ["大模型应用", "Prompt Engineering", "AI Agent 设计", "NLP 基础", "模型评估"] },
    { group: "工具", items: ["Figma", "Axure", "SQL", "Python", "Jira", "Confluence"] },
  ],
};

export function formatDemoResumeText(data: ResumeData = EXAMPLE_RESUME_DATA): string {
  const exp = data.experience
    .map((item) => {
      const bullets = item.bullets.map((b) => `• ${b}`).join("\n");
      return `${item.company}  |  ${item.role}  |  ${item.start} - ${item.end}\n\n${bullets}`;
    })
    .join("\n\n");
  const projects = data.projects
    .map((item) => `${item.name}\n\n${item.bullets.map((b) => `• ${b}`).join("\n")}`)
    .join("\n\n");
  const skills = data.skills.map((g) => `${g.group}：${g.items.join("、")}`).join("\n");
  const edu = data.education
    .map((e) => `${e.end ? `${e.end}  ` : ""}${e.school}  ${e.degree}`)
    .join("\n");

  return `${data.name}
电话：${data.phone} | 邮箱：${data.email} | 地点：${data.location}

教育背景
${edu}

工作经历

${exp}

项目经历

${projects}

技能
${skills}`;
}

export const DEMO_RESUME_TEXT = formatDemoResumeText();

export const EXAMPLE_USER_INPUT: UserInput = {
  targetRole: DEMO_PERSONA.role,
  industry: DEMO_PERSONA.industry,
  companyType: "大厂",
  jobStage: "社招-中级",
  highlightSkills: "AI 产品设计、大模型应用、用户增长、数据分析、A/B 测试",
  jobDescription: DEMO_JD_TEXT,
  originalResume: DEMO_RESUME_TEXT,
  additionalInfo:
    "目前在职，对大模型和 AI 产品有强烈热情，持续关注行业前沿动态，业余时间在学习 LLM 模型微调相关知识",
};

export const EXAMPLE_CONVERSATION = [
  {
    role: "assistant" as const,
    content:
      "你好！我来帮你做一份简历。先聊聊你的基本情况吧——\n\n**你想找什么方向的岗位？你的名字和邮箱是什么？**",
  },
  {
    role: "user" as const,
    content: "我叫张明，想做 AI 产品经理，邮箱是 zhangming@email.com",
  },
  {
    role: "assistant" as const,
    content: "好的张明！你在哪个城市？另外，你最近一段工作经历是哪家公司、什么职位？",
  },
  {
    role: "user" as const,
    content: "在北京。目前在字节跳动做 AI 产品经理，2023 年 3 月到现在。",
  },
  {
    role: "assistant" as const,
    content: "明白了。你在字节跳动主要负责 AI 产品方向，能具体说说你最有成就感的一个项目吗？",
  },
  {
    role: "user" as const,
    content:
      "我主导了「智能创作助手」从 0 到 1，用大模型帮创作者写短视频文案和标题。上线后使用率 35%，日均生成 2 万多条内容，创作者发布量提升了 40%。",
  },
  {
    role: "assistant" as const,
    content: "这个成果很棒！在这之前你还有哪些经历？",
  },
  {
    role: "user" as const,
    content: "之前在另一家互联网公司做了 8 个月的产品经理，主要负责用户增长，设计裂变活动让月活涨了 25%。更早之前是校招入行的。",
  },
  {
    role: "assistant" as const,
    content: "教育背景是什么？",
  },
  {
    role: "user" as const,
    content: "北京邮电大学，计算机科学与技术本科，2022 年毕业。",
  },
  {
    role: "assistant" as const,
    content: "很好！你还有哪些技能想放到简历上？我帮你归类。",
  },
  {
    role: "user" as const,
    content:
      "产品方面：需求分析、PRD、竞品分析、用户研究、数据分析、A/B 测试。AI 方面：大模型应用、Prompt Engineering、AI Agent 设计。工具：Figma、Axure、SQL、Python。",
  },
  {
    role: "assistant" as const,
    content: "信息收集得差不多了！来看看整理的结果吧。",
  },
];
