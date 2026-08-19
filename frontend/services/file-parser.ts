"use client";

import mammoth from "mammoth";

export async function readFileText(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "docx") {
    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value.trim();
  }

  if (file.type.startsWith("text/") || ["md", "txt", "json"].includes(ext || "")) {
    return file.text();
  }

  if (ext === "pdf") {
    return `已收到 PDF 文件：${file.name}\n当前版本暂不直接解析 PDF 正文，建议先复制文本再粘贴到输入框。`;
  }

  return file.text().catch(() => `已收到文件：${file.name}`);
}
