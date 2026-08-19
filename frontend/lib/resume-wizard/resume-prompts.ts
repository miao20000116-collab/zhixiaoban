import type { AnalysisResult, OptimizedItem, OptimizeStyle } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ==================== 系统提示 ====================

export const RESUME_AGENT_SYSTEM_PROMPT = `你是「简历专家」，一位 JD 定制简历优化 Agent。
你的任务是基于目标岗位 JD 与用户原始简历，输出结构化 JSON 分析结果。

要求：
1. 所有内容使用中文
2. 分析必须基于用户提供的 JD 与简历，不得编造无法从材料推断的虚假经历
3. 对缺失证据要明确标注 needsSupplement 或 evidenceStrength 为 weak/none
4. followUpQuestions 生成 5-10 条，id 格式 fu-1, fu-2...
5. optimizedItems 至少 5 条，id 格式 opt-1, opt-2...
6. interviewPrep.likelyQuestions 恰好 10 条
7. overallScore 与各 dimensionScores.score 范围 0-100
8. 只输出合法 JSON，不要 markdown 代码块`

// ==================== 输入上下文构建 ====================

export function buildInputContext(input: {
  targetRole: string
  industry: string
  companyType: string
  jobStage: string
  highlightSkills: string
  jobDescription: string
  originalResume: string
  additionalInfo: string
}): string {
  return `【目标岗位】${input.targetRole || '（未提供）'}
【行业】${input.industry || '（未提供）'}
【公司类型】${input.companyType || '（未提供）'}
【求职阶段】${input.jobStage || '（未提供）'}
【希望突出能力】${input.highlightSkills || '（未提供）'}

【目标 JD】
${input.jobDescription || '（未提供）'}

【原始简历】
${input.originalResume || '（未提供）'}

【补充信息】
${input.additionalInfo || '（未提供）'}`
}

// ==================== 阶段提示词 ====================

/**
 * 阶段1: JD 分析
 */
export function buildAnalyzeCorePrompt(input: Parameters<typeof buildInputContext>[0]): string {
  return `${buildInputContext(input)}

请分析目标 JD，输出 JSON 格式的结果，包含以下字段：
- responsibilities: string[]（主要职责）
- hardRequirements: string[]（硬性要求）
- implicitRequirements: string[]（隐含/软性要求）
- keywords: string[]（关键词）
- idealCandidate: string（理想候选人画像，一段话）
- coreCompetencies: CoreCompetency[]（核心能力要求，每项包含 name/importance[high|medium|low]/description）

只输出 JSON，不要 markdown。`
}

/**
 * 阶段2: 诊断 + 匹配 + 追问
 */
export function buildAnalyzeDiagnosisPrompt(input: Parameters<typeof buildInputContext>[0]): string {
  return `${buildInputContext(input)}

请分析简历与 JD 的匹配情况，输出 JSON 格式，包含以下字段：

1. diagnosis: {
  overallScore: number（0-100）
  dimensionScores: [{ dimension: string, score: number, comment: string }]
  mainIssues: string[]
  prioritySuggestions: string[]
}

2. matchItems: [{
  jdRequirement: string
  resumeEvidence: string
  evidenceStrength: "strong" | "medium" | "weak" | "none"
  needsSupplement: boolean
  optimizationSuggestion: string
}]
（生成 6-8 条匹配项）

3. followUpQuestions: [{
  id: string（格式 fu-1, fu-2...）
  question: string
  purpose: string
  userAnswer: string（留空）
  generatedBullet: string 或 null（留空）
}]
（生成 5-7 条追问）

只输出 JSON，不要 markdown。`
}

/**
 * 阶段3: 优化 + 最终简历
 */
