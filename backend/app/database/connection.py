"""Database engine and session management."""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings


def _normalize_database_url(url: str) -> str:
    """Ensure cloud Postgres URLs work with SQLAlchemy + psycopg2 (Neon/Supabase)."""
    normalized = (url or "").strip()
    if not normalized:
        return normalized
    if normalized.startswith("postgres://"):
        normalized = "postgresql://" + normalized[len("postgres://") :]
    if normalized.startswith("postgresql://") and "+psycopg2" not in normalized:
        normalized = "postgresql+psycopg2://" + normalized[len("postgresql://") :]
    if "sslmode=" not in normalized and "neon.tech" in normalized:
        sep = "&" if "?" in normalized else "?"
        normalized = f"{normalized}{sep}sslmode=require"
    return normalized


engine = create_engine(_normalize_database_url(settings.database_url), pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
