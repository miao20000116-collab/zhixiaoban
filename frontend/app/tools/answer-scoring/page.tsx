"use client";

import { useEffect, useMemo, useState } from "react";

import { HistoryListItem } from "@/components/tools/history-list-item";
import { V20Button, V20Card, V20Empty, V20Input, V20PageHeader, V20Select, V20Spinner, V20Textarea } from "@/components/tools/v20-ui";
import { useAIDirect } from "@/hooks/use-ai-direct";
import { answerScoreRepo, parseQaPairs, scriptRepo, type AnswerScoreRecord, type ScriptRecord } from "@/lib/local-db";
import { toolPrompts } from "@/lib/tool-prompts";

export default function AnswerScoringPage() {
  const ai = useAIDirect();
  const [question, setQuestion] = useState("");
  const [userAnswer, setUserAnswer] = useState("");
  const [referenceAnswer, setReferenceAnswer] = useState("");
  const [result, setResult] = useState("");
  const [scores, setScores] = useState<AnswerScoreRecord[]>([]);
  const [scripts, setScripts] = useState<ScriptRecord[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [scriptId, setScriptId] = useState<number | "">("");
  const [qaIndex, setQaIndex] = useState<number | "">("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    void Promise.all([answerScoreRepo.list(), scriptRepo.list()]).then(([scoreList, scriptList]) => {
      setScores(scoreList);
      setScripts(scriptList);
    });
  }, []);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2000);
  };

  const qaOptions = useMemo(() => {
    const script = scripts.find((item) => item.id === scriptId);
    return parseQaPairs(script?.qaPairs);
  }, [scriptId, scripts]);

  const loadQa = () => {
    if (qaIndex === "") return;
    const target = qaOptions[Number(qaIndex)];
    if (!target) return;
    setQuestion(target.question || target.title || "");
    setReferenceAnswer(target.optimizedAnswer || target.answer || "");
  };

  const score = async () => {
    if (!question.trim() || !userAnswer.trim()) return;
    setResult("");
    const response = await ai.send(
      [
        { role: "system", content: toolPrompts.answerScoring },
        { role: "user", content: `面试问题: ${question}\n你的回答: ${userAnswer}${referenceAnswer ? `\n参考回答: ${referenceAnswer}` : ""}` },
      ],
      { temperature: 0.5, task: "score" },
    );
    setResult(response.content);
  };

  const saveScore = async () => {
    if (!result.trim()) return;
    await answerScoreRepo.create({
      scriptId: scriptId === "" ? undefined : Number(scriptId),
      question,
      userAnswer,
      referenceAnswer: referenceAnswer || undefined,
      feedback: result,
    });
    setScores(await answerScoreRepo.list());
    flash("评分已保存");
  };

  return (
    <div>
      <V20PageHeader
        title="答题打分"
        extra={
          scores.length > 0 ? (
            <button type="button" className="text-sm text-brand hover:text-brand-hover" onClick={() => setShowSaved((v) => !v)}>
              {showSaved ? "收起历史" : `历史记录 (${scores.length})`}
            </button>
          ) : null
        }
      />

      {toast && <div className="mb-3 rounded-[6px] border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">{toast}</div>}

      {showSaved && scores.length > 0 && (
        <div className="mb-4 space-y-2">
          {scores.map((item) => (
            <HistoryListItem
              key={item.id}
              title={item.question}
              preview={(item.userAnswer || "").slice(0, 80)}
              subtitle={new Date(item.createdAt).toLocaleString("zh-CN")}
              onOpen={() => {
                setQuestion(item.question);
                setUserAnswer(item.userAnswer);
                setReferenceAnswer(item.referenceAnswer || "");
                setResult(item.feedback || "");
                setShowSaved(false);
              }}
              onRename={async (nextTitle) => {
                if (item.id == null) return;
                await answerScoreRepo.update(item.id, { question: nextTitle });
                setScores(await answerScoreRepo.list());
                flash("已重命名");
              }}
              onDelete={async () => {
                if (item.id == null) return;
                await answerScoreRepo.remove(item.id);
                setScores(await answerScoreRepo.list());
                flash("已删除");
              }}
            />
          ))}
        </div>
      )}

      {scripts.length > 0 && (
        <V20Card className="mb-4">
          <h2 className="mb-3 text-[18px] font-medium text-text-primary">从逐字稿导入</h2>
          <div className="flex gap-3">
            <V20Select value={scriptId} onChange={(e) => setScriptId(e.target.value ? Number(e.target.value) : "")} className="flex-1">
              <option value="">— 选择逐字稿 —</option>
              {scripts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </V20Select>
            <V20Input
              type="number"
              min={0}
              value={qaIndex}
              onChange={(e) => setQaIndex(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-20"
              placeholder="序号"
            />
            <V20Button variant="outline" disabled={scriptId === "" || qaIndex === ""} onClick={loadQa}>
              加载
            </V20Button>
          </div>
        </V20Card>
      )}

      <V20Card className="mb-4">
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-text-primary">面试问题</label>
          <V20Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="输入面试问题" />
        </div>
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-text-primary">参考回答（选填）</label>
          <V20Textarea value={referenceAnswer} onChange={(e) => setReferenceAnswer(e.target.value)} className="min-h-[100px]" placeholder="粘贴参考回答..." />
        </div>
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-text-primary">你的回答</label>
          <V20Textarea value={userAnswer} onChange={(e) => setUserAnswer(e.target.value)} className="min-h-[200px]" placeholder="粘贴你的回答..." />
        </div>
        <div className="flex gap-3">
          <V20Button disabled={ai.loading || !question.trim() || !userAnswer.trim()} onClick={() => void score()}>
            {ai.loading ? "评分中..." : "开始评分"}
          </V20Button>
          <V20Button
            variant="outline"
            onClick={() => {
              setQuestion("");
              setUserAnswer("");
              setReferenceAnswer("");
              setResult("");
            }}
          >
            清空
          </V20Button>
        </div>
      </V20Card>

      <V20Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[18px] font-medium text-text-primary">评分结果</h2>
          {result && <V20Button onClick={() => void saveScore()}>保存评分</V20Button>}
        </div>
        {ai.loading ? (
          <V20Spinner label="AI 评分中..." />
        ) : ai.error ? (
          <p className="py-8 text-center text-sm text-red-500">{ai.error}</p>
        ) : result ? (
          <div className="whitespace-pre-wrap text-[14px] leading-relaxed text-text-primary">{result}</div>
        ) : (
          <V20Empty icon="⭐">输入问题及答案后点击「开始评分」</V20Empty>
        )}
      </V20Card>
    </div>
  );
}
