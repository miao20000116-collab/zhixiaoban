export type FeatureLeaf = {
  id: string;
  label: string;
  href: string;
  description?: string;
};

export type FeatureGroup = {
  id: string;
  label: string;
  children: FeatureLeaf[];
};

export type FeatureSection = {
  id: string;
  label: string;
  groups?: FeatureGroup[];
  href?: string;
};

export const featureSections: FeatureSection[] = [
  {
    id: "agent",
    label: "小伴 Agent",
    href: "/",
  },
  {
    id: "web-tools",
    label: "求职工作台",
    groups: [
      {
        id: "resume-prep",
        label: "简历准备",
        children: [
          {
            id: "resume-builder",
            label: "AI 经历采集",
            href: "/tools/resume-builder",
            description: "对话采集经历并沉淀成可复用素材",
          },
          {
            id: "jd-analysis",
            label: "JD 定向优化",
            href: "/tools/jd-analysis",
            description: "围绕岗位 JD 做简历定向优化",
          },
        ],
      },
      {
        id: "interview-prep",
        label: "面试准备",
        children: [
          {
            id: "industry-research",
            label: "行业调研",
            href: "/tools/industry-research",
            description: "快速产出公司和行业分析",
          },
          {
            id: "interview-predict",
            label: "面试押题",
            href: "/tools/interview-predict",
            description: "结合岗位与简历生成高频面试题",
          },
          {
            id: "interview-script",
            label: "逐字稿",
            href: "/tools/interview-script",
            description: "维护逐题问答和优化版本",
          },
        ],
      },
      {
        id: "interview-review",
        label: "面试复盘",
        children: [
          {
            id: "interview-review-tool",
            label: "录音复盘",
            href: "/tools/interview-review",
            description: "上传录音或文本，抽取问答并复盘",
          },
          {
            id: "answer-scoring",
            label: "答题评分",
            href: "/tools/answer-scoring",
            description: "单题评分并保存历史结果",
          },
        ],
      },
    ],
  },
];
