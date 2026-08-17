"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { CheckCircle2, FileText, Loader2, Paperclip, Phone, PhoneOff, X } from "lucide-react";

import { ApiError } from "@/services/api";
import { analyzeJobUpload } from "@/services/job";
import { parseResumeUpload } from "@/services/resume";
import { cn } from "@/lib/utils";

type UploadKind = "jd" | "resume";
type UploadPhase = "idle" | "reading" | "analyzing" | "done" | "error";

interface MessageInputProps {
  conversationId: string | null;
  onSend: (message: string) => void;
  onUploadAnalyzed?: () => void;
  onUploadStart?: (kind: "resume" | "jd") => void;
  onUploadFinish?: (ok: boolean) => void;
  disabled?: boolean;
  /** Start one-to-one voice interview (next to JD / 简历). */
  onStartVoiceCall?: () => void;
  onEndVoiceCall?: () => void;
  voiceInCall?: boolean;
  voiceStatusLabel?: string;
}

const PHASE_COPY: Record<Exclude<UploadPhase, "idle">, string> = {
  reading: "正在读取文件…",
  analyzing: "正在分析，请稍候…",
  done: "处理完成，结果已写入对话",
  error: "处理失败",
};

export function MessageInput({
  conversationId,
  onSend,
  onUploadAnalyzed,
  onUploadStart,
  onUploadFinish,
  disabled,
  onStartVoiceCall,
  onEndVoiceCall,
  voiceInCall = false,
  voiceStatusLabel,
}: MessageInputProps) {
  const jdFileRef = useRef<HTMLInputElement>(null);
  const resumeFileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [kind, setKind] = useState<UploadKind | null>(null);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const busy = phase === "reading" || phase === "analyzing";

  useEffect(() => {
    if (phase !== "done") return;
    const t = window.setTimeout(() => {
      setPhase("idle");
      setKind(null);
      setFileName(null);
      setMessage(null);
    }, 4500);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    // 先藏滚动条再量高，避免 Windows 下「高度差 1px 就出滚动条」
    el.style.overflowY = "hidden";
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, 160);
    el.style.height = `${next}px`;
    if (el.scrollHeight > 160) {
      el.style.overflowY = "auto";
    }
  }, [draft]);

  const sendDraft = () => {
    const value = draft.trim();
    if (!value || disabled || busy) return;
    onSend(value);
    setDraft("");
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    sendDraft();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 发送；Shift+Enter 换行（不展示快捷键说明）
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      sendDraft();
    }
  };

  const runResume = async (file: File, note?: string) => {
    setKind("resume");
    setFileName(file.name);
    setPhase("reading");
    setMessage(note ?? `已选择简历：${file.name}`);
    onUploadStart?.("resume");
    setPhase("analyzing");
    setMessage("正在解析简历并写入职业画像…");
    try {
      await parseResumeUpload(file, {
        conversation_id: conversationId ?? undefined,
      });
      onUploadFinish?.(true);
      setPhase("done");
      setMessage("简历解析完成，可在右侧画像与对话中查看结果。");
      onUploadAnalyzed?.();
    } catch (err) {
      onUploadFinish?.(false);
      throw err;
    }
  };

  const runJd = async (file: File) => {
    setKind("jd");
    setFileName(file.name);
    setPhase("reading");
    setMessage(`已选择 JD：${file.name}`);
    onUploadStart?.("jd");
    setPhase("analyzing");
    setMessage("正在分析岗位 JD…");
    try {
      await analyzeJobUpload(file, { conversation_id: conversationId ?? undefined });
      onUploadFinish?.(true);
      setPhase("done");
      setMessage("JD 分析完成，结果已写入对话。");
      onUploadAnalyzed?.();
    } catch (err) {
      onUploadFinish?.(false);
      throw err;
    }
  };

  const handleJdFile = async (file: File | undefined) => {
    if (!file || !conversationId || disabled || busy) return;
    try {
      await runJd(file);
    } catch (err) {
      if (err instanceof ApiError && err.code === "LOOKS_LIKE_RESUME") {
        try {
          setMessage("检测到这是简历，已自动改为简历解析…");
          await runResume(file, "检测到简历内容，已切换到简历解析");
          return;
        } catch (resumeErr) {
          setPhase("error");
          setKind("resume");
          setMessage(
            resumeErr instanceof Error ? resumeErr.message : "已识别为简历，但解析失败",
          );
          return;
        }
      }
      setPhase("error");
      setKind("jd");
      setFileName(file.name);
      setMessage(err instanceof Error ? err.message : "JD 上传分析失败");
    } finally {
      if (jdFileRef.current) jdFileRef.current.value = "";
    }
  };

  const handleResumeFile = async (file: File | undefined) => {
    if (!file || !conversationId || disabled || busy) return;
    try {
      await runResume(file);
    } catch (err) {
      setPhase("error");
      setKind("resume");
      setFileName(file.name);
      setMessage(err instanceof Error ? err.message : "简历上传失败");
    } finally {
      if (resumeFileRef.current) resumeFileRef.current.value = "";
    }
  };

  const clearStatus = () => {
    setPhase("idle");
    setKind(null);
    setFileName(null);
    setMessage(null);
  };

  return (
    <div className="border-t border-[color:var(--season-border)] bg-[color:var(--season-panel)]/55 px-3 py-3 backdrop-blur-sm sm:px-4">
      {phase !== "idle" && (
        <div
          className={cn(
            "mb-2.5 flex items-start gap-3 rounded-xl border px-3.5 py-2.5 text-xs",
            phase === "error"
              ? "border-destructive/20 bg-destructive/8 text-destructive"
              : phase === "done"
                ? "border-primary/15 bg-primary/5 text-foreground"
                : "border-[color:var(--season-border)] bg-[color:var(--season-panel)] text-foreground",
          )}
        >
          <div className="mt-0.5 shrink-0">
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : phase === "done" ? (
              <CheckCircle2 className="h-4 w-4 text-primary" />
            ) : (
              <X className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-background/80 px-2 py-0.5 text-[11px] font-medium">
                {kind === "resume" ? "简历" : kind === "jd" ? "岗位 JD" : "文件"}
              </span>
              {fileName && (
                <span className="truncate text-muted-foreground" title={fileName}>
                  {fileName}
                </span>
              )}
              <span className="text-muted-foreground">·</span>
              <span>{PHASE_COPY[phase]}</span>
            </div>
            {message && <p className="leading-relaxed text-[12px] opacity-90">{message}</p>}
            {busy && (
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-2/3 animate-pulse rounded-full bg-primary/60" />
              </div>
            )}
          </div>
          {(phase === "done" || phase === "error") && (
            <button
              type="button"
              onClick={clearStatus}
              className="shrink-0 text-[11px] text-muted-foreground underline"
            >
              关闭
            </button>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <input
          ref={jdFileRef}
          type="file"
          accept=".txt,.md,.markdown,.pdf,.docx,.csv"
          className="hidden"
          onChange={(e) => void handleJdFile(e.target.files?.[0])}
        />
        <input
          ref={resumeFileRef}
          type="file"
          accept=".txt,.md,.markdown,.pdf,.docx"
          className="hidden"
          onChange={(e) => void handleResumeFile(e.target.files?.[0])}
        />

        {/* 一体式输入壳：工具 / 文本 / 发送同属一块，不再三块高度错位 */}
        <div
          className={cn(
            "composer-shell rounded-2xl border transition-[box-shadow,border-color]",
            "focus-within:border-[color:var(--season-accent)]/45 focus-within:shadow-[0_12px_32px_color-mix(in_srgb,var(--foreground)_7%,transparent)]",
          )}
        >
          <textarea
            ref={textRef}
            name="message"
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="直接说你的问题，或先上传 JD / 简历…"
            disabled={disabled || busy}
            className="max-h-40 min-h-[44px] w-full resize-none overflow-hidden bg-transparent px-4 pb-2 pt-3.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/75 disabled:opacity-50"
          />

          <div className="flex items-center gap-2 px-2.5 pb-2.5 pt-0.5">
            <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
              <button
                type="button"
                disabled={disabled || busy || !conversationId || voiceInCall}
                title="上传岗位 JD"
                onClick={() => jdFileRef.current?.click()}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] text-muted-foreground transition-colors",
                  "hover:bg-[color:var(--season-pop)]/70 hover:text-[color:var(--season-pop-fg)]",
                  "disabled:pointer-events-none disabled:opacity-45",
                )}
              >
                {busy && kind === "jd" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Paperclip className="h-3.5 w-3.5" />
                )}
                JD
              </button>
              <button
                type="button"
                disabled={disabled || busy || !conversationId || voiceInCall}
                title="上传简历"
                onClick={() => resumeFileRef.current?.click()}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] text-muted-foreground transition-colors",
                  "hover:bg-[color:var(--season-pop)]/70 hover:text-[color:var(--season-pop-fg)]",
                  "disabled:pointer-events-none disabled:opacity-45",
                )}
              >
                {busy && kind === "resume" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileText className="h-3.5 w-3.5" />
                )}
                简历
              </button>
              {onStartVoiceCall &&
                (voiceInCall ? (
                  <button
                    type="button"
                    onClick={onEndVoiceCall}
                    title="结束语音面试"
                    className={cn(
                      "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition-colors",
                      "bg-rose-500/15 text-rose-600 hover:bg-rose-500/25",
                    )}
                  >
                    <PhoneOff className="h-3.5 w-3.5" />
                    {voiceStatusLabel || "结束通话"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={disabled || busy || !conversationId}
                    title="一对一语音模拟面试"
                    onClick={onStartVoiceCall}
                    className={cn(
                      "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] text-muted-foreground transition-colors",
                      "hover:bg-emerald-500/15 hover:text-emerald-700",
                      "disabled:pointer-events-none disabled:opacity-45",
                    )}
                  >
                    <Phone className="h-3.5 w-3.5" />
                    语音面试
                  </button>
                ))}
            </div>

            <button
              type="submit"
              disabled={disabled || busy || !draft.trim() || voiceInCall}
              className={cn(
                "inline-flex h-8 shrink-0 items-center justify-center rounded-full px-4 text-[13px] font-medium transition-all",
                "bg-[color:var(--season-accent)] text-[color:var(--season-accent-fg)] shadow-sm",
                "hover:brightness-[1.05] disabled:pointer-events-none disabled:opacity-40",
              )}
            >
              发送
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
