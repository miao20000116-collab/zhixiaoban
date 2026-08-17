"""Batch answer-quality verification for 职小伴 Agents.

Validates whether model answers are actually usable (not just HTTP 200).

Usage (from repo root or backend/):
  python backend/scripts/run_answer_quality.py
  python backend/scripts/run_answer_quality.py --mode live
  python backend/scripts/run_answer_quality.py --mode offline
  python backend/scripts/run_answer_quality.py --limit 3 --no-bad-case

Outputs:
  - console PASS/WARNING/FAIL per case
  - docs/quality/answer_quality_report.md
  - docs/quality/answer_quality_results.json
  - docs/quality/bad_cases_import.json (and optional POST /evaluation/bad-cases)
"""

from __future__ import annotations

import argparse
import json
import socket
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
SUITE_PATH = BACKEND / "app" / "evaluation" / "quality_suite" / "answer_quality_cases.json"
OUT_DIR = ROOT / "docs" / "quality"
REPORT_MD = OUT_DIR / "answer_quality_report.md"
RESULTS_JSON = OUT_DIR / "answer_quality_results.json"
BAD_IMPORT_JSON = OUT_DIR / "bad_cases_import.json"

if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.evaluation.quality_scorer import (  # noqa: E402
    build_bad_case_payload,
    contains_any,
    contains_forbidden,
    score_dimensions,
    verdict_from_scores,
)

DEFAULT_BASE = "http://127.0.0.1:8000"
# Isolated guest identity so live runs do not pollute the default dev user memory.
TEST_USER_ID = f"quality-suite-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"


def _auth_headers(extra: dict[str, str] | None = None) -> dict[str, str]:
    headers = {"X-Test-User": TEST_USER_ID}
    if extra:
        headers.update(extra)
    return headers


def port_open(host: str, port: int, timeout: float = 0.6) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def http_json(
    method: str,
    url: str,
    body: dict | None = None,
    timeout: float = 180.0,
) -> tuple[int, Any]:
    data = None
    headers: dict[str, str] = _auth_headers({"Accept": "application/json"})
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(detail)
        except Exception:
            parsed = {"detail": detail}
        return exc.code, parsed


def stream_chat(base: str, conversation_id: str, message: str, timeout: int = 180) -> str:
    body = json.dumps(
        {"conversation_id": conversation_id, "message": message},
        ensure_ascii=False,
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{base}/chat",
        data=body,
        method="POST",
        headers=_auth_headers(
            {"Content-Type": "application/json", "Accept": "text/event-stream"}
        ),
    )
    with urllib.request.urlopen(request, timeout=timeout) as resp:
        chunks: list[str] = []
        while True:
            buf = resp.read(8192)
            if not buf:
                break
            chunks.append(buf.decode("utf-8", errors="replace"))
        return "".join(chunks)


def load_suite() -> dict[str, Any]:
    return json.loads(SUITE_PATH.read_text(encoding="utf-8"))


def resolve_fixtures(value: Any, fixtures: dict[str, str]) -> Any:
    if isinstance(value, str):
        out = value
        for key, text in fixtures.items():
            out = out.replace(f"{{{{{key}}}}}", text)
        return out
    if isinstance(value, list):
        return [resolve_fixtures(v, fixtures) for v in value]
    if isinstance(value, dict):
        return {k: resolve_fixtures(v, fixtures) for k, v in value.items()}
    return value


def create_conversation(base: str, title: str) -> str:
    status, data = http_json("POST", f"{base}/conversation", {"title": title})
    if status >= 400 or not data or "id" not in data:
        raise RuntimeError(f"create conversation failed: {status} {data}")
    return str(data["id"])


def run_offline_eval(base: str | None, payload: dict[str, Any]) -> dict[str, Any]:
    """Prefer HTTP /evaluation/check; fall back to in-process EvaluationAgent."""
    if base and port_open("127.0.0.1", 8000):
        status, data = http_json("POST", f"{base}/evaluation/check", payload, timeout=120)
        if status < 400 and isinstance(data, dict):
            return data.get("evaluation") or data

    import asyncio

    from app.agents.evaluation.agent import EvaluationAgent

    agent = EvaluationAgent()
    return asyncio.run(agent.run(payload))


