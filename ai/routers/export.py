# =============================================================================
# routers/export.py — Generate and stream a .docx report file
# =============================================================================
from __future__ import annotations

import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlmodel import Session, select

from database import get_session
from db_models import (
    ClaimChartRowDB,
    KeyFeatureDB,
    MatrixEntryDB,
    PatentInputDB,
    Report,
    SummaryRowDB,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/reports", tags=["export"])


@router.get("/{report_id}/export")
def export_report(
    report_id: str,
    template: str = "default",
    session: Session = Depends(get_session),
):
    """Generate a .docx report file and stream it as a download."""
    # Import here to keep startup fast
    from config import TEMPLATES
    from docx_generator import generate_docx
    from models import (
        ClaimChartEntry,
        KeyFeature,
        MatrixEntry,
        PatentDocument,
        ReportData,
        SummaryTableEntry,
    )

    report = session.get(Report, report_id)
    if not report:
        raise HTTPException(404, "Report not found")
    if report.status != "done":
        raise HTTPException(
            400, f"Report is not complete (status: {report.status}). Cannot export yet."
        )

    # ── Load all data from DB ─────────────────────────────────────────────────
    features_db = session.exec(
        select(KeyFeatureDB)
        .where(KeyFeatureDB.report_id == report_id)
        .order_by(KeyFeatureDB.index)
    ).all()
    patents_db = session.exec(
        select(PatentInputDB).where(PatentInputDB.report_id == report_id)
    ).all()
    summary_db = session.exec(
        select(SummaryRowDB).where(SummaryRowDB.report_id == report_id)
    ).all()
    cc_db = session.exec(
        select(ClaimChartRowDB).where(ClaimChartRowDB.report_id == report_id)
    ).all()
    matrix_db = session.exec(
        select(MatrixEntryDB).where(MatrixEntryDB.report_id == report_id)
    ).all()

    # ── Build ReportData ──────────────────────────────────────────────────────
    key_features = [
        KeyFeature(index=f.index, description=f.description) for f in features_db
    ]
    patents = [
        PatentDocument(
            id=p.patent_id,
            title=p.title or p.publication_number,
            publication_number=p.publication_number,
            content=p.content,
            owner=p.owner,
        )
        for p in patents_db
    ]
    summary_table = [
        SummaryTableEntry(
            patent_id=r.patent_id,
            title=r.title,
            publication_number=r.publication_number,
            owner=r.owner,
            relevance_note=r.relevance_note,
        )
        for r in summary_db
    ]

    # Claim charts grouped by patent_id
    claim_charts: Dict[str, List[ClaimChartEntry]] = {}
    for row in cc_db:
        claim_charts.setdefault(row.patent_id, []).append(
            ClaimChartEntry(
                feature_index=row.feature_index,
                feature_description=row.feature_description,
                justification=row.justification,
                found=row.found,
            )
        )

    matrix = [
        MatrixEntry(
            patent_id=m.patent_id,
            patent_title=m.patent_title,
            publication_number=m.publication_number,
            feature_results={
                int(k): v for k, v in json.loads(m.feature_results_json).items()
            },
        )
        for m in matrix_db
    ]

    report_data = ReportData(
        key_features=key_features,
        patents=patents,
        summary_table=summary_table,
        claim_charts=claim_charts,
        matrix=matrix,
    )

    # ── Generate docx ─────────────────────────────────────────────────────────
    tpl = TEMPLATES.get(template, TEMPLATES["default"])

    # Use EXPORTS_DIR from config (env-driven; locally = ./exports, Docker = /data/exports)
    import config as cfg  # noqa: PLC0415  (lazy import keeps startup fast)
    out_dir = Path(cfg.EXPORTS_DIR)
    out_dir.mkdir(parents=True, exist_ok=True)
    safe_title = "".join(c for c in report.title if c.isalnum() or c in " -_")[:40]
    out_path = out_dir / f"{report_id}_{safe_title}.docx"

    generate_docx(report_data, template=tpl, output_path=out_path)

    filename = f"{safe_title}_prior_art_report.docx".replace(" ", "_")
    return FileResponse(
        path=str(out_path),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=filename,
    )
