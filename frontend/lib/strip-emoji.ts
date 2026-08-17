/** Strip decorative emoji / pictographs from assistant prose for display. */
export function stripDecorativeEmoji(text: string): string {
  if (!text) return text;
  return text
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\uFE0F/g, "")
    .replace(/\u200D/g, "")
    .replace(/[✅❌✔✖✦✧★☆◆◇▶►⚠⚠️]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[ \t]+/gm, "")
    .replace(/\n{3,}/g, "\n\n");
}
