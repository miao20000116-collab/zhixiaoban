"""Load and run Evaluation Dataset regression cases."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.agents.evaluation.agent import EvaluationAgent
from app.agents.evaluation.schema import EvaluationResult
from app.agents.job.schema import JobAnalysisResult
from app.agents.resume.schema import ResumeOptimizeResult

DATASETS_DIR = Path(__file__).resolve().parent / "datasets"


def list_datasets() -> list[dict[str, Any]]:
    results = []
    if not DATASETS_DIR.exists():
        return results
    for path in sorted(DATASETS_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        results.append(
            {
                "id": path.stem,
                "name": data.get("name", path.stem),
                "description": data.get("description", ""),
                "case_count": len(data.get("cases", [])),
            }
        )
    return results


def load_dataset(dataset_id: str) -> dict[str, Any]:
    path = DATASETS_DIR / f"{dataset_id}.json"
    if not path.exists():
        raise FileNotFoundError(f"Dataset not found: {dataset_id}")
    return json.loads(path.read_text(encoding="utf-8"))


async def run_dataset(dataset_id: str, *, limit: int | None = None) -> dict[str, Any]:
    """Run Evaluation Agent against golden cases; return pass/fail summary."""
    data = load_dataset(dataset_id)
    cases = data.get("cases", [])
    if limit is not None:
        cases = cases[:limit]

    agent = EvaluationAgent()
    results: list[dict[str, Any]] = []
    passed = 0

    for case in cases:
        case_id = case.get("id", "unknown")
        kind = case.get("kind", "resume")
        expected_risk = case.get("expected_risk_level")
        expect_fabricated = case.get("expect_fabricated", None)

        try:
            evaluation = await _run_case(agent, kind, case)
            ok, reason = _check_expectation(evaluation, expected_risk, expect_fabricated)
            if ok:
                passed += 1
            results.append(
                {
                    "id": case_id,
                    "passed": ok,
                    "reason": reason,
                    "expected_risk_level": expected_risk,
                    "actual_risk_level": evaluation.risk_level,
                    "score": evaluation.score,
                    "fabricated_claims": evaluation.fabricated_claims,
                }
            )
        except Exception as exc:  # noqa: BLE001
            results.append(
                {
                    "id": case_id,
                    "passed": False,
                    "reason": f"error: {exc}",
                    "expected_risk_level": expected_risk,
                    "actual_risk_level": None,
                }
            )

    total = len(cases)
    return {
        "dataset_id": dataset_id,
        "name": data.get("name", dataset_id),
        "total": total,
        "passed": passed,
        "failed": total - passed,
        "pass_rate": round(passed / total, 3) if total else 0.0,
        "results": results,
    }


async def _run_case(agent: EvaluationAgent, kind: str, case: dict[str, Any]) -> EvaluationResult:
    if kind == "resume":
        output = case.get("output", {})
        if isinstance(output, dict) and "optimized_resume" in output:
            result = ResumeOptimizeResult.model_validate(output)
            return await agent.evaluate_resume_optimize(
                result,
                resume_text=case.get("source_text", ""),
                jd_text=case.get("jd_text"),
                target_position=case.get("target_position"),
            )
        return await agent.evaluate_resume_output(
            output_json=json.dumps(output, ensure_ascii=False),
            source_text=case.get("source_text", ""),
            jd_text=case.get("jd_text"),
            target_position=case.get("target_position"),
            task=case.get("task", "optimize"),
        )

    if kind == "job":
        analysis = JobAnalysisResult.model_validate(case.get("analysis", {}))
        return await agent.evaluate_job_analysis(
            analysis,
            jd_text=case.get("jd_text"),
            search_context=case.get("search_context", ""),
        )

    if kind == "interview_answer":
        scores = await agent.evaluate_interview_answer(
            question=case.get("question", ""),
            answer=case.get("answer", ""),
            position=case.get("position"),
            jd_text=case.get("jd_text"),
            resume_text=case.get("resume_text"),
        )
        # Map to EvaluationResult for unified expectation checks
        risk = "low"
        if scores.authenticity < 50:
            risk = "high"
        elif scores.authenticity < 70:
            risk = "medium"
        return EvaluationResult(
            risk_level=risk,  # type: ignore[arg-type]
            score=scores.overall,
            problems=scores.comments,
            suggestions=[],
            fabricated_claims=scores.comments if risk != "low" else [],
        )

    if kind == "career_gap":
        return await agent.evaluate_career_gap(
            gap_json=json.dumps(case.get("gap", {}), ensure_ascii=False, indent=2),
            memory_context=case.get("memory_context", ""),
            target_jd=case.get("target_jd") or case.get("jd_text"),
            target_position=case.get("target_position") or case.get("position"),
        )

    if kind == "recommendation":
        return await agent.evaluate_recommendation(
            plan_json=json.dumps(case.get("plan", {}), ensure_ascii=False, indent=2),
            memory_context=case.get("memory_context", ""),
            gap_context=case.get("gap_context", ""),
            task_context=case.get("task_context", ""),
        )

    raise ValueError(f"Unsupported case kind: {kind}")


def _check_expectation(
    evaluation: EvaluationResult,
    expected_risk: str | None,
    expect_fabricated: bool | None,
) -> tuple[bool, str]:
    if expected_risk and evaluation.risk_level != expected_risk:
        # Allow medium when expecting high (conservative detection still counts)
        if expected_risk == "high" and evaluation.risk_level == "medium":
            if expect_fabricated is True and evaluation.fabricated_claims:
                return True, "detected as medium with fabricated claims"
        return False, f"risk expected {expected_risk}, got {evaluation.risk_level}"

    if expect_fabricated is True and not evaluation.fabricated_claims:
        return False, "expected fabricated_claims but got none"
    if expect_fabricated is False and evaluation.fabricated_claims:
        return False, f"unexpected fabricated_claims: {evaluation.fabricated_claims}"

    return True, "ok"