def evaluate_live_output(base: str, kind: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    body = {"kind": kind, **payload}
    status, data = http_json("POST", f"{base}/evaluation/check", body, timeout=120)
    if status >= 400:
        return {"risk_level": "medium", "score": 50, "problems": [f"evaluation API {status}: {data}"]}
    if isinstance(data, dict):
        return data.get("evaluation") or data
    return None


# ---------- case runners ----------


def run_job_case(base: str, case: dict, ctx: dict) -> dict[str, Any]:
    ui = case["user_input"]
    cid = create_conversation(base, f"QA-{case['case_id']}")
    ctx["conversation_id"] = cid
    body = {k: v for k, v in ui.items() if v is not None}
    body["conversation_id"] = cid
    status, data = http_json("POST", f"{base}/job/analyze", body, timeout=180)
    if status >= 400:
        return {"ok": False, "error": data, "output_text": "", "raw": data}

    analysis = (data or {}).get("analysis") or data
    markdown = (data or {}).get("markdown") or ""
    evaluation = (data or {}).get("evaluation")
    if not evaluation and isinstance(analysis, dict):
        evaluation = evaluate_live_output(
            base,
            "job",
            {"analysis": analysis, "jd_text": ui.get("jd_text"), "search_context": ""},
        )
    output_text = markdown or json.dumps(analysis, ensure_ascii=False)
    ctx["last_job"] = data
    return {
        "ok": True,
        "output_text": output_text,
        "raw": data,
        "evaluation": evaluation,
        "analysis": analysis,
    }


def run_resume_case(base: str, case: dict, ctx: dict) -> dict[str, Any]:
    ui = case["user_input"]
    cid = ctx.get("conversation_id") or create_conversation(base, f"QA-{case['case_id']}")
    ctx["conversation_id"] = cid
    body = {
        "resume_text": ui["resume_text"],
        "target_position": ui.get("target_position"),
        "jd_text": ui.get("jd_text"),
        "conversation_id": cid,
    }
    status, data = http_json("POST", f"{base}/resume/optimize", body, timeout=180)
    if status >= 400:
        return {"ok": False, "error": data, "output_text": "", "raw": data}
    result = (data or {}).get("result") or data
    markdown = (data or {}).get("markdown") or ""
    evaluation = (data or {}).get("evaluation")
    if not evaluation:
        evaluation = evaluate_live_output(
            base,
            "resume",
            {
                "output": result if isinstance(result, dict) else {"optimized_resume": markdown},
                "source_text": ui["resume_text"],
                "jd_text": ui.get("jd_text"),
                "target_position": ui.get("target_position"),
                "task": "optimize",
            },
        )
    output_text = markdown or json.dumps(result, ensure_ascii=False)
    ctx["last_resume"] = data
    return {"ok": True, "output_text": output_text, "raw": data, "evaluation": evaluation, "result": result}


def run_interview_start(base: str, case: dict, ctx: dict) -> dict[str, Any]:
    ui = case["user_input"]
    cid = create_conversation(base, f"QA-{case['case_id']}")
    ctx["conversation_id"] = cid
    body = {
        "conversation_id": cid,
        "position": ui.get("position"),
        "jd_text": ui.get("jd_text"),
        "resume_text": ui.get("resume_text"),
        "mode": ui.get("mode") or "full",
    }
    status, data = http_json("POST", f"{base}/interview/start", body, timeout=180)
    if status >= 400:
        return {"ok": False, "error": data, "output_text": "", "raw": data}
    ctx["interview_session_id"] = (data or {}).get("id")
    markdown = (data or {}).get("markdown") or ""
    turn = (data or {}).get("turn") or {}
    output_text = markdown or json.dumps(turn, ensure_ascii=False)
    return {"ok": True, "output_text": output_text, "raw": data, "evaluation": (data or {}).get("evaluation")}


def run_interview_answer(base: str, case: dict, ctx: dict) -> dict[str, Any]:
    sid = ctx.get("interview_session_id")
    if not sid:
        # start a fresh session if dependency missing
        start_case = {
            "case_id": case["case_id"] + "_auto_start",
            "user_input": {
                "position": "AI产品经理",
                "mode": "full",
                "resume_text": case.get("_fixtures", {}).get("persona_resume", ""),
            },
        }
        started = run_interview_start(base, start_case, ctx)
        if not started.get("ok"):
            return started
        sid = ctx.get("interview_session_id")
    body = {"message": case["user_input"]["message"]}
    status, data = http_json("POST", f"{base}/interview/{sid}/answer", body, timeout=180)
    if status >= 400:
        return {"ok": False, "error": data, "output_text": "", "raw": data}
    markdown = (data or {}).get("markdown") or ""
    turn = (data or {}).get("turn") or {}
    output_text = markdown or json.dumps(turn, ensure_ascii=False)
    return {"ok": True, "output_text": output_text, "raw": data, "evaluation": (data or {}).get("evaluation")}


def run_interview_questions(base: str, case: dict, ctx: dict) -> dict[str, Any]:
    ui = case["user_input"]
    status, data = http_json("POST", f"{base}/interview/questions", ui, timeout=180)
    if status >= 400:
        return {"ok": False, "error": data, "output_text": "", "raw": data}
    markdown = (data or {}).get("markdown") or ""
    questions = (data or {}).get("questions") or data
    output_text = markdown or json.dumps(questions, ensure_ascii=False)
    return {"ok": True, "output_text": output_text, "raw": data}


def run_memory_case(base: str, case: dict, ctx: dict) -> dict[str, Any]:
    cid = create_conversation(base, f"QA-{case['case_id']}")
    ctx["conversation_id"] = cid
    msg = case["user_input"]["message"]
    sse = stream_chat(base=base, conversation_id=cid, message=msg)
    profile_status, profile = http_json("GET", f"{base}/profile")
    profile_blob = json.dumps(profile, ensure_ascii=False) if profile_status < 400 else ""
    output_text = sse + "\n" + profile_blob
    ctx["memory_seeded"] = True
    return {
        "ok": "event: error" not in sse,
        "output_text": output_text,
        "raw": {"sse_preview": sse[:2000], "profile": profile},
        "sse": sse,
        "profile_blob": profile_blob,
    }


def run_gap_case(base: str, case: dict, ctx: dict) -> dict[str, Any]:
    if "seed_memory_via_chat" in (case.get("setup") or []) and not ctx.get("memory_seeded"):
        seed = {
            "case_id": "seed_memory",
            "user_input": {"message": case.get("_fixtures", {}).get("persona_memory_message", "")},
        }
        if seed["user_input"]["message"]:
            run_memory_case(base, seed, ctx)

    ui = case.get("user_input") or {}
    status, data = http_json("POST", f"{base}/career/gap/analyze", ui, timeout=180)
    if status >= 400:
        return {"ok": False, "error": data, "output_text": "", "raw": data}
    gap = (data or {}).get("gap") or {}
    markdown = (data or {}).get("markdown") or ""
    evaluation = gap.get("evaluation") if isinstance(gap, dict) else None
    if not evaluation and gap and not case.get("expect_not_applicable_or_zero"):
        memory_ctx = ""
        ps, profile = http_json("GET", f"{base}/profile")
        if ps < 400:
            memory_ctx = json.dumps(profile, ensure_ascii=False)[:4000]
        evaluation = evaluate_live_output(
            base,
            "career_gap",
            {
                "gap": gap,
                "memory_context": memory_ctx,
                "target_jd": ui.get("target_jd"),
                "target_position": ui.get("target_position"),
            },
        )
    output_text = markdown or json.dumps(gap, ensure_ascii=False)
    return {"ok": True, "output_text": output_text, "raw": data, "evaluation": evaluation, "gap": gap}


def run_task_after_job(base: str, case: dict, ctx: dict) -> dict[str, Any]:
    job_result = run_job_case(base, case, ctx)
    if not job_result.get("ok"):
        return job_result
    status, tasks = http_json("GET", f"{base}/career/tasks")
    if status >= 400:
        return {"ok": False, "error": tasks, "output_text": "", "raw": tasks}
    active = (tasks or {}).get("active")
    output_text = json.dumps(tasks, ensure_ascii=False)
    ctx["task_snapshot"] = tasks
    return {
        "ok": True,
        "output_text": output_text,
        "raw": {"job": job_result.get("raw"), "tasks": tasks},
        "active_task": active,
        "evaluation": job_result.get("evaluation"),
    }


def run_task_after_resume(base: str, case: dict, ctx: dict) -> dict[str, Any]:
    if not ctx.get("conversation_id"):
        # ensure prior job task path
        prior = {
            "case_id": "task_auto_job",
            "user_input": {
                "jd_text": case["user_input"].get("jd_text"),
                "position": case["user_input"].get("target_position") or "AI产品经理",
                "company": "示例科技",
            },
        }
        run_task_after_job(base, prior, ctx)
    resume_result = run_resume_case(base, case, ctx)
    if not resume_result.get("ok"):
        return resume_result
    status, tasks = http_json("GET", f"{base}/career/tasks")
    output_text = json.dumps(tasks, ensure_ascii=False)
    return {
        "ok": status < 400,
        "output_text": output_text,
        "raw": {"resume": resume_result.get("raw"), "tasks": tasks},
        "active_task": (tasks or {}).get("active") if isinstance(tasks, dict) else None,
        "evaluation": resume_result.get("evaluation"),
    }


# ---------- judgment ----------


def judge_case(case: dict, run_out: dict[str, Any]) -> dict[str, Any]:
    reasons: list[str] = []
    rule_flags: dict[str, Any] = {}
    hard_fail = False
    output_text = run_out.get("output_text") or ""
    evaluation = run_out.get("evaluation") or {}

    if not run_out.get("ok", True):
        hard_fail = True
        reasons.append(f"接口/执行失败: {run_out.get('error')}")
        rule_flags["accuracy_fail"] = True

    forbidden_hit = contains_forbidden(output_text, case.get("forbidden_phrases"))
    if forbidden_hit:
        hard_fail = True
        reasons.append(f"命中禁止表述: {forbidden_hit}")
        rule_flags["forbidden_hit"] = True

    # Module-specific rules
    module = case.get("module")
    agent = case.get("agent")

    if case.get("expect_not_applicable_or_zero"):
        gap = run_out.get("gap") or {}
        score = gap.get("match_score")
        risk = (gap.get("evaluation") or {}).get("risk_level")
        ok_empty = (score in (0, 0.0, None) and not gap.get("strengths")) or risk == "not_applicable"
        if ok_empty:
            reasons.append("空输入正确降级为暂不评分/0分")
            rule_flags.update({"accuracy_ok": True, "truth_bonus": 90, "actionable": True})
        else:
            hard_fail = True
            reasons.append(f"空输入仍给出可疑结果 match_score={score} risk={risk}")
            rule_flags["accuracy_fail"] = True

    if agent == "memory":
        req = case.get("required_keywords_any")
        if req and not contains_any(output_text, req):
            hard_fail = True
            reasons.append(f"未覆盖关键职业关键词: {req}")
            rule_flags["accuracy_fail"] = True
        else:
            rule_flags["relevant"] = True
            rule_flags["accuracy_ok"] = True
        creq = case.get("required_constraint_keywords_any")
        if creq and not contains_any(output_text, creq):
            # warning-level unless hard constraint case
            if case["case_id"].startswith("memory_02"):
                hard_fail = True
            reasons.append(f"约束相关表述不足: {creq}")
            rule_flags["truth_bonus"] = 50
        elif creq:
            rule_flags["truth_bonus"] = 90
        sse = run_out.get("sse") or ""
        if "请上传或粘贴简历" in sse:
            hard_fail = True
            reasons.append("误路由到简历上传")
            rule_flags["off_topic"] = True
        if "解析失败" in output_text:
            hard_fail = True
            reasons.append("出现解析失败文案")

    if agent == "task_memory":
        active = run_out.get("active_task")
        if not active:
            hard_fail = True
            reasons.append("无 active task")
            rule_flags["not_actionable"] = True
        else:
            goal = str(active.get("goal") or "")
            next_action = str(active.get("next_action") or "")
            if len(goal) < 4:
                reasons.append("goal 过短")
                rule_flags["too_vague"] = True
            if not next_action:
                hard_fail = True
                reasons.append("next_action 为空")
                rule_flags["not_actionable"] = True
            else:
                rule_flags["actionable"] = True
                rule_flags["relevant"] = True
            completed = active.get("completed_steps") or []
            if case["case_id"].endswith("after_resume") or "progress_after_resume" in case["case_id"]:
                blob = json.dumps(active, ensure_ascii=False)
                if "简历" not in blob and "optimize" not in blob.lower() and not completed:
                    reasons.append("简历步骤未见推进迹象")
                    rule_flags["too_vague"] = True

    if agent == "interview":
        if "解析失败" in output_text:
            hard_fail = True
            reasons.append("面试输出含解析失败")
        if contains_any(output_text, ["AI产品", "产品经理", "LLM", "Agent", "评测", "增长", "A/B", "实验"]):
            rule_flags["relevant"] = True
            rule_flags["pm_fit"] = True
        else:
            reasons.append("面试内容缺少 AI PM / 经历相关信号")
            rule_flags["pm_fit_fail"] = True
        if "RAG" in output_text and "没有" not in output_text and case["case_id"].startswith("interview_02"):
            # soft: assuming RAG experience
            if "真实" not in output_text and "落地" in output_text:
                reasons.append("可能把用户无RAG经验当成已有能力")
                rule_flags["forbidden_hit"] = True

    if agent == "job":
        analysis = run_out.get("analysis") or {}
        blob = _safe_json(analysis)
        company = ((analysis.get("company_analysis") or {}) if isinstance(analysis, dict) else {})
        is_inferred = bool(company.get("is_inferred")) if isinstance(company, dict) else False
        fabricated_corp = any(
            x in blob for x in ["D轮", "垄断", "年营收千亿", "全球第一", "员工10万"]
        )
        if fabricated_corp and not is_inferred:
            hard_fail = True
            reasons.append("疑似虚构公司事实且未标推测")
            rule_flags["forbidden_hit"] = True
        if contains_any(blob + output_text, ["AI产品", "LLM", "Agent", "评测", "Prompt", "产品"]):
            rule_flags["relevant"] = True
        if "推测" in output_text or is_inferred or "信息" in output_text:
            rule_flags["truth_bonus"] = 80

    if agent == "resume":
        if "解析失败" in output_text:
            hard_fail = True
            reasons.append("简历优化解析失败")
        if contains_any(output_text, ["增长", "留存", "A/B", "实验", "指标", "评测", "missing"]):
            rule_flags["specific_ok"] = True
            rule_flags["actionable"] = True
        risk = evaluation.get("risk_level")
        claims = evaluation.get("fabricated_claims") or []
        # Hard-fail only when Evaluation marks medium/high with fabricated claims
        # (low + diagnosis-only notes should not fail a faithful optimized_resume).
        if claims and risk in {"high", "medium"}:
            hard_fail = True
            reasons.append(f"Evaluation 发现虚构: {claims[:3]}")
            rule_flags["forbidden_hit"] = True
        elif claims and risk == "low":
            reasons.append(f"Evaluation 提示虚构风险(low): {claims[:2]}")
        if risk == "high":
            hard_fail = True
            reasons.append("Evaluation risk_level=high")
        elif risk == "medium":
            reasons.append("Evaluation risk_level=medium")

    if agent == "career_gap" and not case.get("expect_not_applicable_or_zero"):
        gap = run_out.get("gap") or {}
        forbidden = contains_forbidden(output_text, case.get("forbidden_phrases"))
        packaging = any(k in output_text for k in ("包装为", "包装成", "写成实战", "当作落地"))
        claims = [str(c) for c in (evaluation.get("fabricated_claims") or [])]
        rag_fabricated = any("RAG" in c or "rag" in c.lower() for c in claims)
        risk = str(evaluation.get("risk_level") or "")
        if forbidden or packaging:
            hard_fail = True
            reasons.append("Gap 输出含禁止优势或包装式建议")
            rule_flags["forbidden_hit"] = True
        elif rag_fabricated and risk in {"medium", "high"}:
            hard_fail = True
            reasons.append(f"Gap 虚构 RAG 优势: {claims[:3]}")
            rule_flags["forbidden_hit"] = True
        elif risk == "high":
            hard_fail = True
            reasons.append("Gap Evaluation risk_level=high")
            rule_flags["forbidden_hit"] = True
        elif claims:
            reasons.append(f"Gap Evaluation 提示依据不足: {claims[:2]}")
        if gap.get("match_score") and not (gap.get("strengths") or gap.get("gaps") or gap.get("evidence")):
            hard_fail = True
            reasons.append("仅有分数缺少解释/evidence")
            rule_flags["too_vague"] = True
        if gap.get("recommendations") or gap.get("gaps"):
            rule_flags["actionable"] = True
            rule_flags["specific_ok"] = True

    # Offline anti-hallucination detection success
    if case.get("module") == "反幻觉测试":
        risk = str(evaluation.get("risk_level") or "")
        expect_risk = case.get("expect_risk_in") or []
        fabricated = evaluation.get("fabricated_claims") or []
        authenticity = evaluation.get("authenticity")
        detection_ok = True
        if expect_risk and risk not in expect_risk:
            # interview_answer mapped authenticity
            if case.get("expect_low_authenticity") and authenticity is not None:
                detection_ok = int(authenticity) < 70
            else:
                detection_ok = False
                reasons.append(f"期望风险 {expect_risk}，实际 {risk}")
        if case.get("expect_fabricated") and not fabricated:
            # authenticity path may not fill fabricated_claims
            if not (case.get("expect_low_authenticity") and authenticity is not None and int(authenticity) < 70):
                detection_ok = False
                reasons.append("期望检出 fabricated_claims 但为空")
        if case.get("expect_low_authenticity"):
            if authenticity is None or int(authenticity) >= 70:
                # also accept overall risk high from wrapper
                if risk not in {"high", "medium"}:
                    detection_ok = False
                    reasons.append(f"authenticity 未明显偏低: {authenticity}")
        rule_flags["detection_ok"] = detection_ok
        if detection_ok:
            reasons.append("反幻觉检测生效")
            rule_flags["accuracy_ok"] = True
        else:
            hard_fail = True
            reasons.append("反幻觉检测失败（放过了坏样本）")

    if evaluation:
        rule_flags.setdefault("risk_level", evaluation.get("risk_level"))
        rule_flags.setdefault("score", evaluation.get("score"))
        if "authenticity" in evaluation:
            rule_flags["authenticity"] = evaluation.get("authenticity")

    scores = score_dimensions(
        case=case,
        output_text=output_text,
        evaluation=evaluation if isinstance(evaluation, dict) else {},
        rule_flags=rule_flags,
    )
    verdict, avg = verdict_from_scores(
        scores,
        pass_threshold=int(case.get("pass_threshold") or 70),
        warn_threshold=int(case.get("warn_threshold") or 55),
        hard_fail=hard_fail,
    )
    if not reasons:
        reasons.append("未触发失败规则，按维度均分判定")

    return {
        "verdict": verdict,
        "avg_score": avg,
        "dimension_scores": scores,
        "reasons": reasons,
        "evaluation": evaluation,
        "hard_fail": hard_fail,
    }


def _safe_json(obj: Any) -> str:
    try:
        return json.dumps(obj, ensure_ascii=False)
    except Exception:
        return str(obj)


# ---------- report ----------


def write_report(suite: dict, results: list[dict[str, Any]], meta: dict[str, Any]) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    total = len(results)
    passed = sum(1 for r in results if r["verdict"] == "PASS")
    warned = sum(1 for r in results if r["verdict"] == "WARNING")
    failed = sum(1 for r in results if r["verdict"] == "FAIL")
    pass_rate = round(passed / total, 3) if total else 0.0

    by_module: dict[str, list[dict]] = {}
    for r in results:
        by_module.setdefault(r["module"], []).append(r)

    module_lines = []
    for mod, rows in by_module.items():
        avg = round(sum(x["avg_score"] for x in rows) / len(rows), 1)
        p = sum(1 for x in rows if x["verdict"] == "PASS")
        module_lines.append(f"| {mod} | {len(rows)} | {p} | {avg} |")

    fail_rows = [r for r in results if r["verdict"] != "PASS"]
    fail_md = []
    for r in fail_rows:
        fail_md.append(
            f"- **{r['case_id']}** ({r['module']}) — {r['verdict']} / {r['avg_score']}\n"
            f"  - 原因: {'; '.join(r['reasons'][:4])}\n"
            f"  - 维度: {r['dimension_scores']}"
        )

    # Typical bad cases: FAIL with authenticity / fabrication signals
    typical = [
        r
        for r in results
        if r["verdict"] == "FAIL"
        and (
            r.get("hard_fail")
            or any(("虚构" in x or "禁止" in x or "幻觉" in x) for x in r.get("reasons", []))
        )
    ][:5]
    if not typical:
        typical = [r for r in results if r["verdict"] == "FAIL"][:3]

    typical_md = []
    for r in typical:
        preview = (r.get("output_preview") or "")[:280].replace("\n", " ")
        typical_md.append(
            f"### {r['case_id']}\n"
            f"- 模块: {r['module']}\n"
            f"- 均分: {r['avg_score']} / 判定: {r['verdict']}\n"
            f"- 原因: {'; '.join(r['reasons'][:5])}\n"
            f"- 输出摘要: `{preview}`\n"
        )

    # Causes & suggestions derived from failures
    causes = []
    suggestions = []
    priorities = []
    fail_modules = {r["module"] for r in results if r["verdict"] == "FAIL"}
    if "简历优化" in fail_modules or any("RAG" in "".join(r["reasons"]) for r in results if r["verdict"] != "PASS"):
        causes.append("简历优化可能仍会越界包装或未严格遵守约束记忆。")
        suggestions.append("强化 Resume Prompt：约束记忆优先；禁止新增指标/职级；missing_information 必填。")
        priorities.append("P0 Resume Agent / resume prompt.md")
    if "Career Gap Analysis" in fail_modules:
        causes.append("Gap 分析可能缺少 evidence，或把未证实能力写成优势。")
        suggestions.append("Gap Prompt 强制 strengths/gaps 绑定 memory/JD 原文摘录。")
        priorities.append("P0 Career Gap Agent")
    if "反幻觉测试" in fail_modules:
        causes.append("Evaluation 对坏样本检出不稳。")
        suggestions.append("收紧 Evaluation 启发式与 prompt 中的 fabricated_claims 规则。")
        priorities.append("P0 Evaluation Agent")
    if "模拟面试" in fail_modules:
        causes.append("面试开场/追问与 AI PM 场景或用户约束贴合不足。")
        suggestions.append("Interview Prompt：首问绑定 JD+简历事实；禁止假设用户有未声明技术栈。")
        priorities.append("P1 Interview Agent")
    if "Task Memory" in fail_modules:
        causes.append("任务记忆在 JD/简历链路后未稳定落库或 next_action 空。")
        suggestions.append("检查 create_or_update_task 在 job/resume API 的调用与步骤别名。")
        priorities.append("P1 Task Memory")
    if "Career Memory" in fail_modules:
        causes.append("记忆提取或约束保留不稳定，或意图误路由。")
        suggestions.append("巩固 Memory 路由与 constraint_memory 规则抽取。")
        priorities.append("P1 Memory Agent")
    if not causes:
        causes.append("本轮未发现系统性失败；仍需关注 WARNING 中的空泛建议与中风险输出。")
        suggestions.append("把 WARNING case 纳入下一轮 Prompt 回归；补充更多真实 JD 夹具。")
        priorities.append("P2 扩展质量用例覆盖面")

    # Deduplicate priorities keeping order
    seen = set()
    prio_unique = []
    for p in priorities:
        if p not in seen:
            seen.add(p)
            prio_unique.append(p)

    now = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S %z")
    md = f"""# 模型回答质量验证报告

> 生成时间：{now}
> 数据集：{suite.get('name')} v{suite.get('version')}
> 运行模式：{meta.get('mode')} | API：{meta.get('base')} | 后端可用：{meta.get('backend_up')}

## 1. 总体通过率

| 指标 | 值 |
|------|----|
| 总用例 | {total} |
| PASS | {passed} |
| WARNING | {warned} |
| FAIL | {failed} |
| 通过率 (PASS/总) | {pass_rate:.1%} |
| PASS+WARNING 占比 | {((passed + warned) / total if total else 0):.1%} |

## 2. 各模块得分

| 模块 | 用例数 | PASS数 | 平均分 |
|------|--------|--------|--------|
{chr(10).join(module_lines)}

## 3. 失败 / 高风险 Case 列表

{chr(10).join(fail_md) if fail_md else "_本轮无 FAIL/WARNING_"}

## 4. 典型 Bad Case

{chr(10).join(typical_md) if typical_md else "_无_"}

## 5. 可能原因

{chr(10).join(f'- {c}' for c in causes)}

## 6. Prompt / Agent 优化建议

{chr(10).join(f'- {s}' for s in suggestions)}

## 7. 下一轮迭代优先级

{chr(10).join(f'{i+1}. {p}' for i, p in enumerate(prio_unique))}

## 8. 评分维度说明

每条用例按以下维度 0–100 打分（用例可裁剪维度）：

- 准确性
- 相关性
- 具体性
- 可执行性
- 真实性 / 是否幻觉
- 是否符合 AI 产品经理求职场景

判定：均分 ≥ pass_threshold 且无硬失败 → PASS；均分 ≥ warn_threshold → WARNING；否则 FAIL。
硬失败包括：禁止表述、空输入乱打高分、反幻觉漏检、关键接口失败等。

## 9. 产物路径

- 本报告：`docs/quality/answer_quality_report.md`
- 明细 JSON：`docs/quality/answer_quality_results.json`
- Bad Case 导入：`docs/quality/bad_cases_import.json`
- Dashboard：前端 `/dashboard`（若已写入 Bad Case）
"""
    REPORT_MD.write_text(md, encoding="utf-8")
    RESULTS_JSON.write_text(
        json.dumps({"meta": meta, "results": results, "pass_rate": pass_rate}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def post_bad_cases(base: str, payloads: list[dict[str, Any]]) -> int:
    written = 0
    for body in payloads:
        status, _ = http_json("POST", f"{base}/evaluation/bad-cases", body, timeout=30)
        if status < 400:
            written += 1
    return written


def main() -> int:
    parser = argparse.ArgumentParser(description="Run answer quality verification suite")
    parser.add_argument("--base", default=DEFAULT_BASE, help="Backend base URL")
    parser.add_argument(
        "--mode",
        choices=["auto", "live", "offline"],
        default="auto",
        help="auto=live if backend up else offline-only",
    )
    parser.add_argument("--limit", type=int, default=None, help="Only first N cases")
    parser.add_argument("--case-id", action="append", default=None, help="Filter case_id (repeatable)")
    parser.add_argument("--no-bad-case", action="store_true", help="Do not POST bad cases")
    args = parser.parse_args()

    suite = load_suite()
    fixtures = suite.get("fixtures") or {}
    cases = suite.get("cases") or []
    if args.case_id:
        wanted = set(args.case_id)
        cases = [c for c in cases if c.get("case_id") in wanted]
    if args.limit:
        cases = cases[: args.limit]

    backend_up = port_open("127.0.0.1", 8000)
    mode = args.mode
    if mode == "auto":
        mode = "live" if backend_up else "offline"

    print("=== 职小伴 模型回答质量验证 ===")
    print(f"suite: {SUITE_PATH}")
    print(f"mode={mode} backend_up={backend_up} base={args.base}")
    print(f"X-Test-User={TEST_USER_ID}")
    print(f"cases={len(cases)}")

    if mode == "live" and not backend_up:
        print("ERROR: live mode requires backend on :8000")
        return 2

    ctx: dict[str, Any] = {"_fixtures": fixtures}
    results: list[dict[str, Any]] = []
    bad_payloads: list[dict[str, Any]] = []
    case_index = {c["case_id"]: c for c in suite.get("cases") or []}

    for case in cases:
        case = resolve_fixtures(case, fixtures)
        case["_fixtures"] = fixtures
        cid = case["case_id"]
        print(f"\n-- {cid} [{case.get('module')}] ({case.get('mode')}) --")

        case_mode = case.get("mode") or "live"
        if mode == "offline" and case_mode == "live":
            print("[SKIP] live case in offline mode")
            continue
        if mode == "live" and case_mode == "offline":
            # still run offline anti-hallucination alongside live
            pass

        started = time.time()
        run_out: dict[str, Any]
        try:
            agent = case.get("agent")
            if case_mode == "offline" or agent == "evaluation":
                payload = dict(case.get("user_input") or {})
                run_eval = run_offline_eval(args.base if backend_up else None, payload)
                # Normalize interview_answer scores into risk-like fields
                if payload.get("kind") == "interview_answer":
                    auth = run_eval.get("authenticity", 70)
                    risk = "low"
                    if auth < 50:
                        risk = "high"
                    elif auth < 70:
                        risk = "medium"
                    run_eval = {
                        **run_eval,
                        "risk_level": risk,
                        "score": run_eval.get("overall", run_eval.get("score", 50)),
                        "fabricated_claims": run_eval.get("comments") if risk != "low" else [],
                        "authenticity": auth,
                    }
                run_out = {
                    "ok": True,
                    "output_text": json.dumps(run_eval, ensure_ascii=False),
                    "evaluation": run_eval,
                    "raw": run_eval,
                }
            elif agent == "job":
                run_out = run_job_case(args.base, case, ctx)
            elif agent == "resume":
                run_out = run_resume_case(args.base, case, ctx)
            elif agent == "interview" and cid.endswith("question_bank"):
                run_out = run_interview_questions(args.base, case, ctx)
            elif agent == "interview" and "answer" in cid:
                dep = case.get("depends_on")
                if dep and not ctx.get("interview_session_id"):
                    dep_case = resolve_fixtures(case_index.get(dep, {}), fixtures)
                    if dep_case:
                        dep_case["_fixtures"] = fixtures
                        run_interview_start(args.base, dep_case, ctx)
                run_out = run_interview_answer(args.base, case, ctx)
            elif agent == "interview":
                run_out = run_interview_start(args.base, case, ctx)
            elif agent == "memory":
                run_out = run_memory_case(args.base, case, ctx)
            elif agent == "career_gap":
                run_out = run_gap_case(args.base, case, ctx)
            elif agent == "task_memory" and "progress_after_resume" in cid:
                run_out = run_task_after_resume(args.base, case, ctx)
            elif agent == "task_memory":
                run_out = run_task_after_job(args.base, case, ctx)
            else:
                run_out = {"ok": False, "error": f"unknown agent {agent}", "output_text": ""}
        except Exception as exc:  # noqa: BLE001
            run_out = {"ok": False, "error": str(exc), "output_text": ""}

        judged = judge_case(case, run_out)
        elapsed = round(time.time() - started, 1)
        row = {
            "case_id": cid,
            "module": case.get("module"),
            "agent": case.get("agent"),
            "verdict": judged["verdict"],
            "avg_score": judged["avg_score"],
            "dimension_scores": judged["dimension_scores"],
            "reasons": judged["reasons"],
            "hard_fail": judged["hard_fail"],
            "evaluation": judged.get("evaluation"),
            "elapsed_sec": elapsed,
            "output_preview": (run_out.get("output_text") or "")[:600],
            "expected_output_features": case.get("expected_output_features"),
            "failure_criteria": case.get("failure_criteria"),
        }
        results.append(row)
        mark = judged["verdict"]
        print(f"[{mark}] avg={judged['avg_score']} dims={judged['dimension_scores']}")
        print(" reasons:", "; ".join(judged["reasons"][:3]))

        if mark in {"FAIL", "WARNING"}:
            bad_payloads.append(
                build_bad_case_payload(
                    case=case,
                    verdict=mark,
                    avg_score=judged["avg_score"],
                    scores=judged["dimension_scores"],
                    reasons=judged["reasons"],
                    output_preview=row["output_preview"],
                )
            )

    meta = {
        "mode": mode,
        "base": args.base,
        "backend_up": backend_up,
        "test_user": TEST_USER_ID,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "suite_version": suite.get("version"),
    }
    write_report(suite, results, meta)

    BAD_IMPORT_JSON.write_text(json.dumps(bad_payloads, ensure_ascii=False, indent=2), encoding="utf-8")
    written = 0
    if bad_payloads and not args.no_bad_case and backend_up:
        written = post_bad_cases(args.base, bad_payloads)
        print(f"\nBad cases POSTED: {written}/{len(bad_payloads)}")
    else:
        print(f"\nBad cases export only: {BAD_IMPORT_JSON} ({len(bad_payloads)})")

    passed = sum(1 for r in results if r["verdict"] == "PASS")
    print(f"\nDone. PASS {passed}/{len(results)}")
    print(f"Report: {REPORT_MD}")
    # Exit 1 if any FAIL
    return 1 if any(r["verdict"] == "FAIL" for r in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
