"use client";

import { useEffect, useState } from "react";

import { StepContent } from "@/components/resume-wizard/wizard-steps";
import { StepProgressBar } from "@/components/resume-wizard/step-progress-bar";
import { HistoryListItem } from "@/components/tools/history-list-item";
import { V20PageHeader } from "@/components/tools/v20-ui";
import { ResumeWizardProvider, useResumeWizard } from "@/hooks/use-resume-wizard";
import { resumeAnalysisRepo } from "@/lib/local-db";

function ResumeWizardInner() {
  const store = useResumeWizard();
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    void store.loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parseTitle = (rec: (typeof store.savedRecords)[0]) => {
    try {
      const input = JSON.parse(rec.userInput);
      return input.targetRole || "未命名";
    } catch {
      return "未命名";
    }
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <div>
      <V20PageHeader title="简历优化" description="基于目标 JD 的智能简历优化" />

      <div className="mb-6">
        <button type="button" className="text-sm text-brand hover:text-brand-hover" onClick={() => setShowHistory((v) => !v)}>
          {showHistory ? "收起历史记录" : "查看历史记录"}
        </button>
        {showHistory && store.savedRecords.length > 0 && (
          <div className="mt-3 space-y-2">
            {store.savedRecords.map((rec) => (
              <HistoryListItem
                key={rec.id}
                title={parseTitle(rec)}
                subtitle={formatDate(rec.updatedAt)}
                onOpen={() => {
                  store.loadRecord(rec);
                  setShowHistory(false);
                }}
                onRename={async (nextTitle) => {
                  if (rec.id == null) return;
                  try {
                    const input = JSON.parse(rec.userInput) as Record<string, unknown>;
                    input.targetRole = nextTitle;
                    await resumeAnalysisRepo.update(rec.id, { userInput: JSON.stringify(input) });
                    await store.loadRecords();
                  } catch {
                    // ignore
                  }
                }}
                onDelete={async () => {
                  if (rec.id) await store.deleteRecord(rec.id);
                }}
              />
            ))}
          </div>
        )}
        {showHistory && store.savedRecords.length === 0 && (
          <div className="mt-3 text-sm text-text-secondary">暂无保存记录</div>
        )}
      </div>

      <StepProgressBar />
      <StepContent />
    </div>
  );
}

export function ResumeWizard() {
  return (
    <ResumeWizardProvider>
      <ResumeWizardInner />
    </ResumeWizardProvider>
  );
}
