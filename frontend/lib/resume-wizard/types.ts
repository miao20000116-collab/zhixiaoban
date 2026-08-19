export type StepId =
  | "input"
  | "jd-analysis"
  | "diagnosis"
  | "match"
  | "follow-up"
  | "optimize"
  | "final-resume"
  | "interview"
  | "export";

export type StepStatus = "pending" | "active" | "completed" | "disabled";
export type EvidenceStrength = "strong" | "medium" | "weak" | "none";
export type JobStage = "校招" | "社招-初级" | "社招-中级" | "社招-高级" | "转行";
export type CompanyType = "大厂" | "中型公司" | "创业公司" | "外企" | "国企";
export type OptimizeStyle = "concise" | "reduce-exaggeration" | "ai-product" | "tob-saas";
export type AIMode = "mock" | "llm";

export const STEPS: StepId[] = [
  "input",
  "jd-analysis",
  "diagnosis",
  "match",
  "follow-up",
  "optimize",
  "final-resume",
  "interview",
  "export",
];

export const STEP_LABELS: Record<StepId, string> = {
  input: "输入信息",
  "jd-analysis": "JD 分析",
  diagnosis: "诊断评分",
  match: "匹配分析",
  "follow-up": "查漏补缺",
  optimize: "优化对比",
  "final-resume": "最终简历",
  interview: "面试准备",
  export: "导出",
};

export const STYLE_LABELS: Record<OptimizeStyle, string> = {
  concise: "更简洁",
  "reduce-exaggeration": "降低夸张",
  "ai-product": "更偏 AI 产品",
  "tob-saas": "更偏 ToB SaaS",
};

export interface UserInput {
  targetRole: string;
  industry: string;
  companyType: CompanyType | "";
  jobStage: JobStage | "";
  highlightSkills: string;
  jobDescription: string;
  originalResume: string;
  additionalInfo: string;
}

export const defaultUserInput: UserInput = {
  targetRole: "",
  industry: "",
  companyType: "",
  jobStage: "",
  highlightSkills: "",
  jobDescription: "",
  originalResume: "",
  additionalInfo: "",
};

export interface CoreCompetency {
  name: string;
  importance: "high" | "medium" | "low";
  description: string;
}

export interface JDAnalysis {
  responsibilities: string[];
  hardRequirements: string[];
  implicitRequirements: string[];
  keywords: string[];
  idealCandidate: string;
  coreCompetencies: CoreCompetency[];
}

export interface DimensionScore {
  dimension: string;
  score: number;
  comment: string;
}

export interface ResumeDiagnosis {
  overallScore: number;
  dimensionScores: DimensionScore[];
  mainIssues: string[];
  prioritySuggestions: string[];
}

export interface MatchItem {
  jdRequirement: string;
  resumeEvidence: string;
  evidenceStrength: EvidenceStrength;
  needsSupplement: boolean;
  optimizationSuggestion: string;
}

export interface FollowUpQuestion {
  id: string;
  question: string;
  purpose: string;
  userAnswer: string;
  generatedBullet: string | null;
}

export interface OptimizedItem {
  id: string;
  section: string;
  before: string;
  after: string;
  reason: string;
  riskWarning: string;
}

export interface WorkExperience {
  company: string;
  role: string;
  period: string;
  bullets: string[];
}

export interface ProjectExperience {
  name: string;
  role: string;
  period: string;
  bullets: string[];
}

export interface Education {
  school: string;
  degree: string;
  period: string;
}

export interface FinalResume {
  personalInfo: {
    name: string;
    email: string;
    phone: string;
    location: string;
  };
  jobIntent: string;
  summary: string;
  coreSkills: string[];
  workExperience: WorkExperience[];
  projectExperience: ProjectExperience[];
  skillsAndTools: string;
  education: Education;
}

export interface InterviewQuestion {
  question: string;
  suggestedAnswer: string;
  evidenceNeeded: string[];
}

export interface InterviewPrep {
  likelyQuestions: InterviewQuestion[];
  evidenceToPrepare: string[];
  possibleExaggerations: string[];
  dataToSupplement: string[];
  selfIntroduction: string;
}

export interface AnalysisResult {
  jdAnalysis: JDAnalysis;
  diagnosis: ResumeDiagnosis;
  matchItems: MatchItem[];
  followUpQuestions: FollowUpQuestion[];
  optimizedItems: OptimizedItem[];
  finalResume: FinalResume;
  interviewPrep: InterviewPrep;
}

export interface ResumeAnalysisRecord {
  id?: number;
  userInput: string;
  analysisResult?: string;
  optimizeStyle?: string;
  currentStep?: string;
  createdAt: number;
  updatedAt: number;
}
