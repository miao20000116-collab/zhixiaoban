"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { EXAMPLE_USER_INPUT } from "@/lib/resume-wizard/example-data";
import { resumeAnalysisRepo } from "@/lib/local-db";
import type {
  AIMode,
  AnalysisResult,
  OptimizeStyle,
  ResumeAnalysisRecord,
  StepId,
  StepStatus,
  UserInput,
} from "@/lib/resume-wizard/types";
import { STEPS, defaultUserInput } from "@/lib/resume-wizard/types";
import { analyzeResume, detectAIMode } from "@/services/resume-analysis";
import { runMockResumeAnalysis } from "@/services/resume-analysis-mock";

interface ResumeWizardContextValue {
  userInput: UserInput;
  setUserInput: (input: Partial<UserInput>) => void;
  currentStep: StepId;
  setCurrentStep: (step: StepId) => void;
  isAnalyzing: boolean;
  analysisResult: AnalysisResult | null;
  analysisError: string | null;
  optimizeStyle: OptimizeStyle;
  setOptimizeStyle: (style: OptimizeStyle) => void;
  aiMode: AIMode;
  savedRecordId: number | null;
  savedRecords: ResumeAnalysisRecord[];
  currentStepIndex: number;
  getStepStatus: (step: StepId) => StepStatus;
  loadExampleData: () => void;
  isInputUnchanged: () => boolean;
  startAnalysis: () => Promise<void>;
  setAnalysisResult: (result: AnalysisResult) => void;
  updateFollowUpAnswer: (id: string, answer: string) => void;
  setFollowUpBullet: (id: string, bullet: string) => void;
  goNext: () => void;
  goPrev: () => void;
  resetAll: () => void;
  saveToDB: () => Promise<void>;
  loadRecords: () => Promise<void>;
  loadRecord: (rec: ResumeAnalysisRecord) => void;
  deleteRecord: (id: number) => Promise<void>;
}

const ResumeWizardContext = createContext<ResumeWizardContextValue | null>(null);

