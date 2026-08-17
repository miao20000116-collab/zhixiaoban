"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Loader2, Phone, PhoneOff, X } from "lucide-react";

import { endInterview } from "@/services/interview";
import {
  preloadSpeechAudio,
  resolveVoicePlaybackUrl,
  startVoiceInterview,
  submitVoiceAnswer,
  type VoiceAnswerResponse,
} from "@/services/voice";
import { cn } from "@/lib/utils";

type CallPhase =
  | "idle"
  | "connecting"
  | "speaking"
  | "listening"
  | "processing"
  | "ending"
  | "ended";

export type VoiceInterviewHandle = {
  start: () => void;
  end: () => void;
  isInCall: () => boolean;
};

interface VoiceInterviewPanelProps {
  conversationId: string | null;
  onCompleted?: (markdown: string) => void;
  disabled?: boolean;
  /** Fired when call activity changes — for composer status chip. */
  onCallStateChange?: (state: {
    inCall: boolean;
    phase: CallPhase;
    elapsed: number;
    question: string;
  }) => void;
}

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: Event & { results: SpeechRecognitionResultList }) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognition;

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ].find((t) => MediaRecorder.isTypeSupported(t));
}

function micUnsupportedMessage(): string {
  const secure =
    typeof window !== "undefined" &&
    (window.isSecureContext || location.hostname === "localhost");
  if (!secure) {
    return "当前页面不是安全环境，无法打开麦克风。请用 http://localhost:3001 在 Chrome / Edge 打开。";
  }
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return "当前窗口不支持麦克风。请用系统浏览器打开 http://localhost:3001（不要用编辑器内置预览）。";
  }
  return "无法访问麦克风，请在浏览器地址栏允许麦克风权限后重试。";
}

