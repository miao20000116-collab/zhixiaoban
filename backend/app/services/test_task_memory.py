"""Task Memory unit tests (Phase 8.2) — no live LLM / DB."""

from __future__ import annotations

from types import SimpleNamespace

from app.services.task_memory_service import (
    DEFAULT_STEPS,
    _mark_step_lists,
    _recompute_progress,
    _resolve_task_type,
    extract_company_position,
    format_task_context,
    has_clear_goal,
    infer_goal,
    infer_task_type,
)


def test_infer_types_and_goals():
    assert infer_task_type("帮我分析这份JD", "jd_analysis") == "jd_analysis"
    assert infer_task_type("优化简历", "resume") == "resume_prepare"
    assert infer_task_type("我准备字节AI产品经理面试") == "interview_prepare"
    assert "字节" in infer_goal("x", company="字节", position="AI产品经理")
    assert has_clear_goal("我要准备AI产品经理面试")
    assert not has_clear_goal("嗯")


def test_extract_company_position():
    company, position = extract_company_position("我准备字节AI产品经理面试")
    assert company == "字节"
    assert position == "AI产品经理"


def test_resolve_keeps_journey_continuous():
    jd_task = SimpleNamespace(task_type="jd_analysis")
    # JD → resume should coalesce into interview journey (not lose continuity)
    assert _resolve_task_type(jd_task, "resume_prepare") == "interview_prepare"

    interview = SimpleNamespace(task_type="interview_prepare")
    assert _resolve_task_type(interview, "jd_analysis") == "interview_prepare"
    assert _resolve_task_type(interview, "resume_prepare") == "interview_prepare"

    growth = SimpleNamespace(task_type="career_growth")
    assert _resolve_task_type(growth, "jd_analysis") == "jd_analysis"


def test_acceptance_jd_then_resume_steps():
    """
    Turn 1: upload JD → mark JD分析
    Turn 2: continue chat → same journey type
    Turn 3: resume optimize → mark 简历优化
    """
    steps = list(DEFAULT_STEPS["interview_prepare"])
    completed: list[str] = []
    pending = steps.copy()

    # After JD analysis
    completed, pending = _mark_step_lists(completed, pending, "JD分析", all_steps=steps)
    assert "JD分析" in completed
    assert "JD分析" not in pending
    progress1 = _recompute_progress(completed, pending)
    assert 0 < progress1 < 1

    # After resume optimize
    completed, pending = _mark_step_lists(completed, pending, "简历优化", all_steps=steps)
    assert "简历优化" in completed
    assert "项目深挖" in pending or "模拟面试" in pending
    progress2 = _recompute_progress(completed, pending)
    assert progress2 > progress1

    # Alias: 按JD优化 → 简历优化 already done, no dup
    completed, pending = _mark_step_lists(completed, pending, "按JD优化", all_steps=steps)
    assert completed.count("简历优化") == 1


def test_format_task_context():
    task = SimpleNamespace(
        goal="准备字节AI产品经理面试",
        task_type="interview_prepare",
        status="active",
        progress=0.4,
        completed_steps=["JD分析", "简历优化"],
        pending_steps=["项目深挖", "模拟面试"],
        next_action="进行模拟面试",
    )
    ctx = format_task_context(task)
    assert "准备字节AI产品经理面试" in ctx
    assert "JD分析" in ctx
    assert "模拟面试" in ctx
    assert "40%" in ctx
    assert format_task_context(None).startswith("（当前无")


if __name__ == "__main__":
    test_infer_types_and_goals()
    test_extract_company_position()
    test_resolve_keeps_journey_continuous()
    test_acceptance_jd_then_resume_steps()
    test_format_task_context()
    print("task_memory tests OK")
