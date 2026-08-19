"use client";

export async function ocrImage(file: File) {
  const base = await file.text().catch(() => "");
  if (base.trim()) return base;
  return `已上传图片 ${file.name}。当前 React 版暂未接入浏览器 OCR，请手动补充图片文字后再分析。`;
}
