"""Master / chat intent heuristic tests (no live LLM)."""

from app.agents.master.agent import _fallback_classify
from app.agents.master.schema import MasterAgentResult
from app.services.chat_service import (
    _apply_content_intent_override,
    _looks_like_constraint_memory,
    _looks_like_memory_share,
    _wants_resume_work,
)


def test_memory_share_patterns():
    samples = [
        "我之前负责浏览器用户增长，负责DAU提升和用户留存优化。",
        "我做过一个新用户增长项目，负责用户分层、首页推荐入口和A/B实验。",
        "我的主要技能是需求分析、用户研究、数据分析、跨团队推进。",
        "我的目标岗位是AI产品经理，尤其想做AI Agent方向。",
        "纠正一下，我的工作年限不是3年，是5年。",
        "我没有真实RAG项目经验，只是上过一门RAG课程。",
    ]
    for s in samples:
        assert _looks_like_memory_share(s), s
        assert not _wants_resume_work(s), s


def test_constraint_beats_resume_verb():
    """memory_02: constraint + 优化简历 must still route to Memory."""
    msg = (
        "强调一下：我没有真实 RAG 项目经验，只上过 RAG 课程，"
        "后续优化简历和面试时不要虚构相关经历。"
    )
    assert _looks_like_constraint_memory(msg)
    assert _looks_like_memory_share(msg)
    assert not _wants_resume_work(msg)
    base = MasterAgentResult(intent="resume", confidence=0.95, need_agent="resume_agent")
    out = _apply_content_intent_override(msg, base)
    assert out.intent == "memory_update"
    assert _fallback_classify(msg).intent == "memory_update"


def test_override_routes_to_memory():
    msg = "我之前负责浏览器用户增长，负责DAU提升和用户留存优化。"
    base = MasterAgentResult(intent="resume", confidence=0.9, need_agent="resume_agent")
    out = _apply_content_intent_override(msg, base)
    assert out.intent == "memory_update"


def test_fallback_classify_memory_first():
    result = _fallback_classify("记住：我做过浏览器增长，DAU提升。")
    assert result.intent == "memory_update"


def test_short_skills_not_blocked_as_resume():
    """Messages with 技能 and length>=120 must still route to Memory when first-person."""
    # Pad to >=120 so looks_like_resume keyword path (技能 + len>=120) can trigger.
    msg = (
        "我的主要技能是需求分析、用户研究、数据分析、跨团队推进。"
        + ("补充职业事实请写入Memory。" * 6)
    )
    assert len(msg) >= 120
    assert _looks_like_memory_share(msg), msg
    assert not _wants_resume_work(msg), msg
    base = MasterAgentResult(intent="resume", confidence=0.9, need_agent="resume_agent")
    assert _apply_content_intent_override(msg, base).intent == "memory_update"


if __name__ == "__main__":
    test_memory_share_patterns()
    test_constraint_beats_resume_verb()
    test_override_routes_to_memory()
    test_fallback_classify_memory_first()
    test_short_skills_not_blocked_as_resume()
    print("master/chat memory intent tests OK")
