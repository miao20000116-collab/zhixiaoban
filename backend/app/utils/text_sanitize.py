"""Sanitize assistant-facing text for a calm, professional product tone."""

from __future__ import annotations

import re

# Pictographs / emoji presentation + VS16 + ZWJ (covers common decorative emoji).
_EMOJI_RE = re.compile(
    "["
    "\U0001F1E0-\U0001F1FF"  # flags
    "\U0001F300-\U0001F5FF"  # symbols & pictographs
    "\U0001F600-\U0001F64F"  # emoticons
    "\U0001F680-\U0001F6FF"  # transport
    "\U0001F700-\U0001F77F"
    "\U0001F780-\U0001F7FF"
    "\U0001F800-\U0001F8FF"
    "\U0001F900-\U0001F9FF"
    "\U0001FA00-\U0001FAFF"
    "\U00002702-\U000027B0"  # dingbats
    "\U000024C2-\U000025B6"
    "\U000025FE-\U000026FF"  # misc symbols
    "\U0000FE0F"  # variation selector-16
    "\U0000200D"  # zero-width joiner
    "]+",
    flags=re.UNICODE,
)

# Fake status icons models often sprinkle into prose
_DECORATIVE_MARKS_RE = re.compile(r"[✅❌✔✖✦✧★☆◆◇▶►⚠⚠️]+")


def strip_decorative_emoji(text: str) -> str:
    """Remove emoji / decorative symbols from assistant prose."""
    if not text:
        return text
    cleaned = _EMOJI_RE.sub("", text)
    cleaned = _DECORATIVE_MARKS_RE.sub("", cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r"(?m)^[ \t]+", "", cleaned)
    cleaned = re.sub(r"(?m)^([-*+]|\d+[.)])[ \t]*", r"\1 ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned
