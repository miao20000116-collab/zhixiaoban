from pathlib import Path

root = Path(__file__).resolve().parents[2]  # repo root: .../职小伴-求职agent
items = [
    ("1. System Prompt", "backend/app/prompts/system_prompt.md"),
    ("2. Master Agent", "backend/app/agents/master/prompt.md"),
    ("3. Memory Agent", "backend/app/agents/memory/prompt.md"),
    ("4. Resume Agent", "backend/app/agents/resume/prompt.md"),
    ("5. Job Agent", "backend/app/agents/job/prompt.md"),
    ("6. Interview Agent", "backend/app/agents/interview/prompt.md"),
    ("7. Career Agent", "backend/app/agents/career/prompt.md"),
    ("8. Career Gap Agent", "backend/app/agents/career_gap/prompt.md"),
    ("9. Recommendation Agent", "backend/app/agents/recommendation/prompt.md"),
    ("10. Evaluation Agent", "backend/app/agents/evaluation/prompt.md"),
]
parts: list[str] = []
parts.append("# 职小伴 · 全部 Prompt 汇总\n\n")
parts.append("> 将仓库内全部产品相关 Prompt 正文汇总到一份 Markdown，便于查阅。\n")
parts.append("> 来源：`backend/app/agents/*/prompt.md` 与 `backend/app/prompts/system_prompt.md`\n\n")
parts.append("## 目录\n\n")
for title, _ in items:
    parts.append(f"- {title}\n")
parts.append("\n")
for title, rel in items:
    parts.append("---\n\n")
    parts.append(f"## {title}\n\n")
    parts.append(f"> 文件：`{rel}`\n\n")
    p = root / rel
    if p.exists():
        parts.append(p.read_text(encoding="utf-8").rstrip() + "\n\n")
    else:
        parts.append("（文件不存在）\n\n")
out = root / "docs" / "全部Prompt汇总.md"
out.write_text("".join(parts), encoding="utf-8")
print("wrote", out, "bytes", out.stat().st_size)