export function buildAnalyzeOutputPrompt(
  input: Parameters<typeof buildInputContext>[0],
  optimizeStyle: OptimizeStyle,
  coreSummary: string
): string {
  const styleLabel: Record<OptimizeStyle, string> = {
    'concise': '更简洁（精简冗余表达，突出关键成就）',
    'reduce-exaggeration': '降低夸张（避免过度修饰，使用客观务实的语言）',
    'ai-product': '更偏 AI 产品（强调 AI 认知、LLM 应用、数据驱动等能力）',
    'tob-saas': '更偏 ToB SaaS（突出客户对接、需求分析、项目管理等能力）',
  }

  return `${buildInputContext(input)}

优化风格：${styleLabel[optimizeStyle]}

核心摘要供参考：
${coreSummary}

请输出 JSON 格式，包含以下字段：

1. optimizedItems: [{
  id: string（格式 opt-1, opt-2...）
  section: string（所属模块名）
  before: string（修改前原文）
  after: string（修改后）
  reason: string（修改理由）
  riskWarning: string（风险提示，如"无显著风险"）
}]
（至少 5 条，突出优化风格）

2. finalResume: {
  personalInfo: { name, email, phone, location }
  jobIntent: string
  summary: string
  coreSkills: string[]
  workExperience: [{ company, role, period, bullets: string[] }]
  projectExperience: [{ name, role, period, bullets: string[] }]
  skillsAndTools: string
  education: { school, degree, period }
}

只输出 JSON，不要 markdown。`
}

/**
 * 阶段4: 面试准备
 */
export function buildAnalyzeInterviewPrompt(
  input: Parameters<typeof buildInputContext>[0],
  coreSummary: string
): string {
  return `${buildInputContext(input)}

核心摘要供参考：
${coreSummary}

请输出 JSON 格式的面试准备内容，包含以下字段：

1. likelyQuestions: [{
  question: string
  suggestedAnswer: string
  evidenceNeeded: string[]
}]
（恰好 10 条面试问题及建议回答）

2. evidenceToPrepare: string[]（面试前需要准备的证据/案例清单）

3. possibleExaggerations: string[]（简历中可能被质疑的夸大点）

4. dataToSupplement: string[]（需要补充的数据/信息）

5. selfIntroduction: string（一段 1-2 分钟的自我介绍）

只输出 JSON，不要 markdown。`
}

/**
 * 重新生成优化项（切换风格时用）
 */
export function buildOptimizeUserPrompt(
  input: Parameters<typeof buildInputContext>[0],
  style: OptimizeStyle
): string {
  const styleLabel: Record<OptimizeStyle, string> = {
    'concise': '更简洁',
    'reduce-exaggeration': '降低夸张',
    'ai-product': '更偏 AI 产品',
    'tob-saas': '更偏 ToB SaaS',
  }

  return `${buildInputContext(input)}

请按"${styleLabel[style]}"风格重新优化简历，输出 JSON 格式：
optimizedItems: [{ id, section, before, after, reason, riskWarning }]
至少 5 条。

只输出 JSON，不要 markdown。`
}

/**
 * 生成追问 bullet
 */
export function buildFollowUpBulletPrompt(
  input: Parameters<typeof buildInputContext>[0],
  question: string,
  purpose: string,
  userAnswer: string
): string {
  return `${buildInputContext(input)}

【追问问题】${question}
【追问目的】${purpose}
【用户补充回答】${userAnswer}

请根据用户的补充回答，生成 1-2 句精炼的简历 bullet point。
要求：动作 + 方法/场景 + 量化结果（如有）；不要夸大；不要引号包裹。

只输出一段文本，不要 JSON。`
}

// ==================== 归一化函数 ====================

