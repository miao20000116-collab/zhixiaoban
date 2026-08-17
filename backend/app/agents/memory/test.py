"""Memory service unit tests — constraints & year correction."""

from app.agents.memory.schema import MemoryExtraction
from app.memory.service import (
    _extract_corrected_years,
    _merge_summary_preserving_constraints,
    format_extraction_summary,
    rule_based_extractions,
)


def test_constraint_rule_extraction():
    text = "我没有真实RAG项目经验，只是上过一门RAG课程。"
    items = rule_based_extractions(text)
    assert any(i.type == "constraint_memory" for i in items)
    constraint = next(i for i in items if i.type == "constraint_memory")
    assert "RAG" in str(constraint.data.get("constraint"))


def test_experience_rule_extraction():
    text = "我之前负责浏览器用户增长，负责DAU提升和用户留存优化。"
    items = rule_based_extractions(text)
    assert any(i.type in ("experience", "project") for i in items)


def test_year_correction_prefers_new_value():
    text = "纠正一下，我的工作年限不是3年，是5年。"
    assert _extract_corrected_years(text) == 5


def test_summary_preserves_constraints():
    existing = "增长产品经理\n【约束】没有真实RAG项目经验，只上过课程"
    merged = _merge_summary_preserving_constraints(existing, "浏览器增长；目标：AI产品经理")
    assert "【约束】" in merged
    assert "没有真实RAG" in merged
    assert "浏览器增长" in merged


def test_format_constraint_summary():
    items = [
        MemoryExtraction(
            type="constraint_memory",
            importance_score=10,
            data={"constraint": "没有真实RAG项目经验"},
        )
    ]
    text = format_extraction_summary(items)
    assert "约束" in text
    assert "RAG" in text


if __name__ == "__main__":
    test_constraint_rule_extraction()
    test_experience_rule_extraction()
    test_year_correction_prefers_new_value()
    test_summary_preserves_constraints()
    test_format_constraint_summary()
    print("memory service tests OK")
