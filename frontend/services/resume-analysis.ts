"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { getModelForTask } from "@/lib/ai-model-settings";
import { generate as aiGenerate } from "@/services/ai-direct";
import { parseJSONFromLLM } from "@/lib/parse-json";
import { fetchToolsAiConfig, hasBrowserApiKey, isServerKeysEnabled } from "@/lib/tool-api-keys";
import {
  RESUME_AGENT_SYSTEM_PROMPT,
  buildAnalyzeCorePrompt,
  buildAnalyzeDiagnosisPrompt,
  buildAnalyzeOutputPrompt,
  buildAnalyzeInterviewPrompt,
  buildOptimizeUserPrompt,
  buildInputContext,
  normalizeAnalysisResult,
  normalizeOptimizedItems,
} from "@/lib/resume-wizard/resume-prompts";
import type { AIMode, AnalysisResult, OptimizedItem, OptimizeStyle, UserInput } from "@/lib/resume-wizard/types";
import {
  runMockFollowUpBullet,
  runMockRegenerateOptimized,
  runMockResumeAnalysis,
} from "@/services/resume-analysis-mock";

export function detectAIMode(): AIMode {
  const hasLocalKey =
    hasBrowserApiKey("deepseek") ||
    hasBrowserApiKey("zhipu") ||
    hasBrowserApiKey("siliconflow") ||
    hasBrowserApiKey("doubao");
  if (hasLocalKey || isServerKeysEnabled()) return "llm";
  return "mock";
}

async function callAI(messages: { role: string; content: string }[], model?: string): Promise<string> {
  const result = await aiGenerate(messages, {
    model: model || getModelForTask("resume"),
    task: "resume",
    temperature: 0.7,
    max_tokens: 16384,
  });
  return result.content;
}

function buildCoreSummary(result: {
  diagnosis: { overallScore: number; mainIssues: string[]; prioritySuggestions: string[] };
  matchItems: Array<{ jdRequirement: string; evidenceStrength: string }>;
}): string {
  const topIssues = result.diagnosis.mainIssues.slice(0, 3).join("；");
  const topSuggestions = result.diagnosis.prioritySuggestions.slice(0, 3).join("；");
  const unmetNeeds = result.matchItems
    .filter((m) => m.evidenceStrength === "none" || m.evidenceStrength === "weak")
    .slice(0, 4)
    .map((m) => m.jdRequirement)
    .join("；");

  return `总体评分：${result.diagnosis.overallScore} 分；主要问题：${topIssues}；优化建议：${topSuggestions}；薄弱项：${unmetNeeds}`;
}

async function runLLMResumeAnalysis(input: UserInput, optimizeStyle: OptimizeStyle = "ai-product"): Promise<AnalysisResult> {
  const messages = [{ role: "system", content: RESUME_AGENT_SYSTEM_PROMPT }];

  const coreResult =
    parseJSONFromLLM<any>(await callAI([...messages, { role: "user", content: buildAnalyzeCorePrompt(input) }])) ||
    {
      jdAnalysis: {
        responsibilities: [],
        hardRequirements: [],
        implicitRequirements: [],
        keywords: [],
        idealCandidate: "",
        coreCompetencies: [],
      },
    };

  const diagResult =
    parseJSONFromLLM<any>(await callAI([...messages, { role: "user", content: buildAnalyzeDiagnosisPrompt(input) }])) ||
    {
      diagnosis: { overallScore: 50, dimensionScores: [], mainIssues: [], prioritySuggestions: [] },
      matchItems: [],
      followUpQuestions: [],
    };

  const partialResult = {
    jdAnalysis: coreResult.jdAnalysis || coreResult,
    diagnosis: diagResult.diagnosis || { overallScore: 50, dimensionScores: [], mainIssues: [], prioritySuggestions: [] },
    matchItems: diagResult.matchItems || [],
    followUpQuestions: diagResult.followUpQuestions || [],
  };

  const coreSummary = buildCoreSummary(partialResult);

  const [outputResult, interviewResult] = await Promise.all([
    (async () =>
      parseJSONFromLLM<any>(
        await callAI([...messages, { role: "user", content: buildAnalyzeOutputPrompt(input, optimizeStyle, coreSummary) }]),
      ) || { optimizedItems: [], finalResume: {} })(),
    (async () =>
      parseJSONFromLLM<any>(
        await callAI([...messages, { role: "user", content: buildAnalyzeInterviewPrompt(input, coreSummary) }]),
      ) || {
        likelyQuestions: [],
        evidenceToPrepare: [],
        possibleExaggerations: [],
        dataToSupplement: [],
        selfIntroduction: "",
      })(),
  ]);

  return normalizeAnalysisResult(
    {
      jdAnalysis: partialResult.jdAnalysis,
      diagnosis: partialResult.diagnosis,
      matchItems: partialResult.matchItems,
      followUpQuestions: partialResult.followUpQuestions,
      optimizedItems: outputResult.optimizedItems || [],
      finalResume: outputResult.finalResume || {},
      interviewPrep: interviewResult,
    },
    input,
  );
}

async function runLLMRegenerateOptimized(input: UserInput, style: OptimizeStyle): Promise<OptimizedItem[]> {
  const result = parseJSONFromLLM<any>(
    await callAI([
      { role: "system", content: RESUME_AGENT_SYSTEM_PROMPT },
      { role: "user", content: buildOptimizeUserPrompt(input, style) },
    ]),
  );
  return normalizeOptimizedItems(result?.optimizedItems || []);
}

async function runLLMFollowUpBullet(
  input: UserInput,
  question: string,
  purpose: string,
  userAnswer: string,
): Promise<string> {
  const prompt = buildInputContext(input);
  const result = await callAI([
    { role: "system", content: "你是简历优化助手，根据用户的补充回答生成精炼的 resume bullet point。只输出结果文本，不要 JSON。" },
    {
      role: "user",
      content: `背景信息：
${prompt}

【追问问题】${question}
【追问目的】${purpose}
【用户补充回答】${userAnswer}

请根据用户的补充回答，生成 1-2 句精炼的简历 bullet point。
要求：动作 + 方法/场景 + 量化结果（如有）；不要夸大；不要引号包裹。`,
    },
  ]);
  return result.trim();
}

async function resolveMode(): Promise<AIMode> {
  await fetchToolsAiConfig();
  return detectAIMode();
}

export async function analyzeResume(
  input: UserInput,
  style: OptimizeStyle = "ai-product",
): Promise<{ result: AnalysisResult; mode: AIMode }> {
  const mode = await resolveMode();
  if (mode === "llm") {
    return { result: await runLLMResumeAnalysis(input, style), mode };
  }
  return { result: await runMockResumeAnalysis(input, style), mode };
}

export async function regenerateOptimized(
  input: UserInput,
  style: OptimizeStyle,
): Promise<{ optimizedItems: OptimizedItem[]; mode: AIMode }> {
  const mode = await resolveMode();
  if (mode === "llm") {
    return { optimizedItems: await runLLMRegenerateOptimized(input, style), mode };
  }
  return { optimizedItems: await runMockRegenerateOptimized(input, style), mode };
}

export async function generateFollowUpBullet(
  input: UserInput,
  question: string,
  purpose: string,
  userAnswer: string,
): Promise<{ bullet: string; mode: AIMode }> {
  const mode = await resolveMode();
  if (mode === "llm") {
    return { bullet: await runLLMFollowUpBullet(input, question, purpose, userAnswer), mode };
  }
  return { bullet: await runMockFollowUpBullet(input, question, purpose, userAnswer), mode };
}
