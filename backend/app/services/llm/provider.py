"""LLM Provider abstraction layer.

Supports OpenAI-compatible APIs. Implementations are added in later phases.
Do not bind to a specific model vendor in business logic.
"""

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from typing import Any


class BaseLLMProvider(ABC):
    """Abstract base class for LLM providers."""

    @abstractmethod
    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        **kwargs: Any,
    ) -> AsyncIterator[str]:
        """Stream chat completion tokens."""
        yield ""  # pragma: no cover

    @abstractmethod
    async def complete(
        self,
        prompt: str = "",
        *,
        messages: list[dict[str, str]] | None = None,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        **kwargs: Any,
    ) -> str:
        """Return a full completion for a single prompt."""
        raise NotImplementedError


class BaseEmbeddingProvider(ABC):
    """Abstract base class for embedding providers."""

    @abstractmethod
    async def embed(self, texts: list[str], *, model: str | None = None) -> list[list[float]]:
        raise NotImplementedError
