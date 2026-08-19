/**
 * Mock 数据 — 模拟简历分析结果
 * 对应示例人物：张明，AI 产品经理，4 年经验（字节跳动 2 年 AI PM）
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { delay } from "@/lib/resume-wizard/helpers";
import type { AnalysisResult, UserInput, OptimizeStyle } from "@/lib/resume-wizard/types";
import { normalizeAnalysisResult } from "@/lib/resume-wizard/resume-prompts";

export async function runMockResumeAnalysis(
  _input: UserInput,
  _style: OptimizeStyle = 'ai-product'
): Promise<AnalysisResult> {
  await delay(800)

  const raw = {
    jdAnalysis: {
      responsibilities: [
        '负责 AI 产品的策划与落地，结合大模型（LLM）能力设计创新产品方案',
        '进行市场分析与用户调研，挖掘用户智能化场景下的真实需求',
        '撰写产品 PRD，协同算法、工程、设计等团队推动产品迭代',
        '制定产品数据指标体系，通过数据分析驱动产品优化决策',
        '跟踪 AI 行业前沿动态，持续探索 AI 能力与业务场景的结合点',
      ],
      hardRequirements: [
        '本科及以上学历，3-5 年互联网产品经理经验，有 AI 产品经验优先',
        '对 NLP、大模型、对话系统等 AI 技术有深入理解',
        '具备优秀的逻辑思维与数据分析能力，能独立完成复杂产品设计',
        '有增长或用户产品经验，擅长数据驱动决策',
        '有技术背景或能与算法团队高效沟通',
      ],
      implicitRequirements: [
        '具备快速学习和跟踪 AI 前沿技术的能力',
        '有较强的产品创新意识和用户思维',
        '能独立推动跨团队协作和项目落地',
        '对 AI 产品有热情，关注行业动态',
      ],
      keywords: [
        'AI 产品', '大模型', 'LLM', 'NLP', 'PRD', '数据分析',
        '用户调研', '算法协作', 'A/B 测试', '增长', '用户产品',
        'AI Agent', '模型评估', 'Prompt Engineering',
      ],
      idealCandidate: '理想的候选人应具备 3-5 年互联网产品经验，其中至少 1-2 年 AI 产品方向。对 LLM、NLP 等技术有深入理解，能独立完成 AI 产品的需求分析、方案设计到落地迭代的全流程。具备数据驱动决策能力，有增长或用户产品经验者优先。候选人应能与算法团队高效协作，持续关注 AI 行业前沿动态。',
      coreCompetencies: [
        { name: 'AI 产品设计', importance: 'high', description: '能结合大模型能力设计创新产品方案，有 AI 产品从 0 到 1 经验' },
        { name: '数据分析与 A/B 测试', importance: 'high', description: '制定指标体系，通过 A/B 实验和数据驱动产品优化' },
        { name: '算法协作', importance: 'high', description: '能与算法团队高效沟通，理解模型训练和评估流程' },
        { name: '用户增长', importance: 'medium', description: '有用户增长或用户产品经验，擅长设计增长策略' },
        { name: 'PRD 与产品规划', importance: 'medium', description: '输出高质量 PRD，制定产品路线图' },
        { name: '行业认知', importance: 'medium', description: '持续跟踪 AI 行业前沿动态，有技术热情' },
      ],
    },
    diagnosis: {
      overallScore: 76,
      dimensionScores: [
        { dimension: '岗位匹配度', score: 82, comment: 'AI 产品方向经验丰富，与目标岗位高度匹配' },
        { dimension: '经历表达能力', score: 70, comment: '成果描述较好，部分 bullet 可进一步量化' },
        { dimension: '关键词覆盖度', score: 78, comment: '覆盖了主要的 AI 和产品关键词' },
        { dimension: '结构完整性', score: 72, comment: '基本框架完整，可增加技能分类和总结部分' },
        { dimension: '差异化亮点', score: 75, comment: '智能创作助手项目有亮点，可进一步突出数据' },
      ],
      mainIssues: [
        '工作经历中的 AI 项目成果数据可以更全面，部分指标只有单一维度',
        '技能部分缺少分类，建议按产品/AI/工具分组展示',
        '项目经历中个人角色和贡献可以更明确',
        '缺少一段精炼的个人总结/职业定位',
      ],
      prioritySuggestions: [
        '增加 AI 技能分类模块，突出大模型应用和 Prompt Engineering 等能力',
        '补充 1-2 个 AI 项目的多维度量化成果（用户指标、业务指标、技术指标）',
        '优化职业摘要，突出 AI 产品方向的专业定位',
        '在项目描述中强化个人角色和核心贡献',
      ],
    },
    matchItems: [
      {
        jdRequirement: 'AI 产品策划与落地经验',
        resumeEvidence: '有字节跳动 AI PM 经验，主导智能创作助手从 0 到 1',
        evidenceStrength: 'strong',
        needsSupplement: false,
        optimizationSuggestion: '可用 STAR 法则结构化描述项目全流程',
      },
      {
        jdRequirement: '大模型/LLM 技术理解',
        resumeEvidence: '有集成大模型能力的产品经验，涉及 Prompt Engineering',
        evidenceStrength: 'strong',
        needsSupplement: false,
        optimizationSuggestion: '补充具体的模型应用场景和技术选型思考',
      },
      {
        jdRequirement: '数据分析与 A/B 测试',
        resumeEvidence: '有 A/B 实验框架落地经验，CTR 和留存率等指标优化案例',
        evidenceStrength: 'strong',
        needsSupplement: false,
        optimizationSuggestion: '可补充实验方法和样本量等专业细节',
      },
      {
        jdRequirement: '用户增长经验',
        resumeEvidence: '有用户增长方向经验，月活增长 25%',
        evidenceStrength: 'strong',
        needsSupplement: false,
        optimizationSuggestion: '补充增长策略的具体手段和渠道',
      },
      {
        jdRequirement: '算法团队协作能力',
        resumeEvidence: '有协同算法团队优化模型效果的经验',
        evidenceStrength: 'medium',
        needsSupplement: true,
        optimizationSuggestion: '补充协作模式和沟通机制的具体案例',
      },
      {
        jdRequirement: '独立完成复杂产品设计',
        resumeEvidence: '主导 AI 创作助手全流程，从需求到上线',
        evidenceStrength: 'strong',
        needsSupplement: false,
        optimizationSuggestion: '补充产品设计过程中的关键决策和取舍',
      },
      {
        jdRequirement: '行业前沿动态跟踪',
        resumeEvidence: '未在简历中明确体现行业关注度',
        evidenceStrength: 'weak',
        needsSupplement: true,
        optimizationSuggestion: '可在个人总结或额外信息中补充行业认知',
      },
      {
        jdRequirement: '技术背景或与算法团队沟通能力',
        resumeEvidence: '计算机专业背景，对 AI 技术理解深入',
        evidenceStrength: 'strong',
        needsSupplement: false,
        optimizationSuggestion: '强调技术背景对产品决策的帮助',
      },
    ],
    followUpQuestions: [
      {
        id: 'fu-1', question: '你在智能创作助手中具体是如何设计 Prompt 的？在优化过程中有哪些关键的迭代？',
        purpose: '深入了解 AI 产品设计细节', userAnswer: '', generatedBullet: null,
      },
      {
        id: 'fu-2', question: '在 A/B 实验框架落地过程中，你是如何说服团队采用实验文化的？遇到了哪些阻力？',
        purpose: '了解数据驱动文化推动力', userAnswer: '', generatedBullet: null,
      },
      {
        id: 'fu-3', question: '你和算法团队在日常协作中，模型评估的标准和迭代流程是怎样的？',
        purpose: '了解算法协作深度', userAnswer: '', generatedBullet: null,
      },
      {
        id: 'fu-4', question: '用户增长 25% 主要靠哪些具体手段？不同渠道的转化效果如何？',
        purpose: '深入了解增长策略', userAnswer: '', generatedBullet: null,
      },
      {
        id: 'fu-5', question: '你对当前 AI 产品领域的热点方向（如 AI Agent、RAG、多模态）有什么看法或实践？',
        purpose: '了解行业认知深度', userAnswer: '', generatedBullet: null,
      },
      {
        id: 'fu-6', question: '在标签推荐系统的项目中，你是如何平衡用户体验和推荐效果的？',
        purpose: '产品决策能力', userAnswer: '', generatedBullet: null,
      },
      {
        id: 'fu-7', question: '如果再给你一次重做智能创作助手的机会，你会怎么做不同的决策？',
        purpose: '复盘和反思能力', userAnswer: '', generatedBullet: null,
      },
    ],
    optimizedItems: [
      {
        id: 'opt-1', section: '职业摘要',
        before: 'AI 产品经理，4 年互联网产品经验，其中 2 年 AI 产品方向。',
        after: 'AI 产品经理，4 年互联网产品经验（其中 2 年 AI 方向），在字节跳动主导「智能创作助手」从 0 到 1 落地，集成大模型能力辅助内容创作，月活用户 500 万+。擅长 AI 产品全链路设计、数据驱动决策与算法协同，致力于将大模型技术转化为可落地的产品价值。',
        reason: '突出核心亮点和量化成果，让 HR 一眼看到匹配度',
        riskWarning: '无显著风险',
      },
      {
        id: 'opt-2', section: '工作经历 - 字节跳动',
        before: '主导智能创作助手从 0 到 1，集成大模型辅助内容创作，使用率 35%',
        after: '主导「智能创作助手」产品从 0 到 1 全流程落地，基于大模型能力构建 AI 文案生成与标题推荐功能，上线后创作者采纳率 35%，日均生成 2 万+ 条内容，创作者日均发布量提升 40%，月活用户 150 万+',
        reason: '补充多维度量化数据和产品范围描述',
        riskWarning: '月活数据需确认口径',
      },
      {
        id: 'opt-3', section: '工作经历 - 实验框架',
        before: '设计并推动 A/B 实验框架落地，迭代周期从 2 周缩至 3 天',
        after: '从 0 到 1 搭建 A/B 实验平台与决策流程，覆盖产品功能、算法策略、交互体验等多场景实验，推动实验迭代周期从 2 周缩短至 3 天，建立「假设→实验→分析→决策」的数据驱动文化',
        reason: '补充实验覆盖范围和体系化建设的描述',
        riskWarning: '无显著风险',
      },
      {
        id: 'opt-4', section: '项目经历 - 标签推荐',
        before: '主导内容标签体系重构，结合 NLP 实现自动化标签提取，CTR 提升 12%',
        after: '主导内容标签体系全面重构，基于 NLP 技术实现标签自动化提取与多级分类，覆盖 100+ 内容垂类。设计标签权重算法与推荐策略，优化分发精准度，核心指标 CTR 提升 12%、用户阅读时长提升 8%',
        reason: '补充技术方案细节和多维度成果',
        riskWarning: '分类数量需确认',
      },
      {
        id: 'opt-5', section: '新增 - 技能分类模块',
        before: '（无分类技能模块，技能散落在简历各处）',
        after: '【产品能力】需求分析 · PRD 撰写 · 竞品分析 · 用户研究 · 数据分析 · A/B 测试\n【AI 能力】大模型应用 · Prompt Engineering · AI Agent 设计 · NLP 基础 · 模型评估\n【工具】Figma · Axure · SQL · Python · Jira · Confluence',
        reason: '分类展示技能，方便 HR 快速匹配关键词',
        riskWarning: 'Python 能力水平需确认',
      },
      {
        id: 'opt-6', section: '个人总结',
        before: '（无个人总结模块）',
        after: '对 AI 产品充满热情，持续关注 LLM、AI Agent、多模态等前沿方向。计算机专业背景使我能与算法团队高效沟通，理解模型能力边界。业余时间在学习 LLM 微调与 RAG 技术，致力于成为「懂技术、懂用户、懂业务」的 AI 产品经理。',
        reason: '增加个人总结，体现技术热情和职业定位',
        riskWarning: '需确认实际学习深度',
      },
    ],
    finalResume: {
      personalInfo: { name: '张明', email: 'zhangming@email.com', phone: '139-1234-5678', location: '北京' },
      jobIntent: 'AI 产品经理',
      summary: 'AI 产品经理，4 年互联网产品经验（其中 2 年 AI 方向），在字节跳动主导「智能创作助手」从 0 到 1 落地，集成大模型能力辅助内容创作，月活用户 500 万+。具备 AI 产品全链路设计、数据驱动决策与算法协同能力，致力于将大模型技术转化为可落地的产品价值。计算机专业背景，对 LLM、AI Agent 等前沿方向有持续热情。',
      coreSkills: ['AI 产品设计', '大模型应用', '数据分析', 'A/B 测试', '用户增长', '算法协作'],
      workExperience: [
        {
          company: '字节跳动', role: 'AI 产品经理', period: '2023.03 - 至今',
          bullets: [
            '主导「智能创作助手」产品从 0 到 1 全流程落地，基于大模型构建 AI 文案生成与标题推荐功能，创作者采纳率 35%，日均生成 2 万+ 条内容，月活用户 150 万+',
            '负责 AI 标签推荐系统的产品策略，基于 NLP 技术重构标签体系与权重算法，CTR 提升 12%，阅读时长提升 8%',
            '从 0 到 1 搭建 A/B 实验平台与决策流程，覆盖多场景实验，迭代周期从 2 周缩短至 3 天',
            '协同算法团队优化模型效果，建立人机协作的标注反馈闭环，模型准确率提升 18%',
          ],
        },
        {
          company: '某互联网公司', role: '产品经理', period: '2022.07 - 2023.02',
          bullets: [
            '负责用户增长方向产品，设计裂变活动与分享机制，月活跃用户增长 25%',
            '搭建用户分层运营体系，基于行为数据制定差异化策略，用户留存率提升 15%',
          ],
        },
      ],
      projectExperience: [
        {
          name: 'AI 智能创作助手', role: '产品负责人', period: '2023.06 - 2024',
          bullets: [
            '洞察创作者"选题难、文案慢"核心痛点，独立完成从用户调研、需求分析到方案设计的全流程产品工作',
            '设计基于大模型的智能文案生成与标题推荐功能，通过多轮用户测试与 Prompt 迭代，内容采纳率从 22% 提升至 35%',
            '上线后创作者日均发布量提升 40%，功能月活用户 150 万+，成为平台核心创作工具',
          ],
        },
        {
          name: 'AI 标签推荐系统', role: '产品经理', period: '2023',
          bullets: [
            '主导内容标签体系重构，基于 NLP 实现标签自动化提取与多级分类，覆盖 100+ 垂类',
            '设计标签权重排序算法与推荐分发策略，CTR 提升 12%，用户阅读时长提升 8%',
          ],
        },
      ],
      skillsAndTools: '产品能力：需求分析 · PRD 撰写 · 用户研究 · 数据分析 · A/B 测试\nAI 能力：大模型应用 · Prompt Engineering · AI Agent · NLP 基础\n工具：Figma · Axure · SQL · Python · Jira',
      education: { school: '北京邮电大学', degree: '计算机科学与技术 本科', period: '2018.09 - 2022.06' },
    },
    interviewPrep: {
      likelyQuestions: [
        {
          question: '请介绍你主导的智能创作助手项目，从需求洞察到上线的完整过程。',
          suggestedAnswer: '我通过创作者访谈和数据分析发现，用户在短视频创作中最大的痛点是选题和写文案。我主导从 0 到 1 设计了基于大模型的 AI 文案生成功能，通过多轮 Prompt 优化将采纳率从 22% 提升到 35%，上线后日均生成 2 万+ 内容。项目涉及用户研究、PRD 撰写、算法协作、A/B 实验全流程。',
          evidenceNeeded: ['AI 产品从 0 到 1 经验', '数据驱动决策'],
        },
        {
          question: '你如何评估大模型生成内容的质量？采用了哪些评估方法？',
          suggestedAnswer: '采用多维度评估：人工评估（标注团队打分）、用户指标（采纳率、二次编辑率）、业务指标（发布量提升、用户活跃度）。建立了人机协作的标注反馈闭环，持续优化模型效果。',
          evidenceNeeded: ['模型评估方法', 'AI 产品指标设计'],
        },
        {
          question: '你是如何与算法团队协作的？协作流程是怎样的？',
          suggestedAnswer: '每周对齐需求与优先级，明确模型优化目标和评估标准。建立标注数据反馈闭环，产品侧收集用户反馈转化为模型训练数据，算法侧评估效果并迭代。通过 A/B 实验验证每个版本的效果。',
          evidenceNeeded: ['算法协作经验', '跨团队沟通'],
        },
        {
          question: '你搭建 A/B 实验平台的过程中遇到了什么挑战？如何解决的？',
          suggestedAnswer: '主要挑战是推动团队建立实验文化。我通过小范围试点验证价值，逐步推广到全团队。设计了标准化的实验流程和指标看板，降低了实验门槛。',
          evidenceNeeded: ['A/B 实验经验', '推动力'],
        },
        {
          question: 'AI 产品经理和传统产品经理最大的区别是什么？',
          suggestedAnswer: 'AI PM 需要理解模型能力边界，知道哪些问题适合用 AI 解决、哪些不适合。同时要能设计评估指标（准确率、召回率 vs 传统 UX 指标），协调算法和数据团队，管理模型版本迭代。还要关注数据隐私和 AI 伦理问题。',
          evidenceNeeded: ['AI 产品认知', '技术理解'],
        },
        {
          question: '你对 Prompt Engineering 有什么实践经验？',
          suggestedAnswer: '在智能创作助手中，我设计了多轮 Prompt 优化流程：先基于用户意图分类设计基础 Prompt，通过小范围测试发现问题，迭代优化指令和示例，最终将生成采纳率从 22% 提升至 35%。关键经验是 Prompt 需要结合具体场景持续迭代。',
          evidenceNeeded: ['Prompt Engineering', 'AI 产品设计'],
        },
        {
          question: '你如何决定一个功能是否需要用 AI 来实现？判断标准是什么？',
          suggestedAnswer: '从三个维度判断：用户痛点是否适合 AI 解决（有明确输入输出、容错空间）、技术可行性（模型能力是否达标）、ROI（开发成本 vs 用户价值）。不为了 AI 而 AI，传统方案能解决的问题用传统方案。',
          evidenceNeeded: ['AI 产品决策', '技术判断力'],
        },
        {
          question: '你最近在关注哪些 AI 领域的新方向？',
          suggestedAnswer: '关注 AI Agent 和 RAG 技术的发展，这两个方向在企业服务场景有很大潜力。也在关注多模态模型的应用进展，以及 LLM 的成本优化和推理加速方向。',
          evidenceNeeded: ['行业关注度', '技术热情'],
        },
        {
          question: '如果让你设计一个 AI 面试教练产品，你会怎么入手？',
          suggestedAnswer: '先明确目标用户和核心场景（求职者模拟面试），确定 AI 能力边界（问答评估、反馈生成）。设计交互流程和评估维度，MVP 先用通用模型快速验证，再基于用户反馈优化。指标关注用户留存和面试通过率提升。',
          evidenceNeeded: ['AI 产品设计方法论', '用户思维'],
        },
        {
          question: '你有什么想问我们的？',
          suggestedAnswer: '想了解团队当前 AI 产品的主要方向和技术栈、产品经理在团队中的协作模式、以及对新人的期望和成长路径。',
          evidenceNeeded: ['主动思考', '岗位关注度'],
        },
      ],
      evidenceToPrepare: [
        '智能创作助手的完整项目数据（用户量、采纳率、发布量提升）',
        'A/B 实验平台搭建的具体案例和效果数据',
        '与算法团队协作的具体模式和流程',
        'AI 标签推荐系统的技术方案和效果数据',
        '个人对 AI 行业的学习和研究项目',
      ],
      possibleExaggerations: [
        'AI 产品经验 2 年，需确保能深入回答 AI 技术细节',
        '月活 500 万+可能是产品整体而非个人贡献，需明确口径',
        'Python 和 SQL 水平需要明确到具体使用场景',
      ],
      dataToSupplement: [
        '准备智能创作助手项目的完整数据报告',
        '梳理 A/B 实验的具体案例和统计学方法',
        '整理对 LLM 技术原理的 understanding',
        '准备 1-2 个 AI 行业见解或产品分析观点',
      ],
      selfIntroduction: '面试官您好，我是张明，有 4 年互联网产品经验，其中 2 年在字节跳动做 AI 产品经理。我主导了「智能创作助手」从 0 到 1 的全流程落地，基于大模型帮创作者生成文案和标题，上线后创作者发布量提升了 40%。我还负责 AI 标签推荐系统的产品策略，通过 NLP 技术重构标签体系，CTR 提升了 12%。我本科学计算机科学，对 LLM、AI Agent 等前沿方向有持续热情。我相信自己在 AI 产品设计、数据驱动决策和算法协作方面的经验，能够很好地胜任这个岗位。谢谢！',
    },
  }

  return normalizeAnalysisResult(raw, _input)
}

export async function runMockRegenerateOptimized(
  _input: UserInput,
  style: OptimizeStyle
): Promise<any[]> {
  await delay(500)

  const styleLabels: Record<OptimizeStyle, string> = {
    'concise': '（简洁版）',
    'reduce-exaggeration': '（客观务实版）',
    'ai-product': '（AI 产品向）',
    'tob-saas': '（ToB SaaS 向）',
  }
  const label = styleLabels[style]

  return [
    {
      id: 'opt-1', section: '职业摘要',
      before: 'AI 产品经理，4 年互联网产品经验',
      after: `AI 产品经理，4 年经验，字节跳动 AI 产品背景${label}`,
      reason: '根据风格调整摘要重点', riskWarning: '无显著风险',
    },
    {
      id: 'opt-2', section: '工作经历 - 字节跳动',
      before: '主导智能创作助手从 0 到 1，使用率 35%',
      after: `主导 AI 创作助手全流程落地，创作者采纳率 35%，日均 2 万+ 内容${label}`,
      reason: '突出 AI 产品落地能力', riskWarning: '无显著风险',
    },
    {
      id: 'opt-3', section: '项目成果 - 标签推荐',
      before: 'CTR 提升 12%，阅读时长提升 8%',
      after: `CTR 提升 12%，阅读时长提升 8%，覆盖 100+ 垂类${label}`,
      reason: '补充技术覆盖面', riskWarning: '无显著风险',
    },
    {
      id: 'opt-4', section: '新增 - 技能分类',
      before: '（无分类技能模块）',
      after: `【产品能力】需求分析 · PRD 撰写 · 数据分析 · A/B 测试\n【AI 能力】大模型应用 · Prompt Engineering · AI Agent\n【工具】Figma · SQL · Python${label}`,
      reason: '分类展示技能方便匹配', riskWarning: '技能水平需确认',
    },
    {
      id: 'opt-5', section: '项目经历 - AI 创作助手',
      before: '洞察创作者痛点，设计 AI 文案生成功能',
      after: `通过用户访谈和数据分析洞察创作者核心痛点，设计基于大模型的智能文案生成方案${label}`,
      reason: '补充用户研究方法', riskWarning: '无显著风险',
    },
  ]
}

export async function runMockFollowUpBullet(
  _input: UserInput,
  _question: string,
  _purpose: string,
  userAnswer: string
): Promise<string> {
  await delay(300)
  return `基于补充信息「${userAnswer.slice(0, 40)}...」，在 AI 产品设计中结合用户反馈与数据分析持续迭代优化，推动核心指标提升，沉淀可复用的 AI 产品方法论。`
}
