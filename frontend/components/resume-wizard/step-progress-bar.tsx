"use client";

import { V20Card } from "@/components/tools/v20-ui";
import { useResumeWizard } from "@/hooks/use-resume-wizard";
import { STEP_LABELS, STEPS, type StepId } from "@/lib/resume-wizard/types";
import { cn } from "@/lib/utils";

export function StepProgressBar() {
  const store = useResumeWizard();
  const steps = STEPS.map((id) => ({ id, label: STEP_LABELS[id] }));

  const handleStepClick = (step: StepId) => {
    const status = store.getStepStatus(step);
    if (status === "disabled") return;
    store.setCurrentStep(step);
  };

  const indicatorClass = (step: StepId) => {
    const status = store.getStepStatus(step);
    if (status === "completed" || status === "active") return "bg-brand text-white";
    if (status === "pending") return "bg-gray-100 text-text-secondary";
    return "bg-gray-50 text-gray-300";
  };

  const labelClass = (step: StepId) => {
    const status = store.getStepStatus(step);
    if (status === "active") return "text-brand font-medium";
    if (status === "completed") return "text-text-primary";
    if (status === "pending") return "text-text-secondary";
    return "text-gray-300";
  };

  const connectorClass = (idx: number) => {
    const currentStepIdx = steps.findIndex((s) => s.id === store.currentStep);
    return idx < currentStepIdx ? "text-brand" : "text-gray-200";
  };

  const score = store.analysisResult?.diagnosis.overallScore;
  const scoreColor = score && score >= 70 ? "text-green-600" : score && score >= 50 ? "text-amber-600" : "text-red-600";
  const barColor = score && score >= 70 ? "bg-green-500" : score && score >= 50 ? "bg-amber-500" : "bg-red-500";

  return (
    <V20Card className="mb-6 px-6 py-4" padding={false}>
      <div className="flex items-center justify-between">
        <div className="flex flex-1 items-center gap-0 overflow-x-auto">
          {steps.map((step, idx) => (
            <button
              key={step.id}
              type="button"
              onClick={() => handleStepClick(step.id)}
              className={cn(
                "flex shrink-0 cursor-pointer items-center",
                store.getStepStatus(step.id) === "disabled" && "cursor-not-allowed",
              )}
            >
              <span className={cn("flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-all", indicatorClass(step.id))}>
                {store.getStepStatus(step.id) === "completed" ? "✓" : idx + 1}
              </span>
              <span className={cn("ml-1.5 whitespace-nowrap text-xs transition-colors", labelClass(step.id))}>{step.label}</span>
              {idx < steps.length - 1 && (
                <svg className={cn("mx-2 h-px w-6", connectorClass(idx))}>
                  <line x1="0" y1="0" x2="24" y2="0" stroke="currentColor" strokeWidth="1" />
                </svg>
              )}
            </button>
          ))}
        </div>

        {store.analysisResult && (
          <div className="ml-6 flex shrink-0 items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-secondary">匹配度</span>
              <span className={cn("text-sm font-bold", scoreColor)}>{score}</span>
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
                <div className={cn("h-full rounded-full transition-all duration-500", barColor)} style={{ width: `${score}%` }} />
              </div>
            </div>
            {store.aiMode === "mock" && <span className="text-xs text-gray-400">⚡ Mock</span>}
          </div>
        )}
      </div>
    </V20Card>
  );
}
