"""Minimal offline acceptance for P1/P2 quality fixes."""

from __future__ import annotations

import json

from app.agents.evaluation.agent import _heuristic_career_gap, _heuristic_recommendation
from app.agents.interview.agent import _fallback_review_from_transcript, _personalized_opening
from app.agents.job.agent import _fallback_analysis, _guess_title_from_jd
from app.agents.recommendation.agent import _parse_result
from app.memory.service import (
    _merge_summary_preserving_constraints,
    rule_based_extractions,
)
from app.schemas.evaluation import EvaluateRequest
from app.services.career_intelligence_service import build_insufficient_gap_result, format_gap_markdown
from app.services.chat_service import _looks_like_memory_share


def main() -> None:
    print("==1 Memory intent==")
    msg = "我之前负责浏览器用户增长，负责DAU提升和用户留存优化。"
    assert _looks_like_memory_share(msg)
    items = rule_based_extractions(msg)
    assert any("DAU" in str(i.data) or "留存" in str(i.data) or "增长" in str(i.data) for i in items)
    print("OK memory share + extract")

    print("==2 Constraint==")
    c = "我没有真实RAG项目经验，只上过RAG课程。"
    assert any(i.type == "constraint_memory" for i in rule_based_extractions(c))
    merged = _merge_summary_preserving_constraints("【约束】" + c, "浏览器增长")
    assert "【约束】" in merged and "RAG" in merged
    print("OK constraint preserve")

    print("==3 Interview fallback==")
    review = _fallback_review_from_transcript(
        [
            {"role": "user", "content": "我做浏览器增长，DAU留存提升8%"},
            {"role": "user", "content": "因为要验证假设所以做A/B"},
        ],
        position="AI产品经理",
    )
    assert "解析失败" not in json.dumps(review.model_dump(), ensure_ascii=False)
    print("OK interview", review.overall_score)

    print("==4 Job clue==")
    j = _fallback_analysis(
        jd_text=None,
        position="AI产品经理",
        company="字节跳动",
        memory_context="工作年限：5年",
    )
    assert "推测" in (j.position_overview.summary or "")
    assert "解析失败" not in (j.position_overview.summary or "")
    assert j.user_match.score == 0
    print("OK job clue")

    print("==5 Manager JD==")
    jd = (
        "AI产品负责人：负责AI产品战略、团队管理、商业化目标、跨部门资源协调，"
        "要求8年以上产品经验和团队管理经验。"
    )
    t = _guess_title_from_jd(jd)
    r = _fallback_analysis(jd_text=jd, position=t, company=None, memory_context="工作年限：5年")
    assert "负责" in (r.position_overview.level or "")
    print("OK manager", t, r.position_overview.level)

    print("==6 Empty gap==")
    g = build_insufficient_gap_result()
    md = format_gap_markdown(g)
    assert g.match_score == 0 and "暂不评分" in md and g.evaluation["risk_level"] == "not_applicable"
    from app.services.career_status_service import sanitize_latest_gap_for_display

    dirty = {"match_score": 88, "strengths": [], "gaps": [], "evidence": [], "summary": "旧脏数据"}
    assert sanitize_latest_gap_for_display(dirty) is None
    assert sanitize_latest_gap_for_display(g.model_dump()) is not None
    print("OK empty gap")

    print("==7 Recommendation fallback==")
    p = _parse_result("not-json", user_goal="我只有1小时准备时间，怎么安排？")
    assert "解析失败" not in (p.summary or "")
    assert any("分钟" in s.step for s in p.plan)
    print("OK recommendation")

    print("==8 Evaluation gap schema==")
    body = EvaluateRequest(
        kind="career_gap",
        target_position="AI产品经理",
        memory_context="没有真实RAG项目",
        gap={
            "match_score": 90,
            "strengths": [
                {"title": "丰富RAG落地经验", "reason": "做过多个RAG项目", "evidence": []}
            ],
            "gaps": [],
            "recommendations": [{"action": "直接投递", "why": "已经完全匹配"}],
            "evidence": [],
        },
    )
    payload = body.model_dump(exclude_none=True)
    assert payload.get("gap")
    h = _heuristic_career_gap(json.dumps(payload["gap"], ensure_ascii=False), payload["memory_context"])
    assert h and h.risk_level == "medium"
    assert any("RAG" in x or "无依据" in x for x in h.problems + h.fabricated_claims)
    print("OK eval gap")

    print("==9 Evaluation plan schema==")
    body2 = EvaluateRequest(
        kind="recommendation",
        plan={"recommendations": [{"action": "海投", "why": "", "sources": []}]},
    )
    payload2 = body2.model_dump(exclude_none=True)
    assert payload2.get("plan")
    h2 = _heuristic_recommendation(json.dumps(payload2["plan"], ensure_ascii=False))
    assert h2 and any("sources" in p for p in h2.problems)
    print("OK eval plan")

    print("==Opening==")
    op = _personalized_opening(
        mode="full",
        position="AI产品经理",
        memory_context="浏览器增长 DAU 留存",
        resume_text=None,
    )
    assert "浏览器" in op
    print("OK opening:", op[:80])
    print("\nALL ACCEPTANCE CHECKS PASSED")


if __name__ == "__main__":
    main()