function formatElapsed(s: number) {
  const m = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

const PHASE_HINT: Record<CallPhase, string> = {
  idle: "",
  connecting: "正在接通面试官…",
  speaking: "面试官正在提问",
  listening: "轮到你了，直接说即可",
  processing: "面试官思考中…",
  ending: "正在生成复盘…",
  ended: "本轮已结束",
};

export const VoiceInterviewPanel = forwardRef<VoiceInterviewHandle, VoiceInterviewPanelProps>(
  function VoiceInterviewPanel(
    { conversationId, onCompleted, disabled, onCallStateChange },
    ref,
  ) {
    const [open, setOpen] = useState(false);
    const [phase, setPhase] = useState<CallPhase>("idle");
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [stage, setStage] = useState("");
    /** Current interviewer question — always shown, never replaced by status. */
    const [question, setQuestion] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [level, setLevel] = useState(0);
    const [elapsed, setElapsed] = useState(0);
    const [lastTranscript, setLastTranscript] = useState<string | null>(null);
    const [liveCaption, setLiveCaption] = useState<string>("");

    const streamRef = useRef<MediaStream | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const startedAtRef = useRef(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const analysingRef = useRef(false);
    const meterRafRef = useRef<number | null>(null);
    const vadTimerRef = useRef<number | null>(null);
    const bargeTimerRef = useRef<number | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const heardSpeechRef = useRef(false);
    const lastVoiceAtRef = useRef(0);
    const phaseRef = useRef<CallPhase>("idle");
    const callStartedAtRef = useRef<number | null>(null);
    const hangupRef = useRef(false);
    const sessionIdRef = useRef<string | null>(null);
    const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
    const liveFinalRef = useRef("");
    const startListeningRef = useRef<() => Promise<void>>(async () => undefined);
    const endCallRef = useRef<(opts?: { generateReview?: boolean }) => Promise<void>>(
      async () => undefined,
    );
    const questionRef = useRef("");

    const inCall = ["connecting", "speaking", "listening", "processing", "ending"].includes(phase);

    useEffect(() => {
      phaseRef.current = phase;
    }, [phase]);

    useEffect(() => {
      sessionIdRef.current = sessionId;
    }, [sessionId]);

    useEffect(() => {
      questionRef.current = question;
    }, [question]);

    useEffect(() => {
      onCallStateChange?.({ inCall, phase, elapsed, question });
    }, [elapsed, inCall, onCallStateChange, phase, question]);

    useEffect(() => {
      if (!open || phase === "idle" || phase === "ended") return;
      const timer = window.setInterval(() => {
        if (callStartedAtRef.current) {
          setElapsed(Math.floor((Date.now() - callStartedAtRef.current) / 1000));
        }
      }, 500);
      return () => window.clearInterval(timer);
    }, [open, phase]);

    const stopMeter = useCallback(() => {
      if (meterRafRef.current != null) {
        cancelAnimationFrame(meterRafRef.current);
        meterRafRef.current = null;
      }
      setLevel(0);
    }, []);

    const clearVad = useCallback(() => {
      if (vadTimerRef.current != null) {
        window.clearInterval(vadTimerRef.current);
        vadTimerRef.current = null;
      }
      if (bargeTimerRef.current != null) {
        window.clearInterval(bargeTimerRef.current);
        bargeTimerRef.current = null;
      }
    }, []);

    const stopPlayback = useCallback(() => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // ignore
        }
      }
      const audio = audioRef.current;
      if (audio) {
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
        audio.src = "";
        audioRef.current = null;
      }
    }, []);

    const releaseMic = useCallback(() => {
      stopMeter();
      clearVad();
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.onstop = null;
          recorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      recorderRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      void audioCtxRef.current?.close().catch(() => undefined);
      audioCtxRef.current = null;
      analyserRef.current = null;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      recognitionRef.current = null;
      liveFinalRef.current = "";
      setLiveCaption("");
    }, [clearVad, stopMeter]);

    useEffect(() => {
      return () => {
        hangupRef.current = true;
        stopPlayback();
        releaseMic();
      };
    }, [releaseMic, stopPlayback]);

    const ensureMic = useCallback(async () => {
      if (streamRef.current?.getAudioTracks().some((t) => t.readyState === "live")) {
        return streamRef.current;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(micUnsupportedMessage());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      return stream;
    }, []);

    const ensureAnalyser = useCallback(async (stream: MediaStream) => {
      if (analyserRef.current && audioCtxRef.current) return analyserRef.current;
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      return analyser;
    }, []);

    const startMeter = useCallback(
      (analyser: AnalyserNode) => {
        stopMeter();
        const data = new Uint8Array(analyser.fftSize);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i += 1) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          setLevel(Math.min(1, rms * 4));
          meterRafRef.current = requestAnimationFrame(tick);
        };
        meterRafRef.current = requestAnimationFrame(tick);
      },
      [stopMeter],
    );

    const readRms = useCallback(() => {
      const analyser = analyserRef.current;
      if (!analyser) return 0;
      const data = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      return Math.sqrt(sum / data.length);
    }, []);

    const playTts = useCallback(
      async (
        url: string | null | undefined,
        onEnded?: () => void,
        speakText?: string | null,
        playbackUrl?: string | null,
        preloadedAudio?: HTMLAudioElement | null,
      ) => {
        stopPlayback();
        clearVad();
        setPhase("speaking");

        const finish = () => {
          if (!hangupRef.current) onEnded?.();
        };

        const armBargeIn = async () => {
          try {
            const stream = await ensureMic();
            const analyser = await ensureAnalyser(stream);
            startMeter(analyser);
            let loudSince: number | null = null;
            bargeTimerRef.current = window.setInterval(() => {
              if (phaseRef.current !== "speaking" || hangupRef.current) return;
              const rms = readRms();
              if (rms > 0.06) {
                if (loudSince == null) loudSince = Date.now();
                else if (Date.now() - loudSince > 280) {
                  stopPlayback();
                  clearVad();
                  void startListeningRef.current();
                }
              } else {
                loudSince = null;
              }
            }, 80);
          } catch {
            // barge-in optional
          }
        };

        const resolvedUrl =
          playbackUrl ?? (await resolveVoicePlaybackUrl(url, speakText));

        if (resolvedUrl || preloadedAudio) {
          try {
            await armBargeIn();
            const audio =
              preloadedAudio ??
              (resolvedUrl ? await preloadSpeechAudio(resolvedUrl) : null);
            if (!audio) {
              finish();
              return;
            }
            audioRef.current = audio;
            audio.onended = () => finish();
            audio.onerror = () => finish();
            try {
              await audio.play();
            } catch {
              finish();
            }
          } catch {
            finish();
          }
          return;
        }

        // No server TTS — open mic quickly.
        window.setTimeout(finish, 450);
      },
      [clearVad, ensureAnalyser, ensureMic, readRms, startMeter, stopPlayback],
    );

    const flushRecording = useCallback(async () => {
      const sid = sessionIdRef.current;
      if (!sid || analysingRef.current || hangupRef.current) return;
      analysingRef.current = true;
      clearVad();
      stopMeter();
      setPhase("processing");

      const mime = recorderRef.current?.mimeType || "audio/webm";
      const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
      const blob = new Blob(chunksRef.current, { type: mime });
      chunksRef.current = [];
      const duration = Date.now() - startedAtRef.current;
      const liveText = liveFinalRef.current.trim();
      liveFinalRef.current = "";
      setLiveCaption("");

      if (blob.size < 800) {
        analysingRef.current = false;
        void startListeningRef.current();
        return;
      }

      try {
        const result: VoiceAnswerResponse = await submitVoiceAnswer(sid, blob, {
          duration_ms: duration,
          filename: `answer.${ext}`,
          fast: true,
          transcript: liveText || undefined,
        });
        if (hangupRef.current) return;
        setLastTranscript(result.transcript);
        setStage(result.stage);

        if (result.status === "completed" || result.review) {
          onCompleted?.(result.markdown);
          setPhase("ended");
          setQuestion("本轮面试已结束，复盘已写入对话");
          releaseMic();
          return;
        }

        const nextQ =
          result.question?.trim() ||
          result.markdown.match(/\*\*面试官：\*\*\s*([^\n]+)/)?.[1]?.trim() ||
          "请继续回答";
        const playbackUrl = await resolveVoicePlaybackUrl(result.tts_url, nextQ);
        const preloadedAudio = playbackUrl ? await preloadSpeechAudio(playbackUrl) : null;
        setQuestion(nextQ);
        onCompleted?.(result.markdown);
        await playTts(
          result.tts_url,
          () => {
            if (!hangupRef.current) void startListeningRef.current();
          },
          nextQ,
          playbackUrl,
          preloadedAudio,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "处理失败，请再说一次");
        analysingRef.current = false;
        void startListeningRef.current();
        return;
      } finally {
        analysingRef.current = false;
      }
    }, [clearVad, onCompleted, playTts, releaseMic, stopMeter]);

    const startListening = useCallback(async () => {
      if (hangupRef.current || analysingRef.current) return;
      if (phaseRef.current === "processing" || phaseRef.current === "connecting") return;
      if (phaseRef.current === "ending" || phaseRef.current === "ended") return;

      stopPlayback();
      clearVad();
      heardSpeechRef.current = false;
      lastVoiceAtRef.current = 0;
      setError(null);
      setLiveCaption("");
      liveFinalRef.current = "";

      try {
        const stream = await ensureMic();
        const analyser = await ensureAnalyser(stream);

        if (recorderRef.current && recorderRef.current.state !== "inactive") {
          try {
            recorderRef.current.onstop = null;
            recorderRef.current.stop();
          } catch {
            // ignore
          }
        }

        const mime = pickRecorderMime();
        const recorder = mime
          ? new MediaRecorder(stream, { mimeType: mime })
          : new MediaRecorder(stream);
        chunksRef.current = [];
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) chunksRef.current.push(ev.data);
        };
        recorder.onstop = () => {
          void flushRecording();
        };
        recorderRef.current = recorder;
        startedAtRef.current = Date.now();
        recorder.start(200);

        const speechCtor = (
          window as unknown as {
            SpeechRecognition?: BrowserSpeechRecognitionCtor;
            webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
          }
        ).SpeechRecognition
          || (
            window as unknown as {
              SpeechRecognition?: BrowserSpeechRecognitionCtor;
              webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
            }
          ).webkitSpeechRecognition;
        if (speechCtor) {
          try {
            const recognition = new speechCtor();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = "zh-CN";
            recognition.onresult = (event) => {
              let interim = "";
              for (let i = event.resultIndex; i < event.results.length; i += 1) {
                const text = event.results[i]?.[0]?.transcript?.trim() || "";
                if (!text) continue;
                if (event.results[i].isFinal) {
                  liveFinalRef.current = `${liveFinalRef.current} ${text}`.trim();
                } else {
                  interim += text;
                }
              }
              setLiveCaption([liveFinalRef.current, interim].filter(Boolean).join(" "));
            };
            recognition.onerror = () => {
              // realtime caption is optional
            };
            recognition.onend = () => {
              if (phaseRef.current === "listening" && !hangupRef.current) {
                try {
                  recognition.start();
                } catch {
                  // ignore
                }
              }
            };
            recognition.start();
            recognitionRef.current = recognition;
          } catch {
            recognitionRef.current = null;
          }
        }

        setPhase("listening");
        startMeter(analyser);

        vadTimerRef.current = window.setInterval(() => {
          if (phaseRef.current !== "listening" || hangupRef.current) return;
          const rms = readRms();
          const now = Date.now();
          if (rms > 0.042) {
            heardSpeechRef.current = true;
            lastVoiceAtRef.current = now;
          } else if (
            heardSpeechRef.current &&
            lastVoiceAtRef.current > 0 &&
            now - lastVoiceAtRef.current > 1800 &&
            now - startedAtRef.current > 1000
          ) {
            const rec = recorderRef.current;
            if (rec && rec.state !== "inactive") {
              clearVad();
              if (recognitionRef.current) {
                try {
                  recognitionRef.current.onend = null;
                  recognitionRef.current.stop();
                } catch {
                  // ignore
                }
              }
              try {
                rec.stop();
              } catch {
                // ignore
              }
            }
          }
        }, 100);
      } catch (e) {
        const msg =
          e instanceof DOMException &&
          (e.name === "NotAllowedError" || e.name === "PermissionDeniedError")
            ? "麦克风权限被拒绝。请允许后重试，或用 Chrome / Edge 打开本页。"
            : e instanceof Error
              ? e.message
              : micUnsupportedMessage();
        setError(msg);
        setPhase("ended");
      }
    }, [
      clearVad,
      ensureAnalyser,
      ensureMic,
      flushRecording,
      readRms,
      startMeter,
      stopPlayback,
    ]);

    startListeningRef.current = startListening;

    const endCall = useCallback(
      async (opts?: { generateReview?: boolean }) => {
        if (phaseRef.current === "ending") return;
        hangupRef.current = true;
        setPhase("ending");
        stopPlayback();
        clearVad();

        if (recorderRef.current && recorderRef.current.state !== "inactive") {
          try {
            recorderRef.current.onstop = null;
            recorderRef.current.stop();
          } catch {
            // ignore
          }
        }
        recorderRef.current = null;

        const sid = sessionIdRef.current;
        try {
          if (opts?.generateReview !== false && sid) {
            const res = await endInterview(sid);
            onCompleted?.(res.markdown);
            setQuestion("面试已结束，复盘已写入对话");
          }
        } catch {
          setQuestion("已结束通话");
        } finally {
          releaseMic();
          analysingRef.current = false;
          setPhase("ended");
          setSessionId(null);
          sessionIdRef.current = null;
          callStartedAtRef.current = null;
        }
      },
      [clearVad, onCompleted, releaseMic, stopPlayback],
    );

    endCallRef.current = endCall;

    const handleDial = useCallback(async () => {
      if (disabled) return;
      hangupRef.current = false;
      setOpen(true);
      setPhase("connecting");
      setError(null);
      setLastTranscript(null);
      setQuestion("");
      callStartedAtRef.current = Date.now();
      setElapsed(0);

      try {
        await ensureMic();
        const res = await startVoiceInterview({
          conversation_id: conversationId || undefined,
          position: "AI产品经理",
          mode: "full",
        });
        if (hangupRef.current) return;

        setSessionId(res.id);
        setStage(res.stage);
        onCompleted?.(res.markdown);
        const q = (res.turn?.question as string) || "请先做个自我介绍。";
        const url = ((res.turn?.tts_url as string) || res.tts_url || null) as string | null;
        const playbackUrl = await resolveVoicePlaybackUrl(url, q);
        const preloadedAudio = playbackUrl ? await preloadSpeechAudio(playbackUrl) : null;
        setQuestion(q);
        await playTts(
          url,
          () => {
            if (!hangupRef.current) void startListeningRef.current();
          },
          q,
          playbackUrl,
          preloadedAudio,
        );
      } catch (e) {
        const msg =
          e instanceof DOMException &&
          (e.name === "NotAllowedError" || e.name === "PermissionDeniedError")
            ? "麦克风权限被拒绝。请允许后重试，或用 Chrome / Edge 打开 http://localhost:3001"
            : e instanceof Error
              ? e.message
              : "接通失败";
        setError(msg);
        setPhase("ended");
        releaseMic();
      }
    }, [conversationId, disabled, ensureMic, onCompleted, playTts, releaseMic]);

    useImperativeHandle(
      ref,
      () => ({
        start: () => {
          void handleDial();
        },
        end: () => {
          void endCall({ generateReview: true }).then(() => setOpen(false));
        },
        isInCall: () =>
          ["connecting", "speaking", "listening", "processing", "ending"].includes(
            phaseRef.current,
          ),
      }),
      [endCall, handleDial],
    );

    const handleCloseOverlay = () => {
      if (phase === "ended" || phase === "idle") {
        setOpen(false);
        setPhase("idle");
        setError(null);
        return;
      }
      void endCall({ generateReview: true }).then(() => setOpen(false));
    };

    if (!open) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 backdrop-blur-[2px] sm:items-center">
        <div
          className={cn(
            "relative flex w-full max-w-md flex-col overflow-hidden rounded-3xl border shadow-2xl",
            "border-[color:var(--season-border)] bg-[color:var(--season-panel)]",
          )}
          style={{
            backgroundImage:
              "radial-gradient(120% 80% at 50% -10%, color-mix(in oklab, var(--season-accent) 28%, transparent), transparent 55%)",
          }}
        >
          <div className="flex items-start justify-between gap-3 px-5 pt-4">
            <div>
              <p className="text-xs tracking-wide text-muted-foreground">职小伴 · 语音面试</p>
              <p className="mt-0.5 text-sm font-medium">
                {PHASE_HINT[phase] || "语音面试"}
                {stage ? ` · ${stage}` : ""}
                {inCall ? ` · ${formatElapsed(elapsed)}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCloseOverlay}
              className="rounded-full p-1.5 text-muted-foreground hover:bg-background/60 hover:text-foreground"
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col items-center gap-4 px-6 py-6">
            <div
              className={cn(
                "relative flex h-24 w-24 items-center justify-center rounded-full",
                "bg-[color:var(--season-accent)]/15 text-[color:var(--season-accent)]",
                phase === "speaking" && "animate-pulse",
                phase === "listening" && "ring-4 ring-emerald-400/40",
              )}
            >
              {phase === "processing" || phase === "connecting" || phase === "ending" ? (
                <Loader2 className="h-10 w-10 animate-spin" />
              ) : (
                <Phone className="relative z-10 h-10 w-10" />
              )}
              {(phase === "listening" || phase === "speaking") && (
                <span
                  className="absolute inset-0 rounded-full bg-[color:var(--season-accent)]/20"
                  style={{
                    transform: `scale(${1 + level * 0.6})`,
                    transition: "transform 80ms linear",
                  }}
                />
              )}
            </div>

            {/* Interviewer question — primary content */}
            <div className="w-full rounded-2xl bg-background/75 px-4 py-3.5 shadow-sm">
              <p className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground">
                面试官提问
              </p>
              <p className="min-h-[3rem] text-[15px] leading-relaxed text-foreground">
                {question || (phase === "connecting" ? "正在准备第一题…" : "—")}
              </p>
            </div>

            {lastTranscript && (
              <p className="w-full rounded-xl bg-background/50 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">你刚才说：</span>
                {lastTranscript}
              </p>
            )}

            {phase === "listening" && liveCaption && (
              <p className="w-full rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-100">
                <span className="font-medium">实时字幕：</span>
                {liveCaption}
              </p>
            )}

            {error && (
              <p className="w-full rounded-xl bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">
                {error}
              </p>
            )}
          </div>

          <div className="flex flex-col items-center gap-3 px-6 pb-7">
            {inCall ? (
              <button
                type="button"
                onClick={() => void endCall({ generateReview: true }).then(() => setOpen(false))}
                className="flex h-14 min-w-[160px] items-center justify-center gap-2 rounded-full bg-rose-500 px-8 text-[15px] font-semibold text-white shadow-lg transition hover:bg-rose-600 active:scale-[0.98]"
              >
                <PhoneOff className="h-5 w-5" />
                结束面试
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleDial()}
                  className="flex h-12 min-w-[132px] items-center justify-center gap-2 rounded-full bg-emerald-500 px-5 text-sm font-semibold text-white shadow-lg hover:bg-emerald-600"
                >
                  <Phone className="h-4 w-4" />
                  再面一次
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setPhase("idle");
                  }}
                  className="rounded-full px-4 py-2 text-sm text-muted-foreground hover:bg-background/60"
                >
                  关闭
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
);
