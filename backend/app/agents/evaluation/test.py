"""Evaluation Agent unit tests — schema + heuristics (no live LLM required for heuristics)."""

from app.agents.evaluation.agent import (
    _heuristic_career_gap,
    _heuristic_recommendation,
    _soften_inferred_job_risk,
)
from app.agents.evaluation.schema import EvaluationResult
from app.agents.job.schema import CompanyInfo, IndustryTrend, JobAnalysisResult, PositionOverview
from app.schemas.evaluation import EvaluateRequest


def test_evaluate_request_keeps_gap_and_plan():
    body = EvaluateRequest(
        kind="career_gap",
        target_position="AI产品经理",
        target_jd="负责AI Agent、RAG",
        memory_context="用户只有增长经验，没有真实RAG项目",
        gap={
            "match_score": 90,
            "strengths": [
                {
                    "title": "丰富RAG落地经验",
                    "reason": "做过多个RAG项目",
                    "evidence": [],
                }
            ],
            "gaps": [],
            "recommendations": [{"action": "直接投递", "why": "已经完全匹配"}],
            "evidence": [],
        },
    )
    payload = body.model_dump(exclude_none=True)
    assert payload["kind"] == "career_gap"
    assert payload["gap"]["strengths"][0]["title"].startswith("丰富RAG")
    assert "没有真实RAG" in payload["memory_context"]

    plan_body = EvaluateRequest(
        kind="recommendation",
        plan={
            "goal": "下一步",
            "recommendations": [{"action": "海投", "why": "", "sources": []}],
        },
    )
    plan_payload = plan_body.model_dump(exclude_none=True)
    assert plan_payload["plan"]["recommendations"][0]["action"] == "海投"


def test_heuristic_career_gap_flags_fabricated_rag():
    gap = {
        "match_score": 90,
        "strengths": [
            {
                "title": "丰富RAG落地经验",
                "reason": "做过多个RAG项目",
                "evidence": [],
            }
        ],
        "gaps": [],
        "recommendations": [{"action": "直接投递", "why": "已经完全匹配"}],
        "evidence": [],
    }
    result = _heuristic_career_gap(
        __import__("json").dumps(gap, ensure_ascii=False),
        "用户只有增长经验，没有真实RAG项目",
    )
    assert result is not None
    assert result.risk_level in ("medium", "high")
    blob = " ".join(result.problems + result.fabricated_claims)
    assert "RAG" in blob or "无依据" in blob


def test_heuristic_recommendation_missing_sources():
    plan = {
        "goal": "下一步",
        "recommendations": [{"action": "继续完善求职材料", "why": "", "sources": []}],
        "summary": "行动计划解析失败",
    }
    result = _heuristic_recommendation(__import__("json").dumps(plan, ensure_ascii=False))
    assert result is not None
    assert result.risk_level == "medium"
    assert any("sources" in p or "失败" in p for p in result.problems)


def test_soften_inferred_job_high_without_fabrication():
    analysis = JobAnalysisResult(
        position_overview=PositionOverview(
            position="产品实习生",
            summary="以下为基于岗位/公司线索的推测分析",
        ),
        company_analysis=CompanyInfo(is_inferred=True, sources=["推测"]),
        industry_trends=IndustryTrend(is_inferred=True),
    )
    result = EvaluationResult(risk_level="high", score=40, problems=["信息不足"], fabricated_claims=[])
    softened = _soften_inferred_job_risk(analysis, result)
    assert softened.risk_level == "medium"


def test_heuristic_career_gap_flags_packaging_advice():
    gap = {
        "match_score": 70,
        "strengths": [
            {
                "title": "增长经验",
                "reason": "有 A/B 经历",
                "evidence": [{"claim": "A/B", "source": "memory"}],
            }
        ],
        "gaps": [],
        "recommendations": [
            {"action": "将知识库课程包装为RAG相关实战", "why": "提高匹配度"}
        ],
        "evidence": [],
    }
    result = _heuristic_career_gap(
        __import__("json").dumps(gap, ensure_ascii=False),
        "没有真实RAG项目经验，只上过RAG课程。",
    )
    assert result is not None
    assert result.risk_level == "medium"
    blob = " ".join(result.problems + result.fabricated_claims)
    assert "包装" in blob


if __name__ == "__main__":
    test_evaluate_request_keeps_gap_and_plan()
    test_heuristic_career_gap_flags_fabricated_rag()
    test_heuristic_career_gap_flags_packaging_advice()
    test_heuristic_recommendation_missing_sources()
    test_soften_inferred_job_high_without_fabrication()
    print("evaluation tests OK")
