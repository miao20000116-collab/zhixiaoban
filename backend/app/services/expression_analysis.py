"""Speech expression analysis: pace, pauses, fillers, fluency (rule-based)."""

from __future__ import annotations

import re
from collections import Counter
from typing import Any

FILLERS = [
    "嗯",
    "呃",
    "啊",
    "那个",
    "就是",
    "然后",
    "其实",
    "怎么说",
    "你知道",
    "basically",
    "like",
    "um",
    "uh",
    "you know",
]


def analyze_expression(
    transcript: str,
    *,
    duration_ms: int | None = None,
) -> dict[str, Any]:
    """Analyze spoken answer quality from transcript + optional duration."""
    text = (transcript or "").strip()
    char_count = len(re.sub(r"\s+", "", text))
    word_tokens = _tokenize(text)
    duration_sec = (duration_ms or 0) / 1000.0 if duration_ms else None

    # 语速：字/分钟（中文按字；英文按词近似）
    if duration_sec and duration_sec > 0:
        chars_per_min = round(char_count / duration_sec * 60, 1)
    else:
        chars_per_min = None

    filler_hits: list[str] = []
    lowered = text.lower()
    for filler in FILLERS:
        count = lowered.count(filler.lower())
        if count:
            filler_hits.extend([filler] * count)

    pause_markers = len(re.findall(r"[，,。.!！？?\…]{1,}|…|--", text))
    # Heuristic pause score: more markers relative to length → more pauses
    pause_density = round(pause_markers / max(char_count / 50, 1), 2)

    # 重复词：高频 bigram / unigram
    repeats = _repeated_phrases(word_tokens)

    fluency = _fluency_score(
        chars_per_min=chars_per_min,
        filler_count=len(filler_hits),
        char_count=char_count,
        pause_density=pause_density,
        repeat_count=len(repeats),
    )

    suggestions: list[str] = []
    if chars_per_min is not None:
        if chars_per_min > 280:
            suggestions.append("语速偏快，建议放慢并在关键结论处停顿。")
        elif chars_per_min < 90 and char_count > 40:
            suggestions.append("语速偏慢，可用「结论先行」压缩铺垫。")
    if len(filler_hits) >= 4:
        suggestions.append(f"口头禅偏多（如「{' / '.join(sorted(set(filler_hits))[:3])}」），可先在心里组织结构再开口。")
    if pause_density > 3:
        suggestions.append("停顿较碎，建议按 STAR 分段：情境→行动→结果。")
    if repeats:
        suggestions.append(f"存在重复表达：{repeats[0]}，可合并为一句结论。")
    if not suggestions and fluency >= 75:
        suggestions.append("表达整体流畅，可再补一个量化结果增强说服力。")

    return {
        "char_count": char_count,
        "duration_ms": duration_ms,
        "speech_rate_cpm": chars_per_min,
        "filler_count": len(filler_hits),
        "fillers": sorted(Counter(filler_hits).items(), key=lambda x: -x[1])[:8],
        "pause_markers": pause_markers,
        "pause_density": pause_density,
        "repeated_phrases": repeats[:5],
        "fluency_score": fluency,
        "suggestions": suggestions,
    }


def _tokenize(text: str) -> list[str]:
    # Chinese chars as tokens + latin words
    parts = re.findall(r"[\u4e00-\u9fff]|[A-Za-z0-9%+\-]+", text)
    return [p for p in parts if p.strip()]


def _repeated_phrases(tokens: list[str]) -> list[str]:
    if len(tokens) < 4:
        return []
    # Prefer multi-char Chinese chunks / words length>=2
    unigrams = [t for t in tokens if len(t) >= 2]
    counts = Counter(unigrams)
    repeats = [w for w, c in counts.most_common(10) if c >= 3 and w not in FILLERS]
    # Bigrams
    bigrams = ["".join(tokens[i : i + 2]) for i in range(len(tokens) - 1)]
    bi_counts = Counter(bigrams)
    for bg, c in bi_counts.most_common(10):
        if c >= 2 and len(bg) >= 2:
            repeats.append(bg)
    # Dedupe preserve order
    seen: set[str] = set()
    out: list[str] = []
    for r in repeats:
        if r not in seen:
            seen.add(r)
            out.append(r)
    return out


def _fluency_score(
    *,
    chars_per_min: float | None,
    filler_count: int,
    char_count: int,
    pause_density: float,
    repeat_count: int,
) -> int:
    score = 80
    if char_count < 20:
        score -= 15
    if chars_per_min is not None:
        if 120 <= chars_per_min <= 220:
            score += 10
        elif chars_per_min > 300 or chars_per_min < 70:
            score -= 15
        else:
            score -= 5
    score -= min(filler_count * 3, 20)
    score -= min(int(pause_density * 3), 15)
    score -= min(repeat_count * 4, 16)
    return max(0, min(100, score))
