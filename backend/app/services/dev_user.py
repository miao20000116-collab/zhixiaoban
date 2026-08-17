"""Request-scoped user helper.

The app still supports a local guest user for portfolio demos, but tests and
future auth integrations can pass a stable user identity through headers.
"""

from contextvars import ContextVar
import re

from sqlalchemy.orm import Session

from app.models.user import User

DEV_USER_EMAIL = "dev@local.ai"
_current_user_hint: ContextVar[str | None] = ContextVar("current_user_hint", default=None)


def set_current_user_hint(value: str | None):
    return _current_user_hint.set(_normalize_user_hint(value))


def reset_current_user_hint(token) -> None:
    _current_user_hint.reset(token)


def _normalize_user_hint(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if cleaned.lower().startswith("bearer "):
        cleaned = cleaned[7:].strip()
    if not cleaned or cleaned.lower() in {"null", "undefined"}:
        return None
    if "@" in cleaned:
        return cleaned[:255].lower()
    safe = re.sub(r"[^a-zA-Z0-9_.-]+", "-", cleaned).strip("-").lower()
    if not safe:
        return None
    return f"{safe[:80]}@local.ai"


def get_or_create_dev_user(db: Session) -> User:
    email = _current_user_hint.get() or DEV_USER_EMAIL
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        user = User(email=email)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user
