import { API_URL, ApiError, apiHeaders, jsonHeaders, readApiError, resolveMediaUrl } from "./api";

export interface VoiceStartResponse {
  id: string;
  conversation_id?: string | null;
  mode: string;
  stage: string;
  status: string;
  position?: string | null;
  turn?: Record<string, unknown> | null;
  markdown: string;
  tts_url?: string | null;
}

export interface VoiceAnswerResponse {
  id: string;
  session_id: string;
  stage: string;
  status: string;
  transcript: string;
  audio_url: string;
  expression: {
    speech_rate_cpm?: number | null;
    fluency_score?: number;
    filler_count?: number;
    pause_density?: number;
    suggestions?: string[];
  };
  answer_score?: Record<string, unknown> | null;
  tts_url?: string | null;
  markdown: string;
  /** Next interviewer question when available. */
  question?: string | null;
  next_action?: {
    title?: string;
    message?: string;
    actions?: Array<{ id: string; label: string; intent?: string }>;
  } | null;
  review?: Record<string, unknown> | null;
}

export interface CareerStatus {
  stage: string;
  stage_label: string;
  interview_count: number;
  application_count: number;
  strength?: string | null;
  weakness?: string | null;
  last_interview_score?: number | null;
  recent_failures: number;
  focus_areas?: string[] | null;
  next_action?: string | null;
}

export async function synthesizeInterviewSpeech(text: string): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const response = await fetch(`${API_URL}/speech/tts`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ text: trimmed }),
  });
  if (!response.ok) {
    const err = await readApiError(response, "语音合成失败");
    throw new ApiError(err.message, response.status, err.code);
  }
  const data = (await response.json()) as { url?: string | null };
  return resolveMediaUrl(data.url);
}

export async function resolveVoicePlaybackUrl(
  url: string | null | undefined,
  speakText?: string | null,
): Promise<string | null> {
  const resolved = resolveMediaUrl(url);
  if (resolved) return resolved;
  const text = (speakText || "").trim();
  if (!text) return null;
  try {
    return await synthesizeInterviewSpeech(text);
  } catch {
    return null;
  }
}

/** Preload mp3 so play() can start as soon as enough data is buffered. */
export function preloadSpeechAudio(url: string): Promise<HTMLAudioElement> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    audio.preload = "auto";

    const cleanup = () => {
      audio.removeEventListener("canplay", onReady);
      audio.removeEventListener("error", onError);
    };

    const onReady = () => {
      cleanup();
      resolve(audio);
    };

    const onError = () => {
      cleanup();
      reject(new Error("audio load failed"));
    };

    audio.addEventListener("canplay", onReady);
    audio.addEventListener("error", onError);
    audio.load();
    if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      cleanup();
      resolve(audio);
    }
  });
}

export async function startVoiceInterview(body: {
  conversation_id?: string;
  position?: string;
  jd_text?: string;
  mode?: "full" | "technical_interview";
}): Promise<VoiceStartResponse> {
  const response = await fetch(`${API_URL}/interview/voice/start`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await readApiError(response, "启动语音面试失败");
    throw new ApiError(err.message, response.status, err.code);
  }
  return response.json();
}

export async function submitVoiceAnswer(
  sessionId: string,
  blob: Blob | null,
  opts?: { duration_ms?: number; transcript?: string; filename?: string; fast?: boolean },
): Promise<VoiceAnswerResponse> {
  const form = new FormData();
  if (blob && blob.size > 0) {
    form.append("file", blob, opts?.filename || "answer.webm");
  }
  if (opts?.duration_ms != null) form.append("duration_ms", String(opts.duration_ms));
  if (opts?.transcript) form.append("transcript", opts.transcript);
  form.append("fast", opts?.fast === false ? "false" : "true");

  const response = await fetch(`${API_URL}/interview/voice/${sessionId}/answer`, {
    method: "POST",
    headers: apiHeaders(),
    body: form,
  });
  if (!response.ok) {
    const err = await readApiError(response, "语音回答提交失败");
    throw new ApiError(err.message, response.status, err.code);
  }
  return response.json() as Promise<VoiceAnswerResponse>;
}

/** Realtime path: live browser ASR text only — no audio upload / SenseVoice wait. */
export async function submitLiveTranscript(
  sessionId: string,
  transcript: string,
  opts?: { duration_ms?: number },
): Promise<VoiceAnswerResponse> {
  return submitVoiceAnswer(sessionId, null, {
    transcript,
    duration_ms: opts?.duration_ms,
    fast: true,
  });
}

export async function fetchCareerStatus(): Promise<CareerStatus> {
  const response = await fetch(`${API_URL}/career/status`, {
    headers: apiHeaders(),
  });
  if (!response.ok) throw new ApiError(await response.text(), response.status);
  return response.json();
}

export async function fetchSessionTranscript(sessionId: string): Promise<{
  transcript: string;
  clips: Array<Record<string, unknown>>;
}> {
  const response = await fetch(`${API_URL}/interview/${sessionId}/transcript`, {
    headers: apiHeaders(),
  });
  if (!response.ok) throw new ApiError(await response.text(), response.status);
  return response.json();
}
