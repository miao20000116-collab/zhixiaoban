"""Career Gap Analysis Agent — profile/memory vs target JD."""

from __future__ import annotations

import json
import re
from typing import Any

from app.agents.career_gap.schema import CareerGapResult, GapEvidence
from app.services.llm.openai_provider import get_llm_provider
from app.services.prompt_loader import load_agent_prompt


class CareerGapAgent:
    """Analyzes capability gaps between Career Memory and a target role."""

    async def analyze(
        self,
        *,
        memory_context: str = "",
        target_jd: str | None = None,
        target_position: str | None = None,
        company: str | None = None,
        industry_context: str = "",
        career_status_context: str = "",
        user_profile: dict[str, Any] | None = None,
        career_memory: dict[str, Any] | None = None,
        target_jd_structured: dict[str, Any] | None = None,
    ) -> CareerGapResult:
        system_prompt = load_agent_prompt("career_gap")
        profile_block = _format_json_block("user_profile", user_profile)
        memory_block = _format_json_block("career_memory", career_memory)
        jd_struct_block = _format_json_block("target_jd_structured", target_jd_structured)

        user_content = (
            "请基于以下结构化输入完成职业差距分析。"
            "优势/缺口/建议都必须可追溯到 user_profile、career_memory 或 target_jd；禁止编造。\n\n"
            f"{profile_block}\n"
            f"{memory_block}\n"
            f"{jd_struct_block}\n"
            f"## 职业记忆 / Profile（文本）\n{memory_context or '（暂无）'}\n\n"
            f"## 求职状态\n{career_status_context or '（暂无）'}\n\n"
            f"## 目标岗位\n{target_position or '（未指定）'}\n"
            f"## 目标公司\n{company or '（未指定）'}\n\n"
            f"## 目标 JD（原文）\n{target_jd or '（无完整 JD，请基于岗位常识分析，并标注信息不足）'}\n\n"
            f"## 行业上下文\n{industry_context or '（无）'}\n\n"
            "输出完整 JSON：match_score / strengths / gaps / recommendations / evidence / summary。"
            "每个 strength 与 gap 都必须带 evidence；顶层 evidence 汇总关键依据。"
        )
        provider = get_llm_provider()
        raw = await provider.complete(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.3,
        )
        result = _parse_result(raw)
        if target_position and not result.target_position:
            result.target_position = target_position
        if company and not result.company:
            result.company = company
        # Flatten item evidences into top-level evidence when empty
        if not result.evidence:
            flattened = []
            for item in list(result.strengths) + list(result.gaps):
                flattened.extend(item.evidence or [])
            result.evidence = flattened
        return _ensure_traceable(result)

    async def run(self, input_data: dict) -> dict:
        result = await self.analyze(
            memory_context=input_data.get("memory_context", ""),
            target_jd=input_data.get("target_jd"),
            target_position=input_data.get("target_position"),
            company=input_data.get("company"),
            industry_context=input_data.get("industry_context", ""),
            career_status_context=input_data.get("career_status_context", ""),
            user_profile=input_data.get("user_profile"),
            career_memory=input_data.get("career_memory"),
            target_jd_structured=input_data.get("target_jd_structured")
            or input_data.get("target_jd_struct"),
        )
        return result.model_dump()


def _format_json_block(name: str, payload: dict[str, Any] | None) -> str:
    if not payload:
        return f"## {name}\n（无）\n"
    return f"## {name}\n```json\n{json.dumps(payload, ensure_ascii=False, indent=2)}\n```\n"


def _parse_result(raw: str) -> CareerGapResult:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        data = json.loads(cleaned)
        return CareerGapResult.model_validate(data)
    except (json.JSONDecodeError, TypeError, ValueError):
        return CareerGapResult(
            match_score=0,
            summary="差距分析暂时无法结构化输出，请补充目标岗位或 JD 后重试；本次不生成匹配评分。",
            gaps=[],
            strengths=[],
            recommendations=[
                {
                    "action": "补充目标岗位 JD 或更详细的经历",
                    "why": "当前分析结果不完整",
                    "priority": "high",
                }
            ],
            evidence=[],
        )


def _ensure_traceable(result: CareerGapResult) -> CareerGapResult:
    """Drop score-only or evidence-less claims; keep conclusions auditable."""
    strengths = []
    for s in result.strengths:
        if not s.evidence:
            s.evidence = [
                GapEvidence(
                    claim=s.title,
                    source="Career Memory（未标注具体条目，请人工核对）",
                    source_type="memory",
                )
            ]
        strengths.append(s)
    gaps = []
    for g in result.gaps:
        if not g.evidence:
            g.evidence = [
                GapEvidence(
                    claim=g.reason or g.title,
                    source="目标JD / 岗位要求（未标注具体条款，请人工核对）",
                    source_type="jd",
                )
            ]
        gaps.append(g)
    result.strengths = strengths
    result.gaps = gaps
    if result.match_score and not result.strengths and not result.gaps and not result.summary:
        result.summary = "仅有匹配分数、缺少优势与缺口解释；请补充 JD 与经历后重试。"
        result.match_score = 0
    if not result.evidence:
        flattened = []
        for item in list(result.strengths) + list(result.gaps):
            flattened.extend(item.evidence or [])
        result.evidence = flattened
    return result
