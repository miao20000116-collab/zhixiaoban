"""Speech services: ASR + TTS via OpenAI-compatible APIs (e.g. SiliconFlow), local storage."""

from __future__ import annotations

import json
import uuid
from pathlib import Path

import httpx

from app.config import settings


def audio_dir() -> Path:
    import os

    raw = settings.audio_storage_dir
    # Serverless (Vercel/Lambda): only /tmp is writable
    if os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        raw = "/tmp/data/audio"

    path = Path(raw)
    if not path.is_absolute():
        # Resolve relative to backend package root (app/../data/audio)
        path = Path(__file__).resolve().parents[2] / path
    path.mkdir(parents=True, exist_ok=True)
    return path


def public_audio_url(filename: str) -> str:
    # Relative path — frontend resolves via /backend-api proxy in local dev.
    return f"/media/audio/{filename}"


def save_audio_bytes(data: bytes, *, suffix: str = ".webm") -> tuple[str, str]:
    """Persist audio bytes; return (filename, public_url)."""
    filename = f"{uuid.uuid4().hex}{suffix}"
    path = audio_dir() / filename
    path.write_bytes(data)
    return filename, public_audio_url(filename)


def _speech_headers() -> dict[str, str]:
    key = settings.resolved_speech_api_key
    if not key:
        raise ValueError(
            "SPEECH_API_KEY 未配置。请在 .env 填写硅基流动（或其他 OpenAI 兼容语音）Key，"
            "文本 DeepSeek Key 不能用于 ASR/TTS。"
        )
    return {"Authorization": f"Bearer {key}"}


async def transcribe_audio(
    data: bytes,
    *,
    filename: str = "audio.webm",
    language: str = "zh",
) -> str:
    """ASR via OpenAI-compatible /audio/transcriptions (SiliconFlow SenseVoice)."""
    url = f"{settings.resolved_speech_api_base}/audio/transcriptions"
    files = {"file": (filename, data, _guess_mime(filename))}
    form = {
        "model": settings.whisper_model,
        "language": language,
    }
    form_min = {"model": settings.whisper_model}

    async with httpx.AsyncClient(timeout=180.0) as client:
        for attempt in range(2):
            response = await client.post(
                url,
                headers=_speech_headers(),
                files=files,
                data=form,
            )
            if response.status_code >= 400:
                response = await client.post(
                    url,
                    headers=_speech_headers(),
                    files=files,
                    data=form_min,
                )
            if response.status_code >= 500 and attempt == 0:
                continue
            response.raise_for_status()
            text = response.text.strip()
            if text.startswith("{"):
                try:
                    payload = json.loads(text)
                    text = str(payload.get("text", text))
                except Exception:  # noqa: BLE001
                    pass
            return text.strip()

    raise RuntimeError("语音识别服务暂时不可用，请稍后再试")


async def synthesize_speech(text: str, *, voice: str | None = None) -> tuple[str, str]:
    """TTS via OpenAI-compatible /audio/speech (SiliconFlow CosyVoice)."""
    url = f"{settings.resolved_speech_api_base}/audio/speech"
    headers = {
        **_speech_headers(),
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.tts_model,
        "voice": voice or settings.tts_voice,
        "input": text[:4000],
        "response_format": "mp3",
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(url, headers=headers, json=payload)
        response.raise_for_status()
        return save_audio_bytes(response.content, suffix=".mp3")


def _guess_mime(filename: str) -> str:
    lower = filename.lower()
    if lower.endswith(".mp3"):
        return "audio/mpeg"
    if lower.endswith(".wav"):
        return "audio/wav"
    if lower.endswith(".m4a"):
        return "audio/mp4"
    if lower.endswith(".ogg"):
        return "audio/ogg"
    return "audio/webm"