export function clampScore(score: unknown): number {
  const n = typeof score === 'number' ? score : Number(score) || 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

export function normalizeAnalysisResult(raw: any, input?: any): AnalysisResult {
  const fallback = (val: any, def: any) => val ?? def

  const jdAnalysis = fallback(raw?.jdAnalysis, {})
  const diagnosis = fallback(raw?.diagnosis, {})
  const matchItems = fallback(raw?.matchItems, [])
  const followUpQuestions = fallback(raw?.followUpQuestions, [])
  const optimizedItems = fallback(raw?.optimizedItems, [])
  const finalResume = fallback(raw?.finalResume, {})
  const interviewPrep = fallback(raw?.interviewPrep, {})

  const validStrengths = ['strong', 'medium', 'weak', 'none']

  return {
    jdAnalysis: {
      responsibilities: jdAnalysis.responsibilities ?? [],
      hardRequirements: jdAnalysis.hardRequirements ?? [],
      implicitRequirements: jdAnalysis.implicitRequirements ?? [],
      keywords: jdAnalysis.keywords ?? [],
      idealCandidate: jdAnalysis.idealCandidate ?? '',
      coreCompetencies: (jdAnalysis.coreCompetencies ?? []).map((c: any) => ({
        name: c.name ?? '',
        importance: c.importance ?? 'medium',
        description: c.description ?? '',
      })),
    },
    diagnosis: {
      overallScore: clampScore(diagnosis.overallScore),
      dimensionScores: (diagnosis.dimensionScores ?? []).map((d: any) => ({
        dimension: d.dimension ?? '',
        score: clampScore(d.score),
        comment: d.comment ?? '',
      })),
      mainIssues: diagnosis.mainIssues ?? [],
      prioritySuggestions: diagnosis.prioritySuggestions ?? [],
    },
    matchItems: (matchItems as any[]).map((m: any) => ({
      jdRequirement: m.jdRequirement ?? '',
      resumeEvidence: m.resumeEvidence ?? '',
      evidenceStrength: validStrengths.includes(m.evidenceStrength) ? m.evidenceStrength : 'none',
      needsSupplement: !!m.needsSupplement,
      optimizationSuggestion: m.optimizationSuggestion ?? '',
    })),
    followUpQuestions: (followUpQuestions as any[]).map((q: any, i: number) => ({
      id: q.id ?? `fu-${i + 1}`,
      question: q.question ?? '',
      purpose: q.purpose ?? '',
      userAnswer: q.userAnswer ?? '',
      generatedBullet: q.generatedBullet ?? null,
    })),
    optimizedItems: (optimizedItems as any[]).map((o: any, i: number) => ({
      id: o.id ?? `opt-${i + 1}`,
      section: o.section ?? '',
      before: o.before ?? '',
      after: o.after ?? '',
      reason: o.reason ?? '',
      riskWarning: o.riskWarning ?? '无显著风险',
    })),
    finalResume: {
      personalInfo: {
        name: finalResume.personalInfo?.name ?? input?.targetRole ? `${input.targetRole}从业者` : '候选人',
        email: finalResume.personalInfo?.email ?? '',
        phone: finalResume.personalInfo?.phone ?? '',
        location: finalResume.personalInfo?.location ?? '',
      },
      jobIntent: finalResume.jobIntent ?? input?.targetRole ?? '',
      summary: finalResume.summary ?? '',
      coreSkills: finalResume.coreSkills ?? [],
      workExperience: (finalResume.workExperience ?? []).map((w: any) => ({
        company: w.company ?? '',
        role: w.role ?? '',
        period: w.period ?? '',
        bullets: w.bullets ?? [],
      })),
      projectExperience: (finalResume.projectExperience ?? []).map((p: any) => ({
        name: p.name ?? '',
        role: p.role ?? '',
        period: p.period ?? '',
        bullets: p.bullets ?? [],
      })),
      skillsAndTools: finalResume.skillsAndTools ?? '',
      education: {
        school: finalResume.education?.school ?? '',
        degree: finalResume.education?.degree ?? '',
        period: finalResume.education?.period ?? '',
      },
    },
    interviewPrep: {
      likelyQuestions: (interviewPrep.likelyQuestions ?? []).map((q: any) => ({
        question: q.question ?? '',
        suggestedAnswer: q.suggestedAnswer ?? '',
        evidenceNeeded: q.evidenceNeeded ?? [],
      })),
      evidenceToPrepare: interviewPrep.evidenceToPrepare ?? [],
      possibleExaggerations: interviewPrep.possibleExaggerations ?? [],
      dataToSupplement: interviewPrep.dataToSupplement ?? [],
      selfIntroduction: interviewPrep.selfIntroduction ?? '',
    },
  }
}

export function normalizeOptimizedItems(items: any[]): OptimizedItem[] {
  return (items ?? []).map((o: any, i: number) => ({
    id: o.id ?? `opt-${i + 1}`,
    section: o.section ?? '',
    before: o.before ?? '',
    after: o.after ?? '',
    reason: o.reason ?? '',
    riskWarning: o.riskWarning ?? '无显著风险',
  }))
}
