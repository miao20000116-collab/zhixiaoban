"""OpenAI-compatible LLM provider implementation."""

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.config import settings
from app.services.llm.provider import BaseLLMProvider


def _supports_thinking_toggle(model: str, api_base: str) -> bool:
    """DeepSeek V4 (+ reasoner aliases) accept thinking.enabled/disabled."""
    m = (model or "").lower()
    base = (api_base or "").lower()
    if "deepseek" in base or m.startswith("deepseek"):
        return True
    return False


class OpenAIProvider(BaseLLMProvider):
    """Stream chat completions via OpenAI-compatible API."""

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        thinking: bool | None = None,
        **kwargs: Any,
    ) -> AsyncIterator[str]:
        if not settings.openai_api_key:
            raise ValueError("OPENAI_API_KEY is not configured")

        model = model or settings.model_name
        url = f"{settings.openai_api_base.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {settings.openai_api_key}",
            "Content-Type": "application/json",
        }
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "stream": True,
        }
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens

        # deepseek-v4-* defaults thinking=ON with high effort — Master 意图分类会长时间停在
        #「仍在判断你的目标…」。Agent 路径默认关闭，避免空等 reasoning_content。
        use_thinking = settings.llm_thinking_enabled if thinking is None else thinking
        if _supports_thinking_toggle(model, settings.openai_api_base):
            payload["thinking"] = {"type": "enabled" if use_thinking else "disabled"}

        timeout = httpx.Timeout(
            connect=15.0,
            read=settings.llm_request_timeout_seconds,
            write=30.0,
            pool=10.0,
        )
        last_exc: Exception | None = None
        for _attempt in range(2):
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    async with client.stream("POST", url, headers=headers, json=payload) as response:
                        response.raise_for_status()
                        async for line in response.aiter_lines():
                            if not line.startswith("data: "):
                                continue
                            data = line[6:].strip()
                            if data == "[DONE]":
                                break
                            try:
                                chunk = json.loads(data)
                            except json.JSONDecodeError:
                                continue
                            delta = chunk.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content")
                            if content:
                                yield content
                return
            except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
                last_exc = exc
                continue
        if last_exc:
            raise last_exc

    async def complete(
        self,
        prompt: str = "",
        *,
        messages: list[dict[str, str]] | None = None,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        thinking: bool | None = None,
        **kwargs: Any,
    ) -> str:
        parts: list[str] = []
        chat_messages = messages if messages is not None else [{"role": "user", "content": prompt}]
        # Structured Agent calls (intent / JSON schema) should not burn tokens on reasoning.
        if thinking is None:
            thinking = False
        async for token in self.chat(
            chat_messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            thinking=thinking,
            **kwargs,
        ):
            parts.append(token)
        return "".join(parts)


def get_llm_provider() -> BaseLLMProvider:
    return OpenAIProvider()
