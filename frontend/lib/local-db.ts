"use client";

import Dexie, { type EntityTable } from "dexie";

import type { ResumeAnalysisRecord } from "@/lib/resume-wizard/types";

export interface ResumeRecord {
  id?: number;
  title: string;
  rawContent: string;
  optimizedContent?: string;
  createdAt: number;
  updatedAt: number;
}

export interface JDRecord {
  id?: number;
  title: string;
  company?: string;
  rawContent: string;
  parsedData?: string;
  matchResult?: string;
  resumeId?: number;
  createdAt: number;
}

export interface ScriptRecord {
  id?: number;
  title: string;
  resumeId?: number;
  jdId?: number;
  targetRole?: string;
  qaPairs?: string;
  resumeText?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AnswerScoreRecord {
  id?: number;
  scriptId?: number;
  question: string;
  userAnswer: string;
  referenceAnswer?: string;
  score?: number;
  feedback?: string;
  createdAt: number;
}

export interface ScriptVersionRecord {
  id?: number;
  parentScriptId: number;
  version: number;
  qaPairs: string;
  note: string;
  createdAt: number;
}

export interface IndustryResearchRecord {
  id?: number;
  company: string;
  industry?: string;
  content: string;
  sourceUrls?: string[];
  createdAt: number;
}

export interface InterviewPredictRecord {
  id?: number;
  title: string;
  mode: string;
  company?: string;
  position?: string;
  jdText?: string;
  resumeText?: string;
  questions: string;
  createdAt: number;
}

export interface InterviewReviewRecord {
  id?: number;
  title: string;
  fileName: string;
  fileSize: number;
  duration: number;
  rawTranscript: string;
  annotatedTranscript: string;
  transcriptSegments: number;
  qaPairs: string;
  review: string;
  company?: string;
  position?: string;
  round?: string;
  interviewer?: string;
  interviewDate: string;
  createdAt: number;
  updatedAt: number;
}

export interface AppSettingRecord {
  id?: number;
  key: string;
  value: string;
}

export const toolDb = new (class extends Dexie {
  resumes!: EntityTable<ResumeRecord, "id">;
  jdRecords!: EntityTable<JDRecord, "id">;
  interviewScripts!: EntityTable<ScriptRecord, "id">;
  answerScores!: EntityTable<AnswerScoreRecord, "id">;
  scriptVersions!: EntityTable<ScriptVersionRecord, "id">;
  industryResearch!: EntityTable<IndustryResearchRecord, "id">;
  interviewPredicts!: EntityTable<InterviewPredictRecord, "id">;
  interviewReviews!: EntityTable<InterviewReviewRecord, "id">;
  appSettings!: EntityTable<AppSettingRecord, "id">;
  resumeAnalysis!: EntityTable<ResumeAnalysisRecord, "id">;

  constructor() {
    super("ZhiXiaoBanToolDB");
    this.version(1).stores({
      resumes: "++id, title, createdAt, updatedAt",
      jdRecords: "++id, title, company, createdAt",
      interviewScripts: "++id, title, resumeId, jdId, createdAt",
      answerScores: "++id, scriptId, createdAt",
      scriptVersions: "++id, parentScriptId, version, createdAt",
      industryResearch: "++id, company, createdAt",
      interviewReviews: "++id, title, company, createdAt",
      appSettings: "++id, key",
    });
    this.version(2).stores({
      resumes: "++id, title, createdAt, updatedAt",
      jdRecords: "++id, title, company, createdAt",
      interviewScripts: "++id, title, resumeId, jdId, createdAt",
      answerScores: "++id, scriptId, createdAt",
      scriptVersions: "++id, parentScriptId, version, createdAt",
      industryResearch: "++id, company, createdAt",
      interviewReviews: "++id, title, company, createdAt",
      appSettings: "++id, key",
      resumeAnalysis: "++id, createdAt, updatedAt",
    });
    // v3: scriptRepo 按 updatedAt 排序，需补索引
    this.version(3).stores({
      resumes: "++id, title, createdAt, updatedAt",
      jdRecords: "++id, title, company, createdAt",
      interviewScripts: "++id, title, resumeId, jdId, createdAt, updatedAt",
      answerScores: "++id, scriptId, createdAt",
      scriptVersions: "++id, parentScriptId, version, createdAt",
      industryResearch: "++id, company, createdAt",
      interviewReviews: "++id, title, company, createdAt, updatedAt",
      appSettings: "++id, key",
      resumeAnalysis: "++id, createdAt, updatedAt",
    });
    this.version(4).stores({
      resumes: "++id, title, createdAt, updatedAt",
      jdRecords: "++id, title, company, createdAt",
      interviewScripts: "++id, title, resumeId, jdId, createdAt, updatedAt",
      answerScores: "++id, scriptId, createdAt",
      scriptVersions: "++id, parentScriptId, version, createdAt",
      industryResearch: "++id, company, createdAt",
      interviewPredicts: "++id, title, mode, createdAt",
      interviewReviews: "++id, title, company, createdAt, updatedAt",
      appSettings: "++id, key",
      resumeAnalysis: "++id, createdAt, updatedAt",
    });
  }
})();

export const resumeRepo = {
  list: () => toolDb.resumes.orderBy("updatedAt").reverse().toArray(),
  create: (payload: Omit<ResumeRecord, "id" | "createdAt" | "updatedAt">) => {
    const now = Date.now();
    return toolDb.resumes.add({ ...payload, createdAt: now, updatedAt: now });
  },
  update: (id: number, payload: Partial<ResumeRecord>) =>
    toolDb.resumes.update(id, { ...payload, updatedAt: Date.now() }),
  remove: (id: number) => toolDb.resumes.delete(id),
};

export const jdRepo = {
  list: () => toolDb.jdRecords.orderBy("createdAt").reverse().toArray(),
  create: (payload: Omit<JDRecord, "id" | "createdAt">) =>
    toolDb.jdRecords.add({ ...payload, createdAt: Date.now() }),
  update: (id: number, payload: Partial<Omit<JDRecord, "id" | "createdAt">>) =>
    toolDb.jdRecords.update(id, payload),
  remove: (id: number) => toolDb.jdRecords.delete(id),
};

export const scriptRepo = {
  list: () => toolDb.interviewScripts.orderBy("updatedAt").reverse().toArray(),
  create: (payload: Omit<ScriptRecord, "id" | "createdAt" | "updatedAt">) => {
    const now = Date.now();
    return toolDb.interviewScripts.add({ ...payload, createdAt: now, updatedAt: now });
  },
  update: (id: number, payload: Partial<ScriptRecord>) =>
    toolDb.interviewScripts.update(id, { ...payload, updatedAt: Date.now() }),
  remove: (id: number) => toolDb.interviewScripts.delete(id),
  get: (id: number) => toolDb.interviewScripts.get(id),
};

export const answerScoreRepo = {
  list: () => toolDb.answerScores.orderBy("createdAt").reverse().toArray(),
  create: (payload: Omit<AnswerScoreRecord, "id" | "createdAt">) =>
    toolDb.answerScores.add({ ...payload, createdAt: Date.now() }),
  update: (id: number, payload: Partial<Omit<AnswerScoreRecord, "id" | "createdAt">>) =>
    toolDb.answerScores.update(id, payload),
  remove: (id: number) => toolDb.answerScores.delete(id),
};

export const industryResearchRepo = {
  list: () => toolDb.industryResearch.orderBy("createdAt").reverse().toArray(),
  create: (payload: Omit<IndustryResearchRecord, "id" | "createdAt">) =>
    toolDb.industryResearch.add({ ...payload, createdAt: Date.now() }),
  update: (id: number, payload: Partial<Omit<IndustryResearchRecord, "id" | "createdAt">>) =>
    toolDb.industryResearch.update(id, payload),
  remove: (id: number) => toolDb.industryResearch.delete(id),
};

export const interviewPredictRepo = {
  list: () => toolDb.interviewPredicts.orderBy("createdAt").reverse().toArray(),
  create: (payload: Omit<InterviewPredictRecord, "id" | "createdAt">) =>
    toolDb.interviewPredicts.add({ ...payload, createdAt: Date.now() }),
  update: (id: number, payload: Partial<Omit<InterviewPredictRecord, "id" | "createdAt">>) =>
    toolDb.interviewPredicts.update(id, payload),
  remove: (id: number) => toolDb.interviewPredicts.delete(id),
};

export const interviewReviewRepo = {
  list: () => toolDb.interviewReviews.orderBy("createdAt").reverse().toArray(),
  create: (payload: Omit<InterviewReviewRecord, "id" | "createdAt" | "updatedAt">) => {
    const now = Date.now();
    return toolDb.interviewReviews.add({ ...payload, createdAt: now, updatedAt: now });
  },
  update: (id: number, payload: Partial<Omit<InterviewReviewRecord, "id" | "createdAt">>) =>
    toolDb.interviewReviews.update(id, { ...payload, updatedAt: Date.now() }),
  remove: (id: number) => toolDb.interviewReviews.delete(id),
};

export const resumeAnalysisRepo = {
  list: () => toolDb.resumeAnalysis.orderBy("updatedAt").reverse().toArray(),
  create: (payload: Omit<ResumeAnalysisRecord, "id" | "createdAt" | "updatedAt">) => {
    const now = Date.now();
    return toolDb.resumeAnalysis.add({ ...payload, createdAt: now, updatedAt: now });
  },
  update: (id: number, payload: Partial<ResumeAnalysisRecord>) =>
    toolDb.resumeAnalysis.update(id, { ...payload, updatedAt: Date.now() }),
  remove: (id: number) => toolDb.resumeAnalysis.delete(id),
};

export function parseQaPairs(text?: string): Array<{ title?: string; question?: string; answer?: string; optimizedAnswer?: string }> {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export { parseScriptQaPairs, type ScriptQAPair } from "@/lib/script-qa-types";
