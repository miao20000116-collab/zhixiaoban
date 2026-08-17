"""Interview review fallback tests (no live LLM)."""

from app.agents.interview.agent import (
    _fallback_review_from_transcript,
    _is_failed_review,
    _personalized_opening,
)
from app.agents.interview.schema import InterviewReviewResult


def test_fallback_review_has_required_sections():
    transcript = [
        {"role": "assistant", "content": "请介绍自己"},
        {"role": "user", "content": "我负责浏览器增长，DAU和留存优化，通过A/B实验提升D1留存8%。"},
        {"role": "assistant", "content": "为什么这样设计？"},
        {"role": "user", "content": "因为要验证假设，所以用实验对比基线。"},
    ]
    review = _fallback_review_from_transcript(transcript, position="AI产品经理")
    assert "解析失败" not in " ".join(review.strengths + review.weaknesses + review.improvement_suggestions)
    assert len(review.strengths) >= 2
    assert len(review.weaknesses) >= 2
    assert len(review.improvement_suggestions) >= 3
    assert review.overall_score >= 50
    assert any("基于本轮对话" in s for s in review.stage_summary)


def test_failed_review_detected():
    bad = InterviewReviewResult(
        overall_score=60,
        strengths=[],
        weaknesses=["复盘解析失败"],
        improvement_suggestions=["请重新生成复盘"],
    )
    assert _is_failed_review(bad)


def test_personalized_opening_mentions_browser_growth():
    opening = _personalized_opening(
        mode="full",
        position="AI产品经理",
        memory_context="经历：浏览器用户增长，DAU提升和用户留存优化",
        resume_text=None,
    )
    assert "浏览器" in opening
    assert "增长" in opening or "DAU" in opening
    assert "AI产品经理" in opening


if __name__ == "__main__":
    test_fallback_review_has_required_sections()
    test_failed_review_detected()
    test_personalized_opening_mentions_browser_growth()
    print("interview tests OK")
