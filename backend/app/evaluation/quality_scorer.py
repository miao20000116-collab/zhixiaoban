"""Dimension scoring helpers for answer-quality verification.

Maps EvaluationAgent risk/score + rule checks onto product dimensions:
准确性 / 相关性 / 具体性 / 可执行性 / 真实性 / AI产品经理场景契合度
"""

from __future__ import annotations

import re
from typing import Any

DIMENSIONS = [
    "准确性",
    "相关性",
    "具体性",
    "可执行性",
    "真实性",
    "AI产品经理场景契合度",
]

AI_PM_KEYWORDS = [
    "AI产品",
    "产品经理",
    "LLM",
    "Agent",
    "Prompt",
    "评测",
    "闭环",
    "Bad Case",
    "幻觉",
    "A/B",
    "指标",
    "需求",
    "优先级",
]


def _clip(score: int) -> int:
    return max(0, min(100, int(score)))


def _text_blob(obj: Any) -> str:
    if obj is None:
        return ""
    if isinstance(obj, str):
        return obj
    try:
        import json

        return json.dumps(obj, ensure_ascii=False)
    except Exception:
        return str(obj)


def contains_any(text: str, keywords: list[str] | None) -> bool:
    if not keywords:
        return True
    lower = text.lower()
    return any(k.lower() in lower for k in keywords)


def contains_forbidden(text: str, phrases: list[str] | None) -> list[str]:
    if not phrases:
        return []
    hit = []
    for p in phrases:
        if p and p in text:
            hit.append(p)
    return hit


def score_dimensions(
    *,
    case: dict[str, Any],
    output_text: str,
    evaluation: dict[str, Any] | None,
    rule_flags: dict[str, Any] | None = None,
) -> dict[str, int]:
    """Produce 0-100 scores for each required dimension."""
    rule_flags = rule_flags or {}
    evaluation = evaluation or {}
    dims = case.get("scoring_dimensions") or DIMENSIONS

    risk = str(evaluation.get("risk_level") or rule_flags.get("risk_level") or "low")
    base = evaluation.get("score")
    if base is None:
        base = rule_flags.get("score", 75)
    try:
        base = int(base)
    except (TypeError, ValueError):
        base = 75

    fabricated = evaluation.get("fabricated_claims") or []
    problems = evaluation.get("problems") or []
    authenticity = evaluation.get("authenticity")
    if authenticity is None:
        authenticity = rule_flags.get("authenticity")

    # Truthfulness from risk / fabricated / authenticity
    if risk == "high" or (fabricated and len(fabricated) >= 1 and risk != "low"):
        truth = 35 if risk == "high" else 55
    elif risk == "medium":
        truth = 60
    else:
        truth = 88
    if authenticity is not None:
        try:
            truth = min(truth, int(authenticity))
        except (TypeError, ValueError):
            pass
    if rule_flags.get("forbidden_hit"):
        truth = min(truth, 40)
    if rule_flags.get("truth_bonus"):
        truth = max(truth, int(rule_flags["truth_bonus"]))

    # Accuracy
    accuracy = base
    if rule_flags.get("accuracy_fail"):
        accuracy = min(accuracy, 40)
    if rule_flags.get("accuracy_ok"):
        accuracy = max(accuracy, 75)
    if problems and risk in {"medium", "high"}:
        accuracy = min(accuracy, 65 if risk == "medium" else 45)

    # Relevance / PM fit
    pm_hits = sum(1 for k in AI_PM_KEYWORDS if k.lower() in output_text.lower())
    relevance = 55 + min(35, pm_hits * 6)
    if rule_flags.get("off_topic"):
        relevance = min(relevance, 40)
    if rule_flags.get("relevant"):
        relevance = max(relevance, 78)
    pm_fit = relevance
    if "AI产品" in output_text or "产品经理" in output_text or "LLM" in output_text:
        pm_fit = max(pm_fit, 80)
    if rule_flags.get("pm_fit_fail"):
        pm_fit = min(pm_fit, 45)

    # Specificity: prefer concrete numbers, steps, evidence
    concrete_signals = len(
        re.findall(
            r"(?:具体|例如|比如|步骤|指标|%|证据|来源|JD|缺口|优势|\d+)",
            output_text,
        )
    )
    specificity = 50 + min(40, concrete_signals * 4)
    if len(output_text.strip()) < 40:
        specificity = min(specificity, 45)
    if rule_flags.get("too_vague"):
        specificity = min(specificity, 40)
    if rule_flags.get("specific_ok"):
        specificity = max(specificity, 75)

    # Actionability
    action_signals = len(
        re.findall(
            r"(?:建议|下一步|可以|先|然后|补充|准备|改写|练习|投递|复盘|missing|行动)",
            output_text,
        )
    )
    actionability = 50 + min(40, action_signals * 5)
    if rule_flags.get("actionable"):
        actionability = max(actionability, 78)
    if rule_flags.get("not_actionable"):
        actionability = min(actionability, 40)

    # Offline anti-hallucination cases: Evaluation *detecting* hallucination is success
    if case.get("module") == "反幻觉测试" and case.get("mode") == "offline":
        detected = bool(rule_flags.get("detection_ok"))
        if detected:
            truth = max(truth, 90)
            accuracy = max(accuracy, 88)
            specificity = max(specificity, 80)
            actionability = max(actionability, 75)
            relevance = max(relevance, 80)
            pm_fit = max(pm_fit, 80)
        else:
            truth = min(truth, 35)
            accuracy = min(accuracy, 35)

    mapping = {
        "准确性": _clip(accuracy),
        "相关性": _clip(relevance),
        "具体性": _clip(specificity),
        "可执行性": _clip(actionability),
        "真实性": _clip(truth),
        "AI产品经理场景契合度": _clip(pm_fit),
    }
    return {d: mapping.get(d, _clip(base)) for d in dims}


def verdict_from_scores(
    scores: dict[str, int],
    *,
    pass_threshold: int = 70,
    warn_threshold: int = 55,
    hard_fail: bool = False,
) -> tuple[str, float]:
    if not scores:
        return "FAIL", 0.0
    avg = sum(scores.values()) / len(scores)
    if hard_fail or avg < warn_threshold:
        return "FAIL", round(avg, 1)
    if avg < pass_threshold:
        return "WARNING", round(avg, 1)
    return "PASS", round(avg, 1)


def build_bad_case_payload(
    *,
    case: dict[str, Any],
    verdict: str,
    avg_score: float,
    scores: dict[str, int],
    reasons: list[str],
    output_preview: str,
) -> dict[str, Any]:
    problem_type = "answer_quality_fail" if verdict == "FAIL" else "answer_quality_warning"
    description = (
        f"[{case.get('case_id')}][{case.get('module')}] verdict={verdict} avg={avg_score}; "
        f"scores={scores}; reasons={'; '.join(reasons[:6])}; "
        f"output_preview={output_preview[:400]}"
    )
    return {
        "agent_name": str(case.get("agent") or case.get("module") or "unknown"),
        "problem_type": problem_type,
        "description": description[:4000],
        "solution": "对照期望输出特征与失败标准修订 Prompt/Agent；优先处理真实性与可执行性缺口。",
    }
