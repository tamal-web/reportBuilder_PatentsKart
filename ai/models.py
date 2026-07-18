# =============================================================================
# models.py — Pydantic data models for the Prior Art Agent
# =============================================================================
from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, Field

# ── Domain models ─────────────────────────────────────────────────────────────


class PatentDocument(BaseModel):
    """A patent provided as input to the pipeline."""

    id: str  # unique identifier (e.g. "p1", "US10123456B2")
    title: str  # known title (may be overridden by LLM extraction)
    publication_number: str  # e.g. "US10123456B2"
    content: str  # full extracted text of the patent
    owner: str = ""  # known assignee (may be overridden)


class KeyFeature(BaseModel):
    """A key feature of the invention being compared against prior art."""

    index: int  # 1-based index
    description: str  # full description of the feature


class SummaryTableEntry(BaseModel):
    """One row in the Summary Table (one per relevant patent)."""

    patent_id: str
    title: str
    publication_number: str
    owner: str
    relevance_note: str = ""


class ClaimChartEntry(BaseModel):
    """
    One cell pair in a Claim Chart: the mapping of one key feature
    against one patent. There is one entry per (patent, feature) pair.
    """

    feature_index: int
    feature_description: str
    justification: str  # paraphrased passage from the patent
    found: bool  # True = feature is disclosed in this patent


class MatrixEntry(BaseModel):
    """
    One column in the Novelty Matrix: all feature results for one patent.
    The matrix itself is a list of MatrixEntry objects (one per patent).
    """

    patent_id: str
    patent_title: str
    publication_number: str
    feature_results: Dict[int, bool]  # {feature_index: found}


class ReportData(BaseModel):
    """
    Complete, accumulated output of the pipeline.
    This is what gets passed to generate_docx().
    """

    key_features: List[KeyFeature]
    patents: List[PatentDocument]
    summary_table: List[SummaryTableEntry]
    claim_charts: Dict[str, List[ClaimChartEntry]]  # {patent_id: [entries]}
    matrix: List[MatrixEntry]


# ── LLM output schemas (used with Instructor) ─────────────────────────────────
# These are the structured types the LLM must return.
# Instructor enforces the schema via JSON mode and retries on failure.


class SummaryLLMOutput(BaseModel):
    title: str = Field(
        description="Full title of the patent exactly as stated in the document"
    )
    publication_number: str = Field(
        description="Patent publication number, e.g. US10123456B2 or EP3456789A1"
    )
    owner: str = Field(description="Name of the patent assignee or applicant")
    relevance_note: str = Field(
        description=(
            "One sentence explaining how this patent is relevant to the invention "
            "features being assessed. Be specific."
        )
    )


class ClaimChartLLMOutput(BaseModel):
    found: bool = Field(
        description=(
            "true if the patent passages clearly disclose a feature that "
            "corresponds to the key feature. false if not found."
        )
    )
    justification: str = Field(
        description=(
            "If found=true: 2-4 sentences paraphrasing the specific patent "
            "passage that discloses this feature. Use language close to the "
            "patent's own wording. "
            "If found=false: write exactly: "
            "'This feature is not explicitly disclosed in this patent.'"
        )
    )
