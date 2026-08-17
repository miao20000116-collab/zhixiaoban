"""Recommendation Agent smoke tests."""

from app.agents.recommendation.agent import _fallback_plan, _parse_result


def test_parse_plan():
    raw = """
    {
      "goal": "转AI产品经理",
      "plan": [{"step": "补RAG", "reason": "缺口", "source": "Gap", "priority": "high"}],
      "recommendations": [{
        "action": "优化项目经历",
        "why": "JD强调AI项目",
        "sources": [{"type": "jd", "label": "JD Analysis"}],
        "priority": "high"
      }],
      "primary_action": "优化项目经历"
    }
    """
    plan = _parse_result(raw, user_goal="转AI产品经理")
    assert plan.goal.startswith("转")
    assert plan.recommendations[0].priority == "high"


def test_parse_fallback_no_internal_error():
    plan = _parse_result("bad", user_goal="我只有1小时准备时间，怎么安排？")
    assert "解析失败" not in (plan.summary or "")
    assert plan.plan
    assert len(plan.plan) >= 2
    assert plan.recommendations
    assert plan.recommendations[0].sources
    assert any("分钟" in s.step or "时间" in (plan.summary or "") for s in plan.plan)


def test_fallback_after_jd():
    plan = _fallback_plan("完成JD分析后，我下一步最应该做什么？")
    assert "解析失败" not in (plan.summary or "")
    blob = " ".join(s.step for s in plan.plan)
    assert "差距" in blob or "简历" in blob


if __name__ == "__main__":
    test_parse_plan()
    test_parse_fallback_no_internal_error()
    test_fallback_after_jd()
    print("recommendation agent tests OK")
