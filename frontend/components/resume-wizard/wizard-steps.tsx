"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { TemplateBeautify } from "@/components/resume-wizard/template-beautify";
import {
  EvidenceBadge,
  KeywordTags,
  ListSection,
  ScoreRing,
  SectionTitle,
  StepNav,
  importanceClass,
  importanceLabel,
  scoreBarClass,
  scoreTextClass,
} from "@/components/resume-wizard/shared";
import { V20Button, V20Card, V20Empty, V20Input, V20Select, V20Textarea } from "@/components/tools/v20-ui";
import { useResumeWizard } from "@/hooks/use-resume-wizard";
import { jdRepo, resumeRepo } from "@/lib/local-db";
import type { ResumeRecord } from "@/lib/local-db";
import { copyToClipboard, formatResumeAsText } from "@/lib/resume-wizard/helpers";
import { wrapHtml } from "@/lib/resume-wizard/template-utils";
import { savePredictHandoff } from "@/lib/tool-handoff";
import { STYLE_LABELS, type OptimizeStyle } from "@/lib/resume-wizard/types";
import { readFileText } from "@/services/file-parser";
import { generateFollowUpBullet, regenerateOptimized } from "@/services/resume-analysis";
import { cn } from "@/lib/utils";

export function InputStep() {
  const store = useResumeWizard();
  const [savedResumes, setSavedResumes] = useState<ResumeRecord[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string>("");
  const [uploadFileName, setUploadFileName] = useState("");
  const [uploadFileType, setUploadFileType] = useState("");
  const [previewImage, setPreviewImage] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [showGlobalPasteTip] = useState(true);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void resumeRepo.list().then(setSavedResumes);
  }, []);

  const canAnalyze =
    store.userInput.targetRole.trim() &&
    store.userInput.jobDescription.trim() &&
    store.userInput.originalResume.trim();

  const loadImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setPreviewImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            loadImageFile(file);
            break;
          }
        }
      }
    };
    document.addEventListener("paste", handleGlobalPaste);
    return () => document.removeEventListener("paste", handleGlobalPaste);
  }, []);

  const loadSelectedResume = (id: string) => {
    setSelectedResumeId(id);
    if (!id) return;
    const resume = savedResumes.find((r) => String(r.id) === id);
    if (resume) {
      store.setUserInput({ originalResume: resume.rawContent || resume.optimizedContent || "" });
    }
  };

  return (
    <div>
      <SectionTitle
        title="输入信息"
        description="填写目标岗位信息、JD 和原始简历，AI 将为你进行全面的简历优化分析"
      />

      {store.analysisError && (
        <div className="mb-4 rounded-[6px] border border-red-200 bg-red-50 p-3 text-sm text-red-700">{store.analysisError}</div>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <V20Button variant="ghost" onClick={store.loadExampleData}>
          使用示例数据
        </V20Button>
        <V20Button disabled={!canAnalyze || store.isAnalyzing} onClick={() => void store.startAnalysis()}>
          {store.isAnalyzing ? "分析中..." : "开始分析"}
        </V20Button>
        {store.analysisResult && (
          <V20Button variant="ghost" onClick={store.resetAll}>
            重新开始
          </V20Button>
        )}
      </div>

      <div className="space-y-4">
        <V20Card>
          <h3 className="mb-3 text-[14px] font-medium text-[#222]">目标岗位信息</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-[#666]">目标岗位 *</label>
              <V20Input
                value={store.userInput.targetRole}
                onChange={(e) => store.setUserInput({ targetRole: e.target.value })}
                placeholder="如：AI 产品经理"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-[#666]">行业</label>
              <V20Input
                value={store.userInput.industry}
                onChange={(e) => store.setUserInput({ industry: e.target.value })}
                placeholder="如：互联网/AI"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-[#666]">公司类型</label>
              <V20Select
                value={store.userInput.companyType}
                onChange={(e) => store.setUserInput({ companyType: e.target.value as typeof store.userInput.companyType })}
              >
                <option value="">请选择</option>
                <option value="大厂">大厂</option>
                <option value="中型公司">中型公司</option>
                <option value="创业公司">创业公司</option>
                <option value="外企">外企</option>
                <option value="国企">国企</option>
              </V20Select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-[#666]">求职阶段</label>
              <V20Select
                value={store.userInput.jobStage}
                onChange={(e) => store.setUserInput({ jobStage: e.target.value as typeof store.userInput.jobStage })}
              >
                <option value="">请选择</option>
                <option value="校招">校招</option>
                <option value="社招-初级">社招-初级</option>
                <option value="社招-中级">社招-中级</option>
                <option value="社招-高级">社招-高级</option>
                <option value="转行">转行</option>
              </V20Select>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm text-[#666]">希望突出的能力</label>
              <V20Input
                value={store.userInput.highlightSkills}
                onChange={(e) => store.setUserInput({ highlightSkills: e.target.value })}
                placeholder="如：AI Agent 产品设计、数据分析、B端 SaaS"
              />
            </div>
          </div>
        </V20Card>

        <V20Card>
          <h3 className="mb-3 text-[14px] font-medium text-[#222]">目标 JD *</h3>
          <div
            className={cn(
              "relative mb-3 cursor-pointer rounded-[8px] border-2 border-dashed p-4 text-center transition-colors",
              dragOver ? "border-brand bg-brand/5" : "border-border hover:border-brand/50",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file?.type.startsWith("image/")) loadImageFile(file);
            }}
            onClick={() => imageInputRef.current?.click()}
            onPaste={(e) => {
              const items = e.clipboardData?.items;
              if (!items) return;
              for (const item of items) {
                if (item.type.startsWith("image/")) {
                  const file = item.getAsFile();
                  if (file) loadImageFile(file);
                }
              }
            }}
            role="button"
            tabIndex={0}
          >
            {previewImage && (
              <div className="mb-3">
                <img src={previewImage} alt="截图预览" className="mx-auto max-h-32 rounded-[4px] shadow-sm" />
              </div>
            )}
            <div className="text-sm text-[#666]">
              {previewImage ? (
                <span className="text-brand">✅ 已加载图片，点击更换</span>
              ) : (
                <span>📷 粘贴截图（Ctrl+V） · 拖入图片 · 点击选择文件</span>
              )}
            </div>
            <p className="mt-1 text-xs text-[#999]">支持 PNG / JPG / WebP 格式</p>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) loadImageFile(file);
                e.target.value = "";
              }}
            />
          </div>
          {previewImage && (
            <div className="mb-3 flex items-center gap-3">
              <V20Button
                variant="ghost"
                onClick={() => {
                  setPreviewImage("");
                }}
              >
                清除图片
              </V20Button>
              <span className="text-xs text-text-secondary">OCR 暂未接入，请手动粘贴 JD 文字</span>
            </div>
          )}
          <V20Textarea
            value={store.userInput.jobDescription}
            onChange={(e) => store.setUserInput({ jobDescription: e.target.value })}
            className="min-h-[200px] font-mono"
            placeholder="请粘贴目标岗位的 JD 描述...（也可直接粘贴截图，AI 会自动提取文字）"
          />
        </V20Card>

        {showGlobalPasteTip && (
          <div className="mb-2 text-center text-xs text-[#999]">💡 在任何位置按 Ctrl+V 粘贴 JD 截图</div>
        )}

        <V20Card>
          <h3 className="mb-3 text-[14px] font-medium text-[#222]">原始简历 *</h3>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="whitespace-nowrap text-sm text-[#666]">从简历生成选择：</label>
              <V20Select
                className="min-w-[180px] p-2"
                value={selectedResumeId}
                onChange={(e) => loadSelectedResume(e.target.value)}
              >
                <option value="">— 请选择 —</option>
                {savedResumes.map((r) => (
                  <option key={r.id} value={String(r.id)}>
                    {r.title}
                  </option>
                ))}
              </V20Select>
            </div>
            <label className="flex cursor-pointer items-center gap-1.5 rounded-[6px] border border-border px-3 py-2 text-sm text-[#666] transition-colors hover:border-brand hover:text-brand">
              <span>📄</span>
              <span>上传简历文件</span>
              <input
                type="file"
                accept=".txt,.md,.docx,.pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  e.target.value = "";
                  setUploadFileName(file.name);
                  setUploadFileType("⏳ 解析中...");
                  void readFileText(file).then((text) => {
                    store.setUserInput({ originalResume: text });
                    setUploadFileType("✅ 已加载");
                  });
                }}
              />
            </label>
            {uploadFileName && <span className="text-xs text-brand">{uploadFileName}</span>}
            {uploadFileType && <span className="text-xs text-[#999]">{uploadFileType}</span>}
          </div>
          <V20Textarea
            value={store.userInput.originalResume}
            onChange={(e) => store.setUserInput({ originalResume: e.target.value })}
            className="min-h-[240px] font-mono"
            placeholder="请粘贴你的原始简历内容，或从上方选择已保存的简历 / 上传文件..."
          />
        </V20Card>

        <V20Card>
          <h3 className="mb-3 text-[14px] font-medium text-[#222]">补充信息（可选）</h3>
          <V20Textarea
            value={store.userInput.additionalInfo}
            onChange={(e) => store.setUserInput({ additionalInfo: e.target.value })}
            className="min-h-[100px]"
            placeholder="任何你觉得对简历优化有帮助的补充信息..."
          />
        </V20Card>

        <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
          <V20Button disabled={!canAnalyze || store.isAnalyzing} onClick={() => void store.startAnalysis()}>
            {store.isAnalyzing ? "分析中..." : "开始分析"}
          </V20Button>
        </div>
      </div>
    </div>
  );
}

