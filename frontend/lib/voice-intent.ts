/** Detect user intent to open the realtime voice interview UI (not text interview). */
export function wantsVoiceInterview(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return /语音(模拟)?面试|改成语音|语音表达|录音回答|一对一语音/.test(t);
}