export function ResumeWizardProvider({ children }: { children: ReactNode }) {
  const [userInput, setUserInputState] = useState<UserInput>({ ...defaultUserInput });
  const [currentStep, setCurrentStep] = useState<StepId>("input");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResultState] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [optimizeStyle, setOptimizeStyle] = useState<OptimizeStyle>("ai-product");
  const [aiMode, setAiMode] = useState<AIMode>("mock");
  const [savedRecordId, setSavedRecordId] = useState<number | null>(null);
  const [savedRecords, setSavedRecords] = useState<ResumeAnalysisRecord[]>([]);

  const cachedExampleInput = useRef("");
  const cachedExampleResult = useRef<AnalysisResult | null>(null);

  const currentStepIndex = STEPS.indexOf(currentStep);

  const getStepStatus = useCallback(
    (step: StepId): StepStatus => {
      const idx = STEPS.indexOf(step);
      const currentIdx = currentStepIndex;
      if (idx === currentIdx) return "active";
      if (idx < currentIdx) return "completed";
      if (analysisResult) return "pending";
      return "disabled";
    },
    [analysisResult, currentStepIndex],
  );

  const setUserInput = useCallback((input: Partial<UserInput>) => {
    setUserInputState((prev) => ({ ...prev, ...input }));
  }, []);

  const setAnalysisResult = useCallback((result: AnalysisResult) => {
    setAnalysisResultState(result);
    setAnalysisError(null);
  }, []);

  const loadExampleData = useCallback(() => {
    setUserInputState({ ...EXAMPLE_USER_INPUT });
    cachedExampleInput.current = JSON.stringify(EXAMPLE_USER_INPUT);
    void runMockResumeAnalysis(EXAMPLE_USER_INPUT, optimizeStyle).then((r) => {
      cachedExampleResult.current = r;
    });
  }, [optimizeStyle]);

  const isInputUnchanged = useCallback(() => {
    return !!cachedExampleInput.current && cachedExampleInput.current === JSON.stringify(userInput);
  }, [userInput]);

  const saveToDB = useCallback(async () => {
    const data = {
      userInput: JSON.stringify(userInput),
      analysisResult: analysisResult ? JSON.stringify(analysisResult) : "",
      optimizeStyle,
      currentStep,
    };
    if (savedRecordId) {
      await resumeAnalysisRepo.update(savedRecordId, data);
    } else {
      const id = await resumeAnalysisRepo.create(data);
      setSavedRecordId(Number(id));
    }
    const records = await resumeAnalysisRepo.list();
    setSavedRecords(records);
  }, [analysisResult, currentStep, optimizeStyle, savedRecordId, userInput]);

  const startAnalysis = useCallback(async () => {
    if (!userInput.targetRole.trim() || !userInput.jobDescription.trim() || !userInput.originalResume.trim()) {
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      if (isInputUnchanged() && cachedExampleResult.current) {
        setAnalysisResult(cachedExampleResult.current);
        setCurrentStep("jd-analysis");
        await saveToDB();
        return;
      }

      const mode = detectAIMode();
      const { result, mode: usedMode } = await analyzeResume({ ...userInput }, optimizeStyle);
      setAiMode(usedMode);
      setAnalysisResult(result);
      setCurrentStep("jd-analysis");
      await saveToDB();
      void mode;
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "分析失败，请重试");
    } finally {
      setIsAnalyzing(false);
    }
  }, [isInputUnchanged, optimizeStyle, saveToDB, setAnalysisResult, userInput]);

  const updateFollowUpAnswer = useCallback((id: string, answer: string) => {
    setAnalysisResultState((prev) => {
      if (!prev) return prev;
      const qs = prev.followUpQuestions.map((q) => (q.id === id ? { ...q, userAnswer: answer } : q));
      return { ...prev, followUpQuestions: qs };
    });
  }, []);

  const setFollowUpBullet = useCallback((id: string, bullet: string) => {
    setAnalysisResultState((prev) => {
      if (!prev) return prev;
      const qs = prev.followUpQuestions.map((q) => (q.id === id ? { ...q, generatedBullet: bullet } : q));
      return { ...prev, followUpQuestions: qs };
    });
  }, []);

  const goNext = useCallback(() => {
    const idx = STEPS.indexOf(currentStep);
    if (idx < STEPS.length - 1) setCurrentStep(STEPS[idx + 1]);
  }, [currentStep]);

  const goPrev = useCallback(() => {
    const idx = STEPS.indexOf(currentStep);
    if (idx > 0) setCurrentStep(STEPS[idx - 1]);
  }, [currentStep]);

  const resetAll = useCallback(() => {
    setUserInputState({ ...defaultUserInput });
    setCurrentStep("input");
    setIsAnalyzing(false);
    setAnalysisResultState(null);
    setAnalysisError(null);
    setOptimizeStyle("ai-product");
    setSavedRecordId(null);
    cachedExampleInput.current = "";
    cachedExampleResult.current = null;
  }, []);

  const loadRecords = useCallback(async () => {
    setSavedRecords(await resumeAnalysisRepo.list());
  }, []);

  const loadRecord = useCallback((rec: ResumeAnalysisRecord) => {
    try {
      setUserInputState(JSON.parse(rec.userInput));
      if (rec.analysisResult) setAnalysisResultState(JSON.parse(rec.analysisResult));
      setOptimizeStyle((rec.optimizeStyle as OptimizeStyle) || "ai-product");
      setCurrentStep((rec.currentStep as StepId) || "input");
      setSavedRecordId(rec.id ?? null);
    } catch {
      // ignore parse errors
    }
  }, []);

  const deleteRecord = useCallback(
    async (id: number) => {
      await resumeAnalysisRepo.remove(id);
      const records = await resumeAnalysisRepo.list();
      setSavedRecords(records);
      if (savedRecordId === id) resetAll();
    },
    [resetAll, savedRecordId],
  );

  const value = useMemo<ResumeWizardContextValue>(
    () => ({
      userInput,
      setUserInput,
      currentStep,
      setCurrentStep,
      isAnalyzing,
      analysisResult,
      analysisError,
      optimizeStyle,
      setOptimizeStyle,
      aiMode,
      savedRecordId,
      savedRecords,
      currentStepIndex,
      getStepStatus,
      loadExampleData,
      isInputUnchanged,
      startAnalysis,
      setAnalysisResult,
      updateFollowUpAnswer,
      setFollowUpBullet,
      goNext,
      goPrev,
      resetAll,
      saveToDB,
      loadRecords,
      loadRecord,
      deleteRecord,
    }),
    [
      aiMode,
      analysisError,
      analysisResult,
      currentStep,
      currentStepIndex,
      deleteRecord,
      getStepStatus,
      goNext,
      goPrev,
      isAnalyzing,
      isInputUnchanged,
      loadExampleData,
      loadRecord,
      loadRecords,
      optimizeStyle,
      resetAll,
      saveToDB,
      savedRecordId,
      savedRecords,
      setFollowUpBullet,
      setUserInput,
      startAnalysis,
      updateFollowUpAnswer,
      userInput,
    ],
  );

  return <ResumeWizardContext.Provider value={value}>{children}</ResumeWizardContext.Provider>;
}

export function useResumeWizard() {
  const ctx = useContext(ResumeWizardContext);
  if (!ctx) throw new Error("useResumeWizard must be used within ResumeWizardProvider");
  return ctx;
}
