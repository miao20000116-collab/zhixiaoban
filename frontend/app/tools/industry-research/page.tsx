"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { HistoryListItem } from "@/components/tools/history-list-item";
import { V20Button, V20Card, V20Empty, V20Input, V20PageHeader, V20Spinner } from "@/components/tools/v20-ui";
import { useAIDirect } from "@/hooks/use-ai-direct";
import { industryResearchRepo, type IndustryResearchRecord } from "@/lib/local-db";
import { toolPrompts } from "@/lib/tool-prompts";
import { API_URL, jsonHeaders } from "@/services/api";

export default function IndustryResearchPage() {
  const ai = useAIDirect();
  const [company, setCompany] = useState("");
  const [industry, setIndustry] = useState("");
  const [webSearch, setWebSearch] = useState(false);
  const [history, setHistory] = useState<IndustryResearchRecord[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    void industryResearchRepo.list().then(setHistory);
  }, []);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2500);
  };

  const loadReport = (report: IndustryResearchRecord) => {
    ai.loadContent(report.content);
    setCompany(report.company);
    setIndustry(report.industry || "");
    setSavedId(report.id ?? null);
    setShowSaved(false);
  };

  const research = async () => {
    if (!company.trim() && !industry.trim()) return;
    setSavedId(null);
    ai.reset();
    const query = company.trim() || industry.trim();

    let searchContext = "";
    if (webSearch) {
      try {
        const response = await fetch(`${API_URL}/api/tools/search`, {
          method: "POST",
          headers: jsonHeaders(),
          body: JSON.stringify({ company: company.trim(), industry: industry.trim() }),
        });
        if (response.ok) {
          const data = (await response.json()) as { context: string; source_count: number };
          if (data.context) searchContext = data.context;
        }
      } catch {
        // 联网失败时仍继续 AI 调研
      }
    }

    const searchHint = webSearch
      ? searchContext
        ? `\n\n可参考以下联网摘录（有冲突以更可信信息为准，不确定请标明）：\n${searchContext}`
        : "\n\n联网未返回有效摘录，请基于公开常识作答，并标出不确定处。"
      : "";

    await ai.send(
      [
        {
          role: "system",
          content: toolPrompts.industryResearch + searchHint,
        },
        {
          role: "user",
          content: `请调研：${query}${industry.trim() ? `（行业：${industry.trim()}）` : ""}${
            company.trim() && industry.trim() && company.trim() !== industry.trim()
              ? `\n公司/产品名：${company.trim()}`
              : ""
          }\n\n直接给面试可用的调研笔记，不要寒暄。`,
        },
      ],
      { temperature: 0.65, max_tokens: 3500, task: "research" },
    );
  };

  const saveReport = async () => {
    if (!ai.content.trim()) return;
    try {
      const id = await industryResearchRepo.create({
        company: company || industry || "未命名调研",
        industry: industry || undefined,
        content: ai.content,
        sourceUrls: [],
      });
      const list = await industryResearchRepo.list();
      setHistory(list);
      setSavedId(typeof id === "number" ? id : list[0]?.id ?? null);
      flash("已保存到历史记录");
    } catch {
      flash("保存失败，请稍后重试");
    }
  };

  const clearAll = () => {
    setCompany("");
    setIndustry("");
    setSavedId(null);
    ai.reset();
  };

  return (
    <div>
      <V20PageHeader
        title="行业调研"
        description="快速摸清公司与行业，产出面试能用的观点和反问"
        extra={
          history.length > 0 ? (
            <button type="button" className="text-sm text-brand hover:text-brand-hover" onClick={() => setShowSaved((v) => !v)}>
              {showSaved ? "收起历史" : `历史记录 (${history.length})`}
            </button>
          ) : null
        }
      />

      {toast && (
        <div className="mb-3 rounded-[6px] border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">{toast}</div>
      )}

      {showSaved && history.length > 0 && (
        <div className="mb-4 space-y-2">
          {history.map((report) => (
            <HistoryListItem
              key={report.id}
              title={`${report.company}${report.industry ? ` · ${report.industry}` : ""}`}
              preview={report.content.replace(/\s+/g, " ").slice(0, 120)}
              subtitle={new Date(report.createdAt).toLocaleString("zh-CN")}
              onOpen={() => loadReport(report)}
              onRename={async (nextTitle) => {
                if (report.id == null) return;
                const [companyPart, ...rest] = nextTitle.split("·").map((s) => s.trim());
                await industryResearchRepo.update(report.id, {
                  company: companyPart || nextTitle,
                  industry: rest.length ? rest.join(" · ") : report.industry,
                });
                setHistory(await industryResearchRepo.list());
                if (savedId === report.id) setCompany(companyPart || nextTitle);
                flash("已重命名");
              }}
              onDelete={async () => {
                if (report.id == null) return;
                await industryResearchRepo.remove(report.id);
                const list = await industryResearchRepo.list();
                setHistory(list);
                if (savedId === report.id) {
                  setSavedId(null);
                  ai.reset();
                }
                flash("已删除");
              }}
            />
          ))}
        </div>
      )}

      <V20Card className="mb-4">
        <div className="mb-3">
          <label className="mb-2 block text-sm font-medium text-text-primary">公司/行业名称</label>
          <V20Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="输入公司名，如：字节跳动、美团" />
        </div>
        <div className="mb-3">
          <label className="mb-2 block text-sm font-medium text-text-primary">行业分类（选填）</label>
          <V20Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="如：AI大模型、电子商务、企业服务" />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <V20Button disabled={ai.loading || (!company.trim() && !industry.trim())} onClick={() => void research()}>
            {ai.loading ? "调研中..." : "开始调研"}
          </V20Button>
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={webSearch} onChange={(e) => setWebSearch(e.target.checked)} className="h-4 w-4 rounded border-border text-brand" />
            联网搜索（获取最新信息）
          </label>
          <V20Button variant="outline" onClick={clearAll}>
            清空
          </V20Button>
        </div>
      </V20Card>

      <V20Card>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-[18px] font-medium text-text-primary">调研笔记</h2>
            <p className="mt-0.5 text-xs text-text-secondary">
              {savedId ? "已载入历史记录，可重新调研或另存为新报告" : "偏面试可用观点，不是长篇行业白皮书"}
            </p>
          </div>
          {ai.content && !savedId ? (
            <V20Button onClick={() => void saveReport()}>保存报告</V20Button>
          ) : savedId ? (
            <span className="rounded-full bg-green-50 px-3 py-1 text-xs text-green-700">已保存</span>
          ) : null}
        </div>
        {ai.loading ? (
          <V20Spinner label={`AI 调研中${webSearch ? "（已开启联网搜索）" : ""}...`} />
        ) : ai.error ? (
          <div className="py-8 text-center text-sm">
            <p className="text-red-500">{ai.error}</p>
            <p className="mt-2 text-text-secondary">可稍后重试，或在「设置」页配置浏览器 API Key。</p>
          </div>
        ) : ai.content ? (
          <div className="max-w-none text-[14px] leading-[1.75] text-text-primary">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h1 className="mb-3 mt-1 text-[18px] font-semibold text-text-primary">{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="mb-2 mt-6 border-b border-border/70 pb-1.5 text-[15px] font-semibold text-text-primary first:mt-0">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="mb-1.5 mt-4 text-[14px] font-medium text-text-primary">{children}</h3>
                ),
                h4: ({ children }) => (
                  <h4 className="mb-1 mt-3 text-[13px] font-medium text-text-primary">{children}</h4>
                ),
                p: ({ children }) => <p className="mb-3 text-[14px] text-text-primary/90">{children}</p>,
                ul: ({ children }) => <ul className="mb-3 list-disc space-y-1.5 pl-5 text-[14px]">{children}</ul>,
                ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1.5 pl-5 text-[14px]">{children}</ol>,
                li: ({ children }) => <li className="leading-relaxed text-text-primary/90">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold text-text-primary">{children}</strong>,
                a: ({ href, children }) => (
                  <a href={href} className="text-brand underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
                    {children}
                  </a>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="mb-3 border-l-2 border-brand/40 bg-page-bg/80 px-3 py-2 text-[13px] text-text-secondary">
                    {children}
                  </blockquote>
                ),
              }}
            >
              {ai.content}
            </ReactMarkdown>
          </div>
        ) : (
          <V20Empty>输入公司名后点击「开始调研」</V20Empty>
        )}
      </V20Card>
    </div>
  );
}
