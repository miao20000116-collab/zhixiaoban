"""Prompt version management — DB-backed with file fallback."""

from __future__ import annotations

import uuid
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from app.models.prompt_template import PromptTemplate
from app.services.prompt_loader import AGENTS_DIR, PROMPTS_DIR, load_agent_prompt

# Built-in agents that ship with prompt.md (also auto-discovered below)
KNOWN_AGENTS = (
    "master",
    "resume",
    "job",
    "interview",
    "evaluation",
    "memory",
    "career",
    "career_gap",
    "recommendation",
)


def discover_agent_prompt_files() -> list[tuple[str, Path]]:
    """Return (agent_name, path) for every on-disk agent prompt.md (+ system)."""
    found: list[tuple[str, Path]] = []
    if AGENTS_DIR.exists():
        for child in sorted(AGENTS_DIR.iterdir()):
            if not child.is_dir():
                continue
            path = child / "prompt.md"
            if path.exists():
                found.append((child.name, path))
    system = PROMPTS_DIR / "system_prompt.md"
    if system.exists():
        found.append(("system", system))
    return found


def get_active_prompt(db: Session, agent_name: str) -> str:
    """Prefer active DB version; fall back to prompt.md on disk."""
    row = (
        db.query(PromptTemplate)
        .filter(PromptTemplate.agent_name == agent_name, PromptTemplate.status == "active")
        .order_by(PromptTemplate.created_at.desc())
        .first()
    )
    if row:
        return row.prompt_content
    if agent_name == "system":
        return (PROMPTS_DIR / "system_prompt.md").read_text(encoding="utf-8").strip()
    return load_agent_prompt(agent_name)


def list_prompts(
    db: Session,
    *,
    agent_name: str | None = None,
) -> list[PromptTemplate]:
    q = db.query(PromptTemplate)
    if agent_name:
        q = q.filter(PromptTemplate.agent_name == agent_name)
    return q.order_by(PromptTemplate.agent_name.asc(), PromptTemplate.created_at.desc()).all()


def create_prompt_version(
    db: Session,
    *,
    agent_name: str,
    version: str,
    content: str,
    activate: bool = False,
) -> PromptTemplate:
    existing = (
        db.query(PromptTemplate)
        .filter(PromptTemplate.agent_name == agent_name, PromptTemplate.version == version)
        .first()
    )
    if existing:
        existing.prompt_content = content
        if activate:
            _deactivate_others(db, agent_name)
            existing.status = "active"
        db.add(existing)
        db.commit()
        db.refresh(existing)
        return existing

    row = PromptTemplate(
        agent_name=agent_name,
        version=version,
        prompt_content=content,
        status="active" if activate else "draft",
        created_at=datetime.utcnow(),
    )
    if activate:
        _deactivate_others(db, agent_name)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def activate_prompt(db: Session, prompt_id: uuid.UUID) -> PromptTemplate | None:
    row = db.query(PromptTemplate).filter(PromptTemplate.id == prompt_id).first()
    if row is None:
        return None
    _deactivate_others(db, row.agent_name)
    row.status = "active"
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def seed_prompts_from_files(db: Session, *, version: str = "v1.0") -> list[PromptTemplate]:
    """Import on-disk prompt.md files as versioned templates if missing."""
    created: list[PromptTemplate] = []
    for agent_name, path in discover_agent_prompt_files():
        exists = (
            db.query(PromptTemplate)
            .filter(PromptTemplate.agent_name == agent_name, PromptTemplate.version == version)
            .first()
        )
        if exists:
            # Keep content in sync with file for the built-in v1.0 snapshot
            content = path.read_text(encoding="utf-8").strip()
            if content and exists.prompt_content != content:
                exists.prompt_content = content
                db.add(exists)
                db.commit()
                db.refresh(exists)
            continue
        has_active = (
            db.query(PromptTemplate)
            .filter(PromptTemplate.agent_name == agent_name, PromptTemplate.status == "active")
            .first()
        )
        content = path.read_text(encoding="utf-8").strip()
        if not content:
            continue
        row = create_prompt_version(
            db,
            agent_name=agent_name,
            version=version,
            content=content,
            activate=has_active is None,
        )
        created.append(row)
    return created


def ensure_prompts_seeded(db: Session) -> list[PromptTemplate]:
    """Idempotent: seed from disk whenever built-in agents are missing in DB."""
    disk = discover_agent_prompt_files()
    if not disk:
        return list_prompts(db)
    missing = False
    for agent_name, _ in disk:
        exists = (
            db.query(PromptTemplate)
            .filter(PromptTemplate.agent_name == agent_name, PromptTemplate.version == "v1.0")
            .first()
        )
        if exists is None:
            missing = True
            break
    if missing or db.query(PromptTemplate).count() == 0:
        seed_prompts_from_files(db)
    return list_prompts(db)


def _deactivate_others(db: Session, agent_name: str) -> None:
    rows = (
        db.query(PromptTemplate)
        .filter(PromptTemplate.agent_name == agent_name, PromptTemplate.status == "active")
        .all()
    )
    for row in rows:
        row.status = "archived"
        db.add(row)
    db.flush()
