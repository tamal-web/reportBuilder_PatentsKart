# =============================================================================
# routers/reports.py — Prior-Art report CRUD + background pipeline runner
# =============================================================================
from __future__ import annotations

import json
import logging
import threading
import uuid
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlmodel import Session, select

from database import engine, get_session
from db_models import (
    ClaimChartRowDB,
    KeyFeatureDB,
    MatrixEntryDB,
    PatentInputDB,
    Report,
    SummaryRowDB,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/reports", tags=["reports"])

# Serialize pipeline execution to prevent RAG singleton conflicts
_pipeline_lock = threading.Lock()


# =============================================================================
# Request / Response Schemas
# =============================================================================


class PatentInputRequest(BaseModel):
    publication_number: str
    title: str = ""
    content: str
    owner: str = ""


class CreateReportRequest(BaseModel):
    title: str
    invention_summary: Optional[str] = None
    key_features: List[str]  # list of feature description strings
    patents: List[PatentInputRequest]


class UpdateJustificationRequest(BaseModel):
    justification: str
    found: Optional[bool] = None


class UpdateSummaryRowRequest(BaseModel):
    title: Optional[str] = None
    owner: Optional[str] = None
    relevance_note: Optional[str] = None


class UpdateMatrixRequest(BaseModel):
    feature_index: int
    found: bool


class KeyFeatureOut(BaseModel):
    id: int
    index: int
    description: str


class PatentInputOut(BaseModel):
    id: int
    patent_id: str
    publication_number: str
    title: str
    owner: str


class SummaryRowOut(BaseModel):
    id: int
    patent_id: str
    title: str
    publication_number: str
    owner: str
    relevance_note: str


class ClaimChartRowOut(BaseModel):
    id: int
    patent_id: str
    patent_pub_number: str
    feature_index: int
    feature_description: str
    justification: str
    found: bool


class MatrixEntryOut(BaseModel):
    id: int
    patent_id: str
    patent_title: str
    publication_number: str
    feature_results: Dict[str, bool]  # {"1": True, "2": False, ...}


class ReportListItem(BaseModel):
    id: str
    title: str
    status: str
    created_at: datetime
    patent_count: int
    feature_count: int


class ReportDetailOut(BaseModel):
    id: str
    title: str
    status: str
    created_at: datetime
    invention_summary: Optional[str]
    error_message: Optional[str]
    logs: List[str]
    key_features: List[KeyFeatureOut]
    patents: List[PatentInputOut]
    summary_table: List[SummaryRowOut]
    claim_charts: Dict[str, List[ClaimChartRowOut]]  # {patent_id: [rows]}
    matrix: List[MatrixEntryOut]


# =============================================================================
# Background task
# =============================================================================


def _run_pipeline_background(report_id: str) -> None:
    """
    Runs in a background thread.
    Loads inputs from DB, executes the LangGraph pipeline, and saves all
    results back to the database. Updates report.status throughout.
    """
    # Import lazily so startup is fast even if LM Studio isn't running
    from models import KeyFeature, PatentDocument
    from pipeline import run_pipeline

    with Session(engine) as session:
        report = session.get(Report, report_id)
        if not report:
            log.error("Report %s not found for background run", report_id)
            return

        report.status = "running"
        session.add(report)
        session.commit()

        try:
            # ── Load inputs from DB ───────────────────────────────────────────
            features_db = session.exec(
                select(KeyFeatureDB)
                .where(KeyFeatureDB.report_id == report_id)
                .order_by(KeyFeatureDB.index)
            ).all()

            patents_db = session.exec(
                select(PatentInputDB).where(PatentInputDB.report_id == report_id)
            ).all()

            key_features = [
                KeyFeature(index=f.index, description=f.description)
                for f in features_db
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

            # ── Run pipeline (serialized via lock) ───────────────────────────
            with _pipeline_lock:
                result = run_pipeline(patents, key_features, verbose=True)

            # ── Clear existing placeholders to avoid duplicates ───────────────
            for model_db in [SummaryRowDB, ClaimChartRowDB, MatrixEntryDB]:
                existing = session.exec(select(model_db).where(model_db.report_id == report_id)).all()
                for r in existing:
                    session.delete(r)

            # ── Persist: Summary Table ────────────────────────────────────────
            for entry in result.summary_table:
                row = SummaryRowDB(
                    report_id=report_id,
                    patent_id=entry.patent_id,
                    title=entry.title,
                    publication_number=entry.publication_number,
                    owner=entry.owner,
                    relevance_note=entry.relevance_note,
                )
                session.add(row)

            # ── Persist: Claim Charts ─────────────────────────────────────────
            patent_pub_map = {p.id: p.publication_number for p in patents}
            for patent_id, entries in result.claim_charts.items():
                pub_num = patent_pub_map.get(patent_id, patent_id)
                for entry in entries:
                    row = ClaimChartRowDB(
                        report_id=report_id,
                        patent_id=patent_id,
                        patent_pub_number=pub_num,
                        feature_index=entry.feature_index,
                        feature_description=entry.feature_description,
                        justification=entry.justification,
                        found=entry.found,
                    )
                    session.add(row)

            # ── Persist: Matrix ───────────────────────────────────────────────
            for m_entry in result.matrix:
                me = MatrixEntryDB(
                    report_id=report_id,
                    patent_id=m_entry.patent_id,
                    patent_title=m_entry.patent_title,
                    publication_number=m_entry.publication_number,
                    feature_results_json=json.dumps(
                        {str(k): v for k, v in m_entry.feature_results.items()}
                    ),
                )
                session.add(me)

            report.status = "done"
            session.add(report)
            session.commit()
            log.info("Report %s completed successfully", report_id)

        except Exception as exc:
            log.exception("Pipeline failed for report %s", report_id)
            # Re-fetch report in case session is dirty
            session.rollback()
            report = session.get(Report, report_id)
            if report:
                report.status = "failed"
                report.error_message = str(exc)[:2000]
                session.add(report)
                session.commit()


# =============================================================================
# Route handlers
# =============================================================================


@router.post("", status_code=201)
def create_report(
    body: CreateReportRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
) -> dict:
    """Create a new report and enqueue the pipeline in the background."""
    if not body.key_features:
        raise HTTPException(400, "At least one key feature is required")
    if not body.patents:
        raise HTTPException(400, "At least one patent is required")
    for p in body.patents:
        if not p.content.strip():
            raise HTTPException(
                400, f"Patent {p.publication_number!r} has empty content"
            )

    report_id = str(uuid.uuid4())

    # ── Save report record ────────────────────────────────────────────────────
    report = Report(
        id=report_id,
        title=body.title,
        status="pending",
        invention_summary=body.invention_summary,
    )
    session.add(report)

    # ── Save key features ─────────────────────────────────────────────────────
    for i, desc in enumerate(body.key_features, start=1):
        session.add(
            KeyFeatureDB(report_id=report_id, index=i, description=desc.strip())
        )

    # ── Save patent inputs ────────────────────────────────────────────────────
    for i, p in enumerate(body.patents, start=1):
        session.add(
            PatentInputDB(
                report_id=report_id,
                patent_id=f"p{i}",
                publication_number=p.publication_number.strip(),
                title=p.title.strip(),
                content=p.content.strip(),
                owner=p.owner.strip(),
            )
        )

    session.commit()

    # ── Enqueue background pipeline ───────────────────────────────────────────
    background_tasks.add_task(_run_pipeline_background, report_id)

    return {"id": report_id, "status": "pending"}


@router.get("")
def list_reports(session: Session = Depends(get_session)) -> List[ReportListItem]:
    """List all reports with basic metadata."""
    reports = session.exec(select(Report).order_by(Report.created_at.desc())).all()
    result = []
    for r in reports:
        # Count associated records
        patent_count = len(
            session.exec(
                select(PatentInputDB).where(PatentInputDB.report_id == r.id)
            ).all()
        )
        feature_count = len(
            session.exec(
                select(KeyFeatureDB).where(KeyFeatureDB.report_id == r.id)
            ).all()
        )
        result.append(
            ReportListItem(
                id=r.id,
                title=r.title,
                status=r.status,
                created_at=r.created_at,
                patent_count=patent_count,
                feature_count=feature_count,
            )
        )
    return result


@router.get("/{report_id}")
def get_report(
    report_id: str, session: Session = Depends(get_session)
) -> ReportDetailOut:
    """Get full report details including all generated sections."""
    report = session.get(Report, report_id)
    if not report:
        raise HTTPException(404, "Report not found")

    # ── Key features ──────────────────────────────────────────────────────────
    features = session.exec(
        select(KeyFeatureDB)
        .where(KeyFeatureDB.report_id == report_id)
        .order_by(KeyFeatureDB.index)
    ).all()

    # ── Patents ───────────────────────────────────────────────────────────────
    patents = session.exec(
        select(PatentInputDB).where(PatentInputDB.report_id == report_id)
    ).all()

    # ── Summary table ─────────────────────────────────────────────────────────
    summary_rows = session.exec(
        select(SummaryRowDB).where(SummaryRowDB.report_id == report_id)
    ).all()
    summary_patent_ids = {r.patent_id for r in summary_rows}
    new_summary = False
    for p in patents:
        if p.patent_id not in summary_patent_ids:
            row = SummaryRowDB(
                report_id=report_id,
                patent_id=p.patent_id,
                title=p.title,
                publication_number=p.publication_number,
                owner=p.owner,
                relevance_note="",
            )
            session.add(row)
            new_summary = True
    if new_summary:
        session.commit()
        summary_rows = session.exec(
            select(SummaryRowDB).where(SummaryRowDB.report_id == report_id)
        ).all()

    # ── Claim charts (grouped by patent_id) ───────────────────────────────────
    cc_rows = session.exec(
        select(ClaimChartRowDB)
        .where(ClaimChartRowDB.report_id == report_id)
        .order_by(ClaimChartRowDB.patent_id, ClaimChartRowDB.feature_index)
    ).all()
    cc_existing = {(r.patent_id, r.feature_index) for r in cc_rows}
    new_cc = False
    for p in patents:
        for f in features:
            if (p.patent_id, f.index) not in cc_existing:
                row = ClaimChartRowDB(
                    report_id=report_id,
                    patent_id=p.patent_id,
                    patent_pub_number=p.publication_number,
                    feature_index=f.index,
                    feature_description=f.description,
                    justification="",
                    found=False,
                )
                session.add(row)
                new_cc = True
    if new_cc:
        session.commit()
        cc_rows = session.exec(
            select(ClaimChartRowDB)
            .where(ClaimChartRowDB.report_id == report_id)
            .order_by(ClaimChartRowDB.patent_id, ClaimChartRowDB.feature_index)
        ).all()

    claim_charts: Dict[str, List[ClaimChartRowOut]] = {}
    for row in cc_rows:
        claim_charts.setdefault(row.patent_id, []).append(
            ClaimChartRowOut(
                id=row.id,
                patent_id=row.patent_id,
                patent_pub_number=row.patent_pub_number,
                feature_index=row.feature_index,
                feature_description=row.feature_description,
                justification=row.justification,
                found=row.found,
            )
        )

    # ── Matrix ────────────────────────────────────────────────────────────────
    matrix_rows = session.exec(
        select(MatrixEntryDB).where(MatrixEntryDB.report_id == report_id)
    ).all()
    matrix_map = {m.patent_id: m for m in matrix_rows}
    new_matrix = False
    for p in patents:
        if p.patent_id not in matrix_map:
            me = MatrixEntryDB(
                report_id=report_id,
                patent_id=p.patent_id,
                patent_title=p.title,
                publication_number=p.publication_number,
                feature_results_json=json.dumps({str(f.index): False for f in features}),
            )
            session.add(me)
            new_matrix = True
        else:
            try:
                res_dict = json.loads(matrix_map[p.patent_id].feature_results_json or "{}")
            except Exception:
                res_dict = {}
            missing_feats = [f for f in features if str(f.index) not in res_dict]
            if missing_feats:
                for f in missing_feats:
                    res_dict[str(f.index)] = False
                matrix_map[p.patent_id].feature_results_json = json.dumps(res_dict)
                session.add(matrix_map[p.patent_id])
                new_matrix = True
    if new_matrix:
        session.commit()
        matrix_rows = session.exec(
            select(MatrixEntryDB).where(MatrixEntryDB.report_id == report_id)
        ).all()

    matrix = [
        MatrixEntryOut(
            id=row.id,
            patent_id=row.patent_id,
            patent_title=row.patent_title,
            publication_number=row.publication_number,
            feature_results=json.loads(row.feature_results_json),
        )
        for row in matrix_rows
    ]

    # ── Logs ──────────────────────────────────────────────────────────────────
    logs: List[str] = []
    if report.logs_json:
        try:
            logs = json.loads(report.logs_json)
        except Exception:
            logs = [report.logs_json]

    return ReportDetailOut(
        id=report.id,
        title=report.title,
        status=report.status,
        created_at=report.created_at,
        invention_summary=report.invention_summary,
        error_message=report.error_message,
        logs=logs,
        key_features=[
            KeyFeatureOut(id=f.id, index=f.index, description=f.description)
            for f in features
        ],
        patents=[
            PatentInputOut(
                id=p.id,
                patent_id=p.patent_id,
                publication_number=p.publication_number,
                title=p.title,
                owner=p.owner,
            )
            for p in patents
        ],
        summary_table=[
            SummaryRowOut(
                id=r.id,
                patent_id=r.patent_id,
                title=r.title,
                publication_number=r.publication_number,
                owner=r.owner,
                relevance_note=r.relevance_note,
            )
            for r in summary_rows
        ],
        claim_charts=claim_charts,
        matrix=matrix,
    )


@router.patch("/{report_id}/claim-chart/{row_id}")
def update_claim_chart_row(
    report_id: str,
    row_id: int,
    body: UpdateJustificationRequest,
    session: Session = Depends(get_session),
) -> ClaimChartRowOut:
    """Update the justification (and optionally the found flag) for a claim chart row."""
    row = session.get(ClaimChartRowDB, row_id)
    if not row or row.report_id != report_id:
        raise HTTPException(404, "Claim chart row not found")

    row.justification = body.justification
    if body.found is not None:
        row.found = body.found
        # Sync with MatrixEntryDB
        matrix_row = session.exec(
            select(MatrixEntryDB).where(
                MatrixEntryDB.report_id == report_id,
                MatrixEntryDB.patent_id == row.patent_id,
            )
        ).first()
        if matrix_row:
            try:
                m_data = json.loads(matrix_row.feature_results_json or "{}")
            except Exception:
                m_data = {}
            m_data[str(row.feature_index)] = body.found
            matrix_row.feature_results_json = json.dumps(m_data)
            session.add(matrix_row)

    session.add(row)
    session.commit()
    session.refresh(row)

    return ClaimChartRowOut(
        id=row.id,
        patent_id=row.patent_id,
        patent_pub_number=row.patent_pub_number,
        feature_index=row.feature_index,
        feature_description=row.feature_description,
        justification=row.justification,
        found=row.found,
    )


@router.patch("/{report_id}/summary-table/{row_id}")
def update_summary_table_row(
    report_id: str,
    row_id: int,
    body: UpdateSummaryRowRequest,
    session: Session = Depends(get_session),
) -> SummaryRowOut:
    """Update title, owner, or relevance note for a summary table row."""
    row = session.get(SummaryRowDB, row_id)
    if not row or row.report_id != report_id:
        raise HTTPException(404, "Summary table row not found")

    if body.title is not None:
        row.title = body.title
    if body.owner is not None:
        row.owner = body.owner
    if body.relevance_note is not None:
        row.relevance_note = body.relevance_note

    session.add(row)
    session.commit()
    session.refresh(row)

    return SummaryRowOut(
        id=row.id,
        patent_id=row.patent_id,
        title=row.title,
        publication_number=row.publication_number,
        owner=row.owner,
        relevance_note=row.relevance_note,
    )


@router.patch("/{report_id}/matrix/{row_id}")
def update_matrix_entry(
    report_id: str,
    row_id: int,
    body: UpdateMatrixRequest,
    session: Session = Depends(get_session),
) -> MatrixEntryOut:
    """Update found status for a specific feature in the novelty matrix and sync claim chart."""
    row = session.get(MatrixEntryDB, row_id)
    if not row or row.report_id != report_id:
        raise HTTPException(404, "Matrix row not found")

    try:
        m_data = json.loads(row.feature_results_json or "{}")
    except Exception:
        m_data = {}
    m_data[str(body.feature_index)] = body.found
    row.feature_results_json = json.dumps(m_data)
    session.add(row)

    # Sync with ClaimChartRowDB
    cc_row = session.exec(
        select(ClaimChartRowDB).where(
            ClaimChartRowDB.report_id == report_id,
            ClaimChartRowDB.patent_id == row.patent_id,
            ClaimChartRowDB.feature_index == body.feature_index,
        )
    ).first()
    if cc_row:
        cc_row.found = body.found
        session.add(cc_row)

    session.commit()
    session.refresh(row)

    return MatrixEntryOut(
        id=row.id,
        patent_id=row.patent_id,
        patent_title=row.patent_title,
        publication_number=row.publication_number,
        feature_results=json.loads(row.feature_results_json),
    )


@router.delete("/{report_id}", status_code=204)
def delete_report(
    report_id: str, session: Session = Depends(get_session)
) -> None:
    """Delete a report and all its associated data."""
    report = session.get(Report, report_id)
    if not report:
        raise HTTPException(404, "Report not found")

    # Delete child records first
    for model in [
        KeyFeatureDB,
        PatentInputDB,
        SummaryRowDB,
        ClaimChartRowDB,
        MatrixEntryDB,
    ]:
        rows = session.exec(
            select(model).where(model.report_id == report_id)
        ).all()
        for row in rows:
            session.delete(row)

    session.delete(report)
    session.commit()

@router.post("/extract-pdf")
async def extract_pdf(file: UploadFile = File(...)):
    import fitz
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")
        text = ""
        for page in doc:
            text += page.get_text() + "\n\n"
        return {"text": text}
    except Exception as e:
        log.exception("Failed to extract PDF")
        raise HTTPException(status_code=400, detail=f"Failed to extract PDF: {str(e)}")
