# =============================================================================
# database.py — SQLite engine and session factory
# =============================================================================
from __future__ import annotations

from typing import Generator

from sqlmodel import Session, SQLModel, create_engine

import config as cfg

# DATABASE_URL comes from config (which reads the DATABASE_URL env var).
# Locally:   sqlite:///./reports.db   (unchanged — relative to ai/)
# In Docker: sqlite:////data/db/reports.db  (volume-mounted path)
engine = create_engine(
    cfg.DATABASE_URL,
    connect_args={"check_same_thread": False},  # required for SQLite + multi-thread
    echo=False,
)


def create_db_and_tables() -> None:
    """Create all SQLModel tables. Called once on app startup."""
    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency — yields a database session per request."""
    with Session(engine) as session:
        yield session
