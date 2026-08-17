"""Smoke verification for handoff — no secrets printed.

Usage (from repo root or backend/):
  python backend/scripts/verify_smoke.py
  python scripts/verify_smoke.py
"""

from __future__ import annotations

import json
import socket
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
ENV_PATH = ROOT / ".env"

API = "http://127.0.0.1:8000"
FRONT = "http://127.0.0.1:3000"


def load_env_keys() -> dict[str, str]:
    env: dict[str, str] = {}
    if not ENV_PATH.exists():
        return env
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()
    return env


def port_open(host: str, port: int, timeout: float = 0.6) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def http_json(method: str, url: str, body: dict | None = None, timeout: float = 30.0):
    data = None
    headers = {}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
        ctype = resp.headers.get("Content-Type", "")
        if "json" in ctype or raw[:1] in (b"{", b"["):
            return resp.status, json.loads(raw.decode("utf-8"))
        return resp.status, raw


def check(name: str, ok: bool, detail: str = "") -> bool:
    mark = "PASS" if ok else "FAIL"
    suffix = f" — {detail}" if detail else ""
    print(f"[{mark}] {name}{suffix}")
    return ok


def main() -> int:
    print("=== 职小伴 smoke verify ===")
    print(f"root: {ROOT}")
    env = load_env_keys()

    results: list[bool] = []

    # Env presence (no values)
    text_key = bool(env.get("OPENAI_API_KEY") and "your-" not in env.get("OPENAI_API_KEY", ""))
    speech_key = bool(env.get("SPEECH_API_KEY") and "your-" not in env.get("SPEECH_API_KEY", ""))
    results.append(check(".env exists", ENV_PATH.exists()))
    results.append(
        check(
            "Text LLM key configured",
            text_key,
            f"base={env.get('OPENAI_API_BASE', '?')} model={env.get('MODEL_NAME', '?')}",
        )
    )
    results.append(
        check(
            "Speech key configured",
            speech_key,
            f"base={env.get('SPEECH_API_BASE', '?')} asr={env.get('WHISPER_MODEL', '?')}",
        )
    )

    results.append(check("Postgres :5432", port_open("127.0.0.1", 5432)))
    results.append(check("Backend :8000", port_open("127.0.0.1", 8000)))
    front_up = port_open("127.0.0.1", 3000)
    results.append(check("Frontend :3000", front_up, "optional for API-only" if not front_up else ""))

    if not port_open("127.0.0.1", 8000):
        print("Backend down — skip HTTP checks. Start uvicorn first.")
        failed = sum(1 for r in results if not r)
        print(f"\nSummary: {len(results) - failed}/{len(results)} passed (incomplete)")
        return 1

    # Health
    try:
        status, payload = http_json("GET", f"{API}/api/health")
        results.append(check("GET /api/health", status == 200 and payload.get("status") == "ok", str(payload)))
    except Exception as exc:  # noqa: BLE001
        results.append(check("GET /api/health", False, str(exc)))

    # Core list endpoints
    for path in ("/conversation", "/profile"):
        try:
            status, _ = http_json("GET", f"{API}{path}")
            results.append(check(f"GET {path}", status == 200, f"status={status}"))
        except urllib.error.HTTPError as exc:
            results.append(check(f"GET {path}", False, f"HTTP {exc.code}"))
        except Exception as exc:  # noqa: BLE001
            results.append(check(f"GET {path}", False, str(exc)))

    # OpenAPI voice routes
    try:
        status, spec = http_json("GET", f"{API}/openapi.json")
        paths = spec.get("paths", {}) if isinstance(spec, dict) else {}
        need = ["/interview/voice/start", "/interview/voice/{session_id}/answer", "/speech/tts"]
        missing = [p for p in need if p not in paths]
        results.append(check("OpenAPI voice routes", not missing, f"missing={missing}" if missing else "ok"))
    except Exception as exc:  # noqa: BLE001
        results.append(check("OpenAPI voice routes", False, str(exc)))

    # TTS (validates SPEECH_* loaded by running process)
    try:
        status, payload = http_json("POST", f"{API}/speech/tts", {"text": "交接验证，语音合成。"}, timeout=60)
        url = payload.get("url") if isinstance(payload, dict) else None
        audio_ok = False
        audio_detail = str(payload)[:120]
        if url:
            audio_url = str(url).replace("localhost", "127.0.0.1")
            req = urllib.request.Request(audio_url)
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
                audio_ok = resp.status == 200 and len(data) > 1000
                audio_detail = f"tts_status={status} audio_bytes={len(data)}"
        results.append(check("POST /speech/tts + media", status == 200 and audio_ok, audio_detail))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")[:200]
        results.append(check("POST /speech/tts + media", False, f"HTTP {exc.code} {body}"))
    except Exception as exc:  # noqa: BLE001
        results.append(check("POST /speech/tts + media", False, str(exc)))

    # Docs present
    docs = ROOT / "docs"
    for name in ("HANDOFF.md", "VERIFY.md", "README.md", "prd.md"):
        results.append(check(f"docs/{name}", (docs / name).exists()))

    passed = sum(1 for r in results if r)
    total = len(results)
    print(f"\nSummary: {passed}/{total} passed")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
