# =============================================================================
# db_models.py — SQLModel database table definitions
# =============================================================================
from __future__ import annotations

import json
from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class Report(SQLModel, table=True):
    """Top-level report record."""

    __tablename__ = "reports"

    id: str = Field(primary_key=True)
    title: str
    status: str = "pending"  # pending | running | done | failed
    created_at: datetime = Field(default_factory=datetime.utcnow)
    invention_summary: Optional[str] = None
    error_message: Optional[str] = None
    logs_json: Optional[str] = None  # JSON array of log strings


class KeyFeatureDB(SQLModel, table=True):
    """Key feature of the invention under analysis."""

    __tablename__ = "key_features"

    id: Optional[int] = Field(default=None, primary_key=True)
    report_id: str = Field(foreign_key="reports.id", index=True)
    index: int  # 1-based
    description: str


class PatentInputDB(SQLModel, table=True):
    """Patent document provided as input for a report."""

    __tablename__ = "patents_input"

    id: Optional[int] = Field(default=None, primary_key=True)
    report_id: str = Field(foreign_key="reports.id", index=True)
    patent_id: str  # e.g. "p1", unique per report
    publication_number: str
    title: str = ""
    content: str = ""  # full patent text
    owner: str = ""


class SummaryRowDB(SQLModel, table=True):
    """One row in the Summary Table (one per patent)."""

    __tablename__ = "summary_table_rows"

    id: Optional[int] = Field(default=None, primary_key=True)
    report_id: str = Field(foreign_key="reports.id", index=True)
    patent_id: str
    title: str
    publication_number: str
    owner: str = ""
    relevance_note: str = ""


class ClaimChartRowDB(SQLModel, table=True):
    """One (patent x feature) pair in a Claim Chart."""

    __tablename__ = "claim_chart_rows"

    id: Optional[int] = Field(default=None, primary_key=True)
    report_id: str = Field(foreign_key="reports.id", index=True)
    patent_id: str
    patent_pub_number: str
    feature_index: int
    feature_description: str
    justification: str
    found: bool


class MatrixEntryDB(SQLModel, table=True):
    """One patent's row in the Novelty Matrix."""

    __tablename__ = "matrix_entries"

    id: Optional[int] = Field(default=None, primary_key=True)
    report_id: str = Field(foreign_key="reports.id", index=True)
    patent_id: str
    patent_title: str
    publication_number: str
    feature_results_json: str = "{}"  # JSON: {"feature_index": found_bool, ...}
