"""Heuristic document kind detection: resume vs job description."""

from __future__ import annotations

import re

RESUME_HINTS = [
    r"教育经历",
    r"工作经历",
    r"实习经历",
    r"项目经历",
    r"自我评价",
    r"个人简历",
    r"求职意向",
    r"专业技能",
    r"校园经历",
    r"获奖情况",
    r"\bresume\b",
    r"\beducation\b",
    r"\bexperience\b",
    r"\bwork\s+experience\b",
    r"\bproject(s)?\b",
    r"\bskills?\b",
    r"\bresults?\b",
    r"\binternship\b",
    r"本科|硕士|博士",
    r"GPA|绩点",
]

JD_HINTS = [
    r"岗位职责",
    r"任职要求",
    r"职位描述",
    r"工作职责",
    r"岗位要求",
    r"招聘岗位",
    r"薪资范围",
    r"汇报对象",
    r"job\s*description",
    r"\bresponsibilities\b",
    r"\brequirements\b",
    r"\bqualifications\b",
    r"加分项",
    r"优先考虑",
]


def detect_document_kind(text: str) -> str:
    """Return 'resume' | 'jd' | 'unknown' based on content cues."""
    sample = (text or "")[:8000]
    if len(sample.strip()) < 20:
        return "unknown"

    resume_score = _score(sample, RESUME_HINTS)
    jd_score = _score(sample, JD_HINTS)

    # Extra resume signals: contact / school patterns
    if re.search(r"1[3-9]\d{9}", sample):
        resume_score += 1
    if re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", sample):
        resume_score += 1
    if re.search(r"大学|学院|University", sample) and re.search(r"经历|项目", sample):
        resume_score += 1
    if re.search(r"\b\d+\s*(?:years?|yrs?)\b", sample, re.IGNORECASE) and re.search(
        r"\b(product|manager|engineer|designer|analyst)\b", sample, re.IGNORECASE
    ):
        resume_score += 1
    if re.search(r"\b(results?|achievement|project)\s*:", sample, re.IGNORECASE):
        resume_score += 1

    if resume_score >= jd_score + 2 and resume_score >= 2:
        return "resume"
    if jd_score >= resume_score + 2 and jd_score >= 2:
        return "jd"
    if resume_score > jd_score and resume_score >= 2:
        return "resume"
    if jd_score > resume_score and jd_score >= 2:
        return "jd"
    return "unknown"


def _score(text: str, patterns: list[str]) -> int:
    score = 0
    for pat in patterns:
        if re.search(pat, text, flags=re.IGNORECASE):
            score += 1
    return score
