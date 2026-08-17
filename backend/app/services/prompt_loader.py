"""Load prompt templates from the prompts directory."""

from functools import lru_cache
from pathlib import Path

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"
AGENTS_DIR = Path(__file__).resolve().parent.parent / "agents"

# Runtime overrides from Prompt_Template active versions
_ACTIVE_OVERRIDES: dict[str, str] = {}


@lru_cache
def load_system_prompt() -> str:
    return _read_prompt(PROMPTS_DIR / "system_prompt.md")


def load_agent_prompt(agent_name: str) -> str:
    if agent_name in _ACTIVE_OVERRIDES:
        return _ACTIVE_OVERRIDES[agent_name]
    path = AGENTS_DIR / agent_name / "prompt.md"
    return _read_prompt(path)


def set_active_prompt_override(agent_name: str, content: str) -> None:
    _ACTIVE_OVERRIDES[agent_name] = content.strip()


def clear_active_prompt_overrides() -> None:
    _ACTIVE_OVERRIDES.clear()


def _read_prompt(path: Path) -> str:
    return path.read_text(encoding="utf-8").strip()
