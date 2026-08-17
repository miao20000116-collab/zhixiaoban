"""Online E2E: Memory SSE write + empty gap + resume optimize."""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"


def req(method: str, path: str, body: dict | None = None, timeout: int = 180):
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        f"{BASE}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else None


def stream_chat(conversation_id: str, message: str, timeout: int = 180) -> str:
    body = json.dumps(
        {"conversation_id": conversation_id, "message": message},
        ensure_ascii=False,
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{BASE}/chat",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as resp:
        chunks: list[str] = []
        while True:
            buf = resp.read(8192)
            if not buf:
                break
            chunks.append(buf.decode("utf-8", errors="replace"))
        return "".join(chunks)


def main() -> None:
    print("== create conversation ==")
    conv = req("POST", "/conversation", {})
    cid = conv["id"]
    print("conversation_id=", cid)

    print("== empty gap ==")
    gap = req("POST", "/career/gap/analyze", {})
    assert gap["gap"]["match_score"] == 0
    assert gap["gap"]["evaluation"]["risk_level"] == "not_applicable"
    latest = req("GET", "/career/gap")
    assert latest.get("gap") is None
    print("OK empty gap cleared latest_gap")

    print("== memory SSE (unique fact) ==")
    stamp = int(time.time())
    msg = (
        f"补充一下：我在{stamp}年做过浏览器增长专项，"
        f"负责 DAU 提升和留存优化，主导过一次 A/B 实验把次日留存提高约 3%。"
    )
    sse = stream_chat(cid, msg)
    print(sse[:900])
    if "event: error" in sse:
        raise SystemExit("FAIL: SSE error event")
    if "请上传或粘贴简历" in sse:
        raise SystemExit("FAIL: misrouted to resume upload")
    if "Memory Agent" not in sse and "memory_update" not in sse:
        raise SystemExit("FAIL: did not route to Memory")
    if "memory_updated" not in sse:
        raise SystemExit("FAIL: missing memory_updated")
    if "event: done" not in sse:
        raise SystemExit("FAIL: missing done")
    print("OK memory route + memory_updated")

    print("== profile ==")
    profile = req("GET", "/profile")
    blob = json.dumps(profile, ensure_ascii=False)
    if not any(k in blob for k in ["DAU", "留存", "增长", "浏览器", str(stamp)]):
        print("WARN profile keywords missing:", blob[:500])
    else:
        print("OK profile contains memory keywords")

    print("== resume optimize ==")
    resume_text = (
        "苗晓荣\n产品经理 | 5年经验\n"
        "工作经历：负责浏览器用户增长，DAU与留存优化；主导 A/B 实验。\n"
        "项目：增长实验平台，负责需求与指标口径。\n"
        "约束：没有真实 RAG 项目经验，只上过 RAG 课程。"
    )
    try:
        opt = req(
            "POST",
            "/resume/optimize",
            {
                "resume_text": resume_text,
                "target_position": "AI产品经理",
                "conversation_id": cid,
            },
            timeout=180,
        )
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"FAIL resume optimize HTTP {exc.code}: {detail}") from exc

    opt_blob = json.dumps(opt, ensure_ascii=False)
    print(opt_blob[:700])
    if "解析失败" in opt_blob:
        raise SystemExit("FAIL resume optimize parse failure text")
    md = opt.get("markdown") or ""
    # Constraint should not invent hands-on RAG delivery
    bad_claims = ["落地多个RAG", "主导RAG系统上线", "独立搭建RAG生产"]
    if any(x in md for x in bad_claims):
        raise SystemExit(f"FAIL likely fabricated RAG experience in markdown")
    print("OK resume optimize")
    print("\nE2E PASSED")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print("E2E ERROR:", exc, file=sys.stderr)
        raise
