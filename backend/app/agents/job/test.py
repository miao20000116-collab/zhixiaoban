"""Job Agent fallback tests (no live LLM)."""

from app.agents.job.agent import _fallback_analysis, _guess_title_from_jd, _is_failed_analysis
from app.agents.job.schema import JobAnalysisResult, PositionOverview


def test_clue_only_fallback():
    result = _fallback_analysis(
        jd_text=None,
        position="AI产品经理",
        company="字节跳动",
        memory_context="工作年限：5年\n增长经验，DAU",
    )
    assert "推测" in (result.position_overview.summary or "")
    assert "解析失败" not in (result.position_overview.summary or "")
    assert result.position_overview.position == "AI产品经理"
    assert result.position_overview.company == "字节跳动"
    assert result.core_responsibilities
    assert result.user_match.score == 0


def test_manager_jd_fallback():
    jd = "AI产品负责人：负责AI产品战略、团队管理、商业化目标、跨部门资源协调，要求8年以上产品经验和团队管理经验。"
    title = _guess_title_from_jd(jd)
    assert title and "负责人" in title
    result = _fallback_analysis(
        jd_text=jd,
        position=title,
        company=None,
        memory_context="工作年限：5年",
    )
    assert result.position_overview.level and "负责" in result.position_overview.level
    blob = " ".join(result.core_responsibilities + result.user_match.gaps)
    assert "战略" in blob or "管理" in blob or "商业化" in blob
    assert any("年" in g for g in result.user_match.gaps)


def test_unknown_position_marked_failed():
    bad = JobAnalysisResult(
        position_overview=PositionOverview(position="未知", summary="解析失败"),
        core_responsibilities=[],
    )
    assert _is_failed_analysis(bad)


if __name__ == "__main__":
    test_clue_only_fallback()
    test_manager_jd_fallback()
    test_unknown_position_marked_failed()
    print("job agent tests OK")
