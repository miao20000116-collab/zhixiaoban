"""Career Gap Agent smoke tests (no live LLM)."""

from app.agents.career_gap.agent import _ensure_traceable, _parse_result
from app.agents.career_gap.schema import CareerGapResult, GapEvidence, GapItem, StrengthItem
from app.services.career_intelligence_service import (
    build_insufficient_gap_result,
    build_target_jd_payload,
    format_gap_markdown,
)


def test_parse_valid_json():
    raw = """
    {
      "target_position": "AI产品经理",
      "match_score": 78,
      "strengths": [{"title": "增长经验", "reason": "有项目", "evidence": [{"claim": "留存优化", "source": "Career Memory", "source_type": "project"}]}],
      "gaps": [{"title": "RAG不足", "reason": "JD要求", "evidence": [{"claim": "需要RAG", "source": "JD", "source_type": "jd"}]}],
      "recommendations": [{"action": "做RAG案例", "why": "补缺口", "priority": "high"}],
      "evidence": [{"claim": "留存优化", "source": "Career Memory", "source_type": "project"}],
      "summary": "整体可冲刺"
    }
    """
    result = _parse_result(raw)
    assert isinstance(result, CareerGapResult)
    assert result.match_score == 78
    assert result.gaps[0].title.startswith("RAG")
    assert result.evidence
    assert result.strengths[0].evidence[0].source_type == "project"


def test_parse_invalid_fallback():
    result = _parse_result("not-json")
    assert result.match_score == 0
    assert result.recommendations
    assert "不生成匹配评分" in (result.summary or "") or "补充" in (result.summary or "")
    assert "解析失败" not in (result.summary or "")


def test_ensure_traceable_fills_missing_evidence():
    gap = CareerGapResult(
        match_score=80,
        strengths=[StrengthItem(title="产品经验", reason="5年经历", evidence=[])],
        gaps=[GapItem(title="缺RAG", reason="JD要求RAG", evidence=[])],
        recommendations=[{"action": "做RAG", "why": "补缺口", "priority": "high"}],
    )
    fixed = _ensure_traceable(gap)
    assert fixed.strengths[0].evidence
    assert fixed.gaps[0].evidence
    assert fixed.evidence
    assert fixed.gaps[0].evidence[0].source_type == "jd"


def test_score_only_rejected():
    gap = CareerGapResult(match_score=80, strengths=[], gaps=[], summary="")
    fixed = _ensure_traceable(gap)
    assert fixed.match_score == 0
    assert "缺少" in (fixed.summary or "")


def test_insufficient_input_no_score():
    gap = build_insufficient_gap_result(target_position=None)
    assert gap.match_score == 0
    assert gap.evaluation and gap.evaluation.get("risk_level") == "not_applicable"
    md = format_gap_markdown(gap)
    assert "暂不评分" in md


def test_target_jd_payload_from_analysis():
    payload = build_target_jd_payload(
        jd_text="负责RAG落地",
        position="AI产品经理",
        job_analysis={
            "position_overview": {"position": "AI产品经理", "company": "X"},
            "core_responsibilities": ["Agent产品规划"],
            "required_skills": ["RAG", "LLM评估"],
            "nice_to_have_skills": ["Prompt"],
            "interview_focus": ["RAG案例"],
        },
    )
    assert payload["position"] == "AI产品经理"
    assert "RAG" in payload["required_skills"]
    assert payload["responsibilities"]


def test_acceptance_growth_pm_to_ai_pm_structure():
    """
    Acceptance fixture (5y growth PM → AI PM):
    strengths should cite product/growth; gaps should cite AI/tech shortage.
    """
    gap = CareerGapResult(
        target_position="AI产品经理",
        match_score=72,
        summary="具备互联网产品与增长基础，AI 应用落地经验仍需补齐。",
        strengths=[
            StrengthItem(
                title="产品经验",
                reason="5年互联网产品经历可迁移到 AI 产品协作",
                evidence=[
                    GapEvidence(
                        claim="5年互联网产品经验，负责用户增长与留存优化",
                        source="Experience",
                        source_type="experience",
                    )
                ],
            ),
            StrengthItem(
                title="增长经验",
                reason="增长与留存优化与 AI 产品增长闭环相关",
                evidence=[
                    GapEvidence(
                        claim="用户增长、留存优化",
                        source="Career Memory",
                        source_type="memory",
                    )
                ],
            ),
        ],
        gaps=[
            GapItem(
                title="AI技术经验不足",
                reason="JD 要求 Agent/RAG/模型评估相关落地经验",
                evidence=[
                    GapEvidence(
                        claim="需要 LLM 应用 / Agent / RAG 经验",
                        source="JD 技能要求",
                        source_type="jd",
                    )
                ],
            )
        ],
        recommendations=[
            {"action": "完成一个 RAG 项目案例", "why": "补齐 LLM 应用落地证据", "priority": "high"},
            {"action": "补充 LLM Evaluation 知识", "why": "对应模型评估缺口", "priority": "medium"},
        ],
        evidence=[
            GapEvidence(claim="用户增长、留存优化", source="Career Memory", source_type="memory"),
            GapEvidence(claim="需要 LLM 应用 / Agent / RAG 经验", source="JD 技能要求", source_type="jd"),
        ],
    )

    strength_text = " ".join(s.title + s.reason for s in gap.strengths)
    gap_text = " ".join(g.title + g.reason for g in gap.gaps)
    assert "产品" in strength_text or "增长" in strength_text
    assert "AI" in gap_text or "RAG" in gap_text or "技术" in gap_text
    assert gap.evidence
    assert all(s.evidence for s in gap.strengths)
    assert all(g.evidence for g in gap.gaps)

    md = format_gap_markdown(gap)
    assert "综合匹配" in md
    assert "优势" in md
    assert "能力缺口" in md
    assert "提升建议" in md
    assert "来源依据" in md
    assert "来源" in md
    assert str(gap.match_score) in md
    assert "AI产品经理" in md


if __name__ == "__main__":
    test_parse_valid_json()
    test_parse_invalid_fallback()
    test_ensure_traceable_fills_missing_evidence()
    test_score_only_rejected()
    test_insufficient_input_no_score()
    test_target_jd_payload_from_analysis()
    test_acceptance_growth_pm_to_ai_pm_structure()
    print("career_gap tests OK")
