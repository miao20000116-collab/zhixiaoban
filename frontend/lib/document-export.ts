import { escHtml, wrapHtml } from "@/lib/resume-wizard/template-utils";

export function sanitizeFileName(name: string) {
  return (name || "未命名").replace(/[\\/:*?"<>|]/g, "-").trim() || "未命名";
}

export function downloadTextFile(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob(["\ufeff" + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadWordHtml(title: string, bodyHtml: string) {
  const blob = new Blob(["\ufeff" + wrapHtml(title, bodyHtml)], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFileName(title)}.doc`;
  a.click();
  URL.revokeObjectURL(url);
}

export function printPdfFromHtml(title: string, bodyHtml: string) {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(wrapHtml(title, bodyHtml));
  win.document.close();
  window.setTimeout(() => {
    win.focus();
    win.print();
  }, 400);
  return true;
}

export function preHtml(text: string) {
  return `<pre style="font-family:Segoe UI,Microsoft YaHei,sans-serif;font-size:12pt;line-height:1.6;white-space:pre-wrap;margin:0;">${escHtml(text)}</pre>`;
}