export function JDAnalysisStep() {
  const store = useResumeWizard();
  const analysis = store.analysisResult?.jdAnalysis;

  return (
    <div>
      <SectionTitle title="JD 分析" description="AI 已解析目标 JD 的核心要素，帮助你理解岗位需求" />
      {analysis ? (
        <div className="space-y-4">
          <V20Card>
            <ListSection title="主要职责" items={analysis.responsibilities} />
          </V20Card>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <V20Card>
              <ListSection title="硬性要求" items={analysis.hardRequirements} />
            </V20Card>
            <V20Card>
              <ListSection title="隐含要求" items={analysis.implicitRequirements} />
            </V20Card>
          </div>
          <V20Card>
            <h3 className="mb-3 text-[14px] font-medium text-[#222]">关键词</h3>
            <KeywordTags keywords={analysis.keywords} />
          </V20Card>
          <V20Card>
            <h3 className="mb-3 text-[14px] font-medium text-[#222]">理想候选人画像</h3>
            <p className="text-[14px] leading-relaxed text-[#666]">{analysis.idealCandidate}</p>
          </V20Card>
          <V20Card>
            <h3 className="mb-3 text-[14px] font-medium text-[#222]">核心能力要求</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 text-left font-medium text-[#666]">能力</th>
                  <th className="py-2 text-left font-medium text-[#666]">重要性</th>
                  <th className="py-2 text-left font-medium text-[#666]">描述</th>
                </tr>
              </thead>
              <tbody>
                {analysis.coreCompetencies.map((c, idx) => (
                  <tr key={idx} className="border-b border-border/50">
                    <td className="py-2.5 text-[#222]">{c.name}</td>
                    <td className="py-2.5">
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", importanceClass(c.importance))}>
                        {importanceLabel(c.importance)}
                      </span>
                    </td>
                    <td className="py-2.5 text-[#666]">{c.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </V20Card>
        </div>
      ) : (
        <V20Empty>暂无 JD 分析数据，请先在「输入信息」步骤开始分析</V20Empty>
      )}
      <StepNav>
        <V20Button onClick={store.goNext}>下一步：诊断评分 →</V20Button>
      </StepNav>
    </div>
  );
}

export function DiagnosisStep() {
  const store = useResumeWizard();
  const diagnosis = store.analysisResult?.diagnosis;

  return (
    <div>
      <SectionTitle title="诊断评分" description="AI 对你的简历与目标岗位的匹配度进行综合评分" />
      {diagnosis ? (
        <div className="space-y-4">
          <V20Card className="flex items-center justify-center">
            <ScoreRing score={diagnosis.overallScore} />
          </V20Card>
          <V20Card>
            <h3 className="mb-4 text-[14px] font-medium text-[#222]">维度评分</h3>
            <div className="space-y-3">
              {diagnosis.dimensionScores.map((d, idx) => (
                <div key={idx}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-[#222]">{d.dimension}</span>
                    <span className={cn("font-medium tabular-nums", scoreTextClass(d.score))}>{d.score}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div className={cn("h-full rounded-full transition-all", scoreBarClass(d.score))} style={{ width: `${d.score}%` }} />
                  </div>
                  {d.comment && <p className="mt-1 text-xs text-[#666]">{d.comment}</p>}
                </div>
              ))}
            </div>
          </V20Card>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <V20Card>
              <ListSection title="主要问题" items={diagnosis.mainIssues} />
            </V20Card>
            <V20Card>
              <ListSection title="优先建议" items={diagnosis.prioritySuggestions} />
            </V20Card>
          </div>
        </div>
      ) : (
        <V20Empty>暂无诊断数据</V20Empty>
      )}
      <StepNav>
        <V20Button variant="ghost" onClick={store.goPrev}>
          ← 上一步
        </V20Button>
        <V20Button onClick={store.goNext}>下一步：匹配分析 →</V20Button>
      </StepNav>
    </div>
  );
}

export function MatchStep() {
  const store = useResumeWizard();
  const matchItems = store.analysisResult?.matchItems ?? [];

  return (
    <div>
      <SectionTitle title="匹配分析" description="逐项对比 JD 要求与简历证据，明确差距和优化方向" />
      {matchItems.length > 0 ? (
        <V20Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="w-[22%] py-3 text-left font-medium text-[#666]">JD 要求</th>
                <th className="w-[22%] py-3 text-left font-medium text-[#666]">简历证据</th>
                <th className="w-[12%] py-3 text-center font-medium text-[#666]">证据强度</th>
                <th className="w-[12%] py-3 text-center font-medium text-[#666]">需补充</th>
                <th className="w-[32%] py-3 text-left font-medium text-[#666]">优化建议</th>
              </tr>
            </thead>
            <tbody>
              {matchItems.map((item, idx) => (
                <tr key={idx} className="border-b border-border/50">
                  <td className="py-3 pr-2 align-top text-[#222]">{item.jdRequirement}</td>
                  <td className="py-3 pr-2 align-top text-[#666]">{item.resumeEvidence}</td>
                  <td className="py-3 text-center align-top">
                    <EvidenceBadge strength={item.evidenceStrength} />
                  </td>
                  <td className="py-3 text-center align-top">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        item.needsSupplement ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700",
                      )}
                    >
                      {item.needsSupplement ? "需补充" : "已覆盖"}
                    </span>
                  </td>
                  <td className="py-3 pl-2 align-top text-xs text-[#666]">{item.optimizationSuggestion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </V20Card>
      ) : (
        <V20Empty>暂无匹配数据</V20Empty>
      )}
      <StepNav>
        <V20Button variant="ghost" onClick={store.goPrev}>
          ← 上一步
        </V20Button>
        <V20Button onClick={store.goNext}>下一步：查漏补缺 →</V20Button>
      </StepNav>
    </div>
  );
}

export function FollowUpStep() {
  const store = useResumeWizard();
  const questions = store.analysisResult?.followUpQuestions ?? [];
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const generateBullet = async (q: (typeof questions)[0]) => {
    if (!q.userAnswer.trim()) return;
    setLoadingId(q.id);
    try {
      const { bullet } = await generateFollowUpBullet(store.userInput, q.question, q.purpose, q.userAnswer);
      store.setFollowUpBullet(q.id, bullet);
    } catch (err) {
      store.setFollowUpBullet(q.id, `（生成失败：${err instanceof Error ? err.message : "未知错误"}）`);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div>
      <SectionTitle title="查漏补缺" description="AI 针对简历短板提出问题，补充回答后可生成优化 bullet point" />
      {questions.length > 0 ? (
        <div className="space-y-4">
          {questions.map((q, idx) => (
            <V20Card key={q.id}>
              <div className="mb-3 flex items-start gap-2">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs text-white">
                  {idx + 1}
                </span>
                <div className="flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-[#222]">{q.question}</span>
                    <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">{q.purpose}</span>
                  </div>
                </div>
              </div>
              <V20Textarea
                value={q.userAnswer}
                onChange={(e) => store.updateFollowUpAnswer(q.id, e.target.value)}
                className="min-h-[80px]"
                placeholder="请在下方补充你的经历..."
              />
              <div className="mt-3">
                <V20Button disabled={!q.userAnswer.trim() || loadingId === q.id} onClick={() => void generateBullet(q)}>
                  {loadingId === q.id ? "生成中..." : "生成简历 Bullet"}
                </V20Button>
              </div>
              {q.generatedBullet && (
                <div className="mt-3 rounded-[6px] border border-green-200 bg-green-50 p-3">
                  <p className="mb-1 text-xs font-medium text-green-600">✅ 生成的简历描述：</p>
                  <p className="text-sm text-green-800">{q.generatedBullet}</p>
                </div>
              )}
            </V20Card>
          ))}
        </div>
      ) : (
        <V20Empty>暂无追问数据</V20Empty>
      )}
      <StepNav>
        <V20Button variant="ghost" onClick={store.goPrev}>
          ← 上一步
        </V20Button>
        <V20Button onClick={store.goNext}>下一步：优化对比 →</V20Button>
      </StepNav>
    </div>
  );
}

export function OptimizeStep() {
  const store = useResumeWizard();
  const items = store.analysisResult?.optimizedItems ?? [];
  const [styleLoading, setStyleLoading] = useState(false);

  const switchStyle = async (style: OptimizeStyle) => {
    if (style === store.optimizeStyle) return;
    store.setOptimizeStyle(style);
    setStyleLoading(true);
    try {
      const { optimizedItems } = await regenerateOptimized({ ...store.userInput }, style);
      if (store.analysisResult) {
        store.setAnalysisResult({ ...store.analysisResult, optimizedItems });
      }
      await store.saveToDB();
    } finally {
      setStyleLoading(false);
    }
  };

  return (
    <div>
      <SectionTitle title="优化对比" description="查看 AI 对简历各模块的优化前后对比，可切换不同优化风格" />
      {items.length > 0 ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm text-[#666]">优化风格：</span>
            {(Object.entries(STYLE_LABELS) as [OptimizeStyle, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={cn(
                  "rounded-[6px] px-3 py-1.5 text-sm transition-colors",
                  store.optimizeStyle === key
                    ? "bg-brand text-white"
                    : "border border-border text-[#666] hover:border-brand",
                )}
                onClick={() => void switchStyle(key)}
              >
                {label}
              </button>
            ))}
            {styleLoading && <span className="ml-2 text-sm text-[#666]">重新生成中...</span>}
          </div>
          <V20Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="w-[15%] py-3 text-left font-medium text-[#666]">模块</th>
                  <th className="w-[25%] py-3 text-left font-medium text-[#666]">修改前</th>
                  <th className="w-[25%] py-3 text-left font-medium text-[#666]">修改后</th>
                  <th className="w-[20%] py-3 text-left font-medium text-[#666]">修改理由</th>
                  <th className="w-[15%] py-3 text-left font-medium text-[#666]">风险提示</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-border/50">
                    <td className="py-3 pr-2 align-top font-medium text-[#222]">{item.section}</td>
                    <td className="py-3 pr-2 align-top text-xs text-[#666]">
                      <span className="line-through">{item.before}</span>
                    </td>
                    <td className="py-3 pr-2 align-top text-xs text-[#222]">{item.after}</td>
                    <td className="py-3 pr-2 align-top text-xs text-[#666]">{item.reason}</td>
                    <td className="py-3 align-top text-xs">
                      {item.riskWarning && item.riskWarning !== "无显著风险" ? (
                        <span className="text-amber-600">⚠️ {item.riskWarning}</span>
                      ) : (
                        <span className="text-green-600">{item.riskWarning}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </V20Card>
        </>
      ) : (
        <V20Empty>暂无优化数据</V20Empty>
      )}
      <StepNav>
        <V20Button variant="ghost" onClick={store.goPrev}>
          ← 上一步
        </V20Button>
        <V20Button onClick={store.goNext}>下一步：最终简历 →</V20Button>
      </StepNav>
    </div>
  );
}

function FinalResumeView({ resume }: { resume: NonNullable<ReturnType<typeof useResumeWizard>["analysisResult"]>["finalResume"] }) {
  return (
    <V20Card className="p-6">
      <div className="mb-4 text-center">
        <h2 className="text-xl font-semibold text-[#222]">{resume.personalInfo.name}</h2>
        <p className="mt-1 text-sm text-[#666]">
          {resume.personalInfo.email} | {resume.personalInfo.phone} | {resume.personalInfo.location}
        </p>
      </div>
      {resume.jobIntent && (
        <div className="mb-4">
          <h3 className="mb-2 border-b border-border pb-1 text-sm font-medium text-brand">求职意向</h3>
          <p className="text-sm text-[#222]">{resume.jobIntent}</p>
        </div>
      )}
      {resume.summary && (
        <div className="mb-4">
          <h3 className="mb-2 border-b border-border pb-1 text-sm font-medium text-brand">个人摘要</h3>
          <p className="text-sm leading-relaxed text-[#666]">{resume.summary}</p>
        </div>
      )}
      {resume.coreSkills.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 border-b border-border pb-1 text-sm font-medium text-brand">核心能力</h3>
          <div className="flex flex-wrap gap-2">
            {resume.coreSkills.map((skill) => (
              <span key={skill} className="rounded-full border border-border bg-white px-2.5 py-1 text-xs text-[#666]">
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}
      {resume.workExperience.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 border-b border-border pb-1 text-sm font-medium text-brand">工作经历</h3>
          {resume.workExperience.map((exp, idx) => (
            <div key={idx} className="mb-3">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-sm font-medium text-[#222]">{exp.company}</span>
                <span className="text-xs text-[#666]">
                  {exp.role} | {exp.period}
                </span>
              </div>
              <ul className="space-y-1">
                {exp.bullets.map((b, bi) => (
                  <li key={bi} className="flex items-start gap-2 text-sm text-[#666]">
                    <span className="mt-0.5 shrink-0 text-gray-300">•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {resume.projectExperience.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 border-b border-border pb-1 text-sm font-medium text-brand">项目经历</h3>
          {resume.projectExperience.map((proj, idx) => (
            <div key={idx} className="mb-3">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-sm font-medium text-[#222]">{proj.name}</span>
                <span className="text-xs text-[#666]">
                  {proj.role} | {proj.period}
                </span>
              </div>
              <ul className="space-y-1">
                {proj.bullets.map((b, bi) => (
                  <li key={bi} className="flex items-start gap-2 text-sm text-[#666]">
                    <span className="mt-0.5 shrink-0 text-gray-300">•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {resume.skillsAndTools && (
        <div className="mb-4">
          <h3 className="mb-2 border-b border-border pb-1 text-sm font-medium text-brand">技能工具</h3>
          <p className="whitespace-pre-wrap text-sm text-[#666]">{resume.skillsAndTools}</p>
        </div>
      )}
      {resume.education.school && (
        <div className="mb-4">
          <h3 className="mb-2 border-b border-border pb-1 text-sm font-medium text-brand">教育背景</h3>
          <p className="text-sm text-[#666]">
            {resume.education.school} | {resume.education.degree} | {resume.education.period}
          </p>
        </div>
      )}
    </V20Card>
  );
}

export function FinalResumeStep() {
  const store = useResumeWizard();
  const resume = store.analysisResult?.finalResume;

  return (
    <div>
      <SectionTitle title="最终简历" description="AI 优化后的完整简历，可选择模板美化" />
      {resume ? (
        <>
          <FinalResumeView resume={resume} />
          <TemplateBeautify resume={resume} />
        </>
      ) : (
        <V20Empty>暂无最终简历数据</V20Empty>
      )}
      <StepNav>
        <V20Button variant="ghost" onClick={store.goPrev}>
          ← 上一步
        </V20Button>
        <V20Button onClick={store.goNext}>下一步：面试准备 →</V20Button>
      </StepNav>
    </div>
  );
}

export function InterviewStep() {
  const store = useResumeWizard();
  const prep = store.analysisResult?.interviewPrep;

  return (
    <div>
      <SectionTitle title="面试准备" description="基于优化后的简历，AI 为你生成面试预演内容" />
      {prep ? (
        <div className="space-y-4">
          <V20Card>
            <h3 className="mb-2 text-[14px] font-medium text-[#222]">自我介绍（1-2 分钟版本）</h3>
            <p className="text-sm leading-relaxed text-[#666]">{prep.selfIntroduction}</p>
          </V20Card>
          <V20Card>
            <h3 className="mb-4 text-[14px] font-medium text-[#222]">可能被问到的 10 个面试问题</h3>
            <div className="space-y-3">
              {prep.likelyQuestions.map((q, idx) => (
                <div key={idx} className="rounded-[6px] border border-border p-4">
                  <p className="mb-2 text-sm font-medium text-[#222]">
                    <span className="text-brand">Q{idx + 1}.</span> {q.question}
                  </p>
                  <p className="mb-2 text-sm text-[#666]">{q.suggestedAnswer}</p>
                  {q.evidenceNeeded.length > 0 && (
                    <div>
                      <span className="text-xs font-medium text-brand">需准备证据：</span>
                      <span className="text-xs text-[#666]">{q.evidenceNeeded.join("；")}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </V20Card>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <V20Card>
              <ListSection title="需要准备的证据" items={prep.evidenceToPrepare} />
            </V20Card>
            <V20Card>
              <ListSection title="可能的夸大点" items={prep.possibleExaggerations} />
            </V20Card>
            <V20Card>
              <ListSection title="需要补充的数据" items={prep.dataToSupplement} />
            </V20Card>
          </div>
        </div>
      ) : (
        <V20Empty>暂无面试准备数据</V20Empty>
      )}
      <StepNav>
        <V20Button variant="ghost" onClick={store.goPrev}>
          ← 上一步
        </V20Button>
        <V20Button onClick={store.goNext}>下一步：导出 →</V20Button>
      </StepNav>
    </div>
  );
}

export function ExportStep() {
  const store = useResumeWizard();
  const router = useRouter();
  const resume = store.analysisResult?.finalResume;
  const diagnosis = store.analysisResult?.diagnosis;
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [savedLocal, setSavedLocal] = useState(false);
  const [goingPredict, setGoingPredict] = useState(false);

  const resumeText = resume ? formatResumeAsText(resume) : "";
  const fileBase = resume
    ? `${resume.personalInfo?.name || "简历"}-${resume.jobIntent || store.userInput.targetRole || "求职"}`
    : "优化简历";

  const handleCopy = async () => {
    if (!resumeText) return;
    const ok = await copyToClipboard(resumeText);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const exportWord = () => {
    if (!resumeText) return;
    const body = `<pre style="font-family:Segoe UI,Microsoft YaHei,sans-serif;font-size:12pt;line-height:1.6;white-space:pre-wrap;">${resumeText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</pre>`;
    const blob = new Blob(["\ufeff" + wrapHtml(fileBase, body)], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileBase}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    if (!resumeText) return;
    const body = `<pre style="font-family:Segoe UI,Microsoft YaHei,sans-serif;font-size:12pt;line-height:1.6;white-space:pre-wrap;padding:24px;">${resumeText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</pre>`;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(wrapHtml(fileBase, body));
    win.document.close();
    setTimeout(() => {
      win.focus();
      win.print();
    }, 400);
  };

  const saveLocal = async () => {
    if (!resume || !resumeText) return;
    await resumeRepo.create({
      title: `${fileBase}（JD优化）`,
      rawContent: resumeText,
      optimizedContent: resumeText,
    });
    if (store.userInput.jobDescription.trim()) {
      await jdRepo.create({
        title: `${store.userInput.targetRole || "目标岗位"} JD`,
        company: store.userInput.companyType || undefined,
        rawContent: store.userInput.jobDescription,
      });
    }
    setSavedLocal(true);
  };

  const goInterviewPredict = async () => {
    if (!resume || !resumeText) return;
    setGoingPredict(true);
    try {
      if (!savedLocal) await saveLocal();
      savePredictHandoff({
        resumeText,
        jdText: store.userInput.jobDescription || undefined,
        position: store.userInput.targetRole || resume.jobIntent || undefined,
        company: store.userInput.companyType || undefined,
        source: "jd-analysis",
      });
      router.push("/tools/interview-predict");
    } finally {
      setGoingPredict(false);
    }
  };

  const scoreColor =
    diagnosis && diagnosis.overallScore >= 70
      ? "text-green-600"
      : diagnosis && diagnosis.overallScore >= 50
        ? "text-amber-600"
        : "text-red-600";

  return (
    <div>
      <SectionTitle title="导出与下一步" description="导出优化简历，或带着这份材料继续面试押题" />
      {resume ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <V20Card className="flex flex-col p-5">
              <h3 className="mb-1 text-sm font-medium text-text-primary">导出 Word</h3>
              <p className="mb-3 flex-1 text-xs text-text-secondary">下载可编辑的 .doc 文件</p>
              <V20Button onClick={exportWord}>下载 Word</V20Button>
            </V20Card>
            <V20Card className="flex flex-col p-5">
              <h3 className="mb-1 text-sm font-medium text-text-primary">导出 PDF</h3>
              <p className="mb-3 flex-1 text-xs text-text-secondary">打开打印对话框另存为 PDF</p>
              <V20Button onClick={exportPdf}>导出 PDF</V20Button>
            </V20Card>
            <V20Card className="flex flex-col p-5">
              <h3 className="mb-1 text-sm font-medium text-text-primary">复制文本</h3>
              <p className="mb-3 flex-1 text-xs text-text-secondary">复制到剪贴板，方便粘贴投递</p>
              <V20Button variant="outline" onClick={() => void handleCopy()}>
                {copied ? "已复制！" : "复制到剪贴板"}
              </V20Button>
            </V20Card>
            <V20Card className="flex flex-col p-5">
              <h3 className="mb-1 text-sm font-medium text-text-primary">预览简历</h3>
              <p className="mb-3 flex-1 text-xs text-text-secondary">弹窗查看优化后的完整内容</p>
              <V20Button variant="outline" onClick={() => setShowPreview(true)}>
                预览简历
              </V20Button>
            </V20Card>
          </div>

          <V20Card className="border-brand/20 bg-brand/5 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-text-primary">继续面试押题</h3>
                <p className="mt-1 text-xs text-text-secondary">
                  自动带上这份优化简历
                  {store.userInput.jobDescription ? "和目标 JD" : ""}
                  ，进入押题生成高频面试题
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <V20Button variant="ghost" disabled={savedLocal} onClick={() => void saveLocal()}>
                  {savedLocal ? "已保存到本地" : "保存到本地库"}
                </V20Button>
                <V20Button disabled={goingPredict} onClick={() => void goInterviewPredict()}>
                  {goingPredict ? "跳转中..." : "带着简历去押题 →"}
                </V20Button>
              </div>
            </div>
          </V20Card>

          <V20Card>
            <h3 className="mb-3 text-sm font-medium text-text-primary">分析摘要</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className={cn("text-2xl font-bold", scoreColor)}>{diagnosis?.overallScore}</p>
                <p className="text-xs text-text-secondary">匹配度评分</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-brand">{store.analysisResult?.matchItems.length ?? 0}</p>
                <p className="text-xs text-text-secondary">匹配项数</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-brand">{store.analysisResult?.optimizedItems.length ?? 0}</p>
                <p className="text-xs text-text-secondary">优化项数</p>
              </div>
            </div>
          </V20Card>
        </div>
      ) : (
        <V20Empty>暂无导出数据</V20Empty>
      )}

      {showPreview && resume && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-[8px] bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-medium">优化简历预览</h2>
              <V20Button variant="ghost" onClick={() => setShowPreview(false)}>
                关闭
              </V20Button>
            </div>
            <FinalResumeView resume={resume} />
          </div>
        </div>
      )}

      <StepNav>
        <V20Button variant="ghost" onClick={store.goPrev}>
          ← 上一步
        </V20Button>
        <V20Button onClick={store.resetAll}>重新开始</V20Button>
      </StepNav>
    </div>
  );
}

export function StepContent() {
  const store = useResumeWizard();
  switch (store.currentStep) {
    case "input":
      return <InputStep />;
    case "jd-analysis":
      return <JDAnalysisStep />;
    case "diagnosis":
      return <DiagnosisStep />;
    case "match":
      return <MatchStep />;
    case "follow-up":
      return <FollowUpStep />;
    case "optimize":
      return <OptimizeStep />;
    case "final-resume":
      return <FinalResumeStep />;
    case "interview":
      return <InterviewStep />;
    case "export":
      return <ExportStep />;
    default:
      return null;
  }
}
