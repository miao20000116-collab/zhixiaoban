"use client";

export function hasTranscribeKey() {
  return true;
}

export async function transcribeAudio(file: File) {
  return `已上传音频 ${file.name}。\n当前 React 版先保留录音复盘入口，请将转写文本粘贴到页面继续分析。`;
}
