"use client";

import { useCallback, useRef, useState } from "react";

import { MessageInput } from "@/components/chat/message-input";
import { MessageList } from "@/components/chat/message-list";
import {
  VoiceInterviewPanel,
  type VoiceInterviewHandle,
} from "@/components/chat/voice-interview-panel";
import { cn } from "@/lib/utils";
import { wantsVoiceInterview } from "@/lib/voice-intent";
import type { NextActionSuggestion, WorkflowStep } from "@/types";

interface ChatAreaProps {
  conversationId: string | null;
  messages: Parameters<typeof MessageList>[0]["messages"];
  streamingContent: string;
  workflowSteps?: WorkflowStep[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  currentIntent?: string | null;
  nextAction?: NextActionSuggestion | null;
  onSend: (message: string) => void;
  onDismissNextAction?: () => void;
  onUploadAnalyzed?: () => void;
  onUploadStart?: (kind: "resume" | "jd") => void;
  onUploadFinish?: (ok: boolean) => void;
  onCreateConversation?: () => Promise<void>;
}

export function ChatArea({
  conversationId,
  messages,
  streamingContent,
  workflowSteps,
  isLoading,
  isStreaming,
  error,
  currentIntent,
  nextAction,
  onSend,
  onDismissNextAction,
  onUploadAnalyzed,
  onUploadStart,
  onUploadFinish,
  onCreateConversation,
}: ChatAreaProps) {
  const voiceRef = useRef<VoiceInterviewHandle>(null);
  const [voiceInCall, setVoiceInCall] = useState(false);
  const [voiceStatusLabel, setVoiceStatusLabel] = useState<string | undefined>();

  const onCallStateChange = useCallback(
    (state: { inCall: boolean; phase: string; elapsed: number; question: string }) => {
      setVoiceInCall(state.inCall);
      if (!state.inCall) {
        setVoiceStatusLabel(undefined);
        return;
      }
      const tip =
        state.phase === "listening"
          ? "结束通话"
          : state.phase === "speaking"
            ? "面试官提问中"
            : state.phase === "processing"
              ? "思考中…"
              : "结束通话";
      setVoiceStatusLabel(tip);
    },
    [],
  );

  /** Voice starters / chips / typed intent → open mic UI, not text interview. */
  const handleSend = useCallback(
    (msg: string) => {
      if (wantsVoiceInterview(msg)) {
        voiceRef.current?.start();
        return;
      }
      onSend(msg);
    },
    [onSend],
  );

  if (!conversationId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
        <div className="max-w-md space-y-2">
          <p className="font-[family-name:var(--font-quote)] text-[1.55rem] font-medium tracking-[0.02em] text-foreground/90">
            从一次对话开始
          </p>
          <p className="text-[0.95rem] leading-7 text-foreground/55">
            先新建对话，再告诉我目标岗位、卡点，或从画像 / JD / 面试任一步切入。
          </p>
        </div>
        {onCreateConversation && (
          <button
            type="button"
            onClick={() => void onCreateConversation()}
            className={cn(
              "rounded-xl px-5 py-2.5 text-sm font-medium text-foreground",
              "border border-[color:var(--season-border)] bg-[color:var(--season-panel)]/80",
              "transition-colors hover:border-[color:var(--season-accent)]/45 hover:bg-[color:var(--season-panel)]",
            )}
          >
            新建对话
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {error && (
        <div className="mx-4 mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <MessageList
        messages={messages}
        streamingContent={streamingContent}
        workflowSteps={workflowSteps}
        isLoading={isLoading}
        isStreaming={isStreaming}
        currentIntent={currentIntent}
        nextAction={nextAction}
        onSend={handleSend}
        onFollowUpSelect={() => onDismissNextAction?.()}
      />
      <VoiceInterviewPanel
        ref={voiceRef}
        conversationId={conversationId}
        disabled={isStreaming}
        onCompleted={() => onUploadAnalyzed?.()}
        onCallStateChange={onCallStateChange}
      />
      <MessageInput
        conversationId={conversationId}
        onSend={handleSend}
        onUploadAnalyzed={onUploadAnalyzed}
        onUploadStart={onUploadStart}
        onUploadFinish={onUploadFinish}
        disabled={isStreaming}
        voiceInCall={voiceInCall}
        voiceStatusLabel={voiceStatusLabel}
        onStartVoiceCall={() => voiceRef.current?.start()}
        onEndVoiceCall={() => voiceRef.current?.end()}
      />
    </div>
  );
}
