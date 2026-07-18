# =============================================================================
# pipeline.py — LangGraph multi-agent pipeline
# =============================================================================
"""
Graph topology
──────────────
START
  │
  ▼
index_patent ──────────────────────────────────────────────┐
  │                                                         │  (loop back per patent)
  ▼                                                         │
generate_summary_entry                                      │
  │                                                         │
  ▼                                                         │
generate_claim_entry ◄─ (self-loop: more features) ──┐     │
  │                                                   │     │
  ├── [more features] ───────────────────────────────►┘     │
  ├── [more patents]  ──► advance_to_next_patent ───────────┘
  └── [all done]      ──► generate_matrix ──► END
"""
from __future__ import annotations

import logging
from typing import Dict, List, TypedDict

from langgraph.graph import END, START, StateGraph

import config as cfg
from llm_client import llm
from models import (ClaimChartEntry, ClaimChartLLMOutput, KeyFeature,
                    MatrixEntry, PatentDocument, ReportData, SummaryLLMOutput,
                    SummaryTableEntry)
from rag import PatentRAG

log = logging.getLogger(__name__)

# Module-level RAG singleton (shared across all nodes)
rag = PatentRAG()


# =============================================================================
# State
# =============================================================================


class AgentState(TypedDict):
    # ── Inputs (set once, never modified) ──────────────────────────────────
    patents: List[PatentDocument]
    key_features: List[KeyFeature]

    # ── Loop cursors ────────────────────────────────────────────────────────
    patent_idx: int  # index of the patent currently being processed
    feature_idx: int  # index of the feature currently being processed

    # ── Accumulated results ─────────────────────────────────────────────────
    summary_table: List[SummaryTableEntry]
    claim_charts: Dict[str, List[ClaimChartEntry]]  # {patent_id: [entries]}
    matrix: List[MatrixEntry]

    # ── Diagnostics ─────────────────────────────────────────────────────────
    logs: List[str]
    errors: List[str]


# =============================================================================
# Nodes
# =============================================================================


def node_index_patent(state: AgentState) -> dict:
    """Index the current patent into RAG (clears any previously indexed patent)."""
    patent = state["patents"][state["patent_idx"]]
    n_chunks = rag.index_patent(patent)
    msg = (
        f"[Patent {state['patent_idx'] + 1}/{len(state['patents'])}] "
        f"Indexed '{patent.publication_number}' → {n_chunks} chunks"
    )
    log.info(msg)
    return {"logs": state["logs"] + [msg]}


# ─────────────────────────────────────────────────────────────────────────────


def node_generate_summary_entry(state: AgentState) -> dict:
    """
    Use LLM to extract bibliographic info for the current patent and
    append a SummaryTableEntry to the accumulated summary_table list.
    """
    patent = state["patents"][state["patent_idx"]]
    features = state["key_features"]

    # Retrieve overview context — title/abstract/assignee appear early
    context_chunks = rag.retrieve(
        "patent title abstract owner assignee applicant invention summary", n_results=4
    )
    context_str = (
        "\n\n---\n\n".join(context_chunks)
        if context_chunks
        else "(no context retrieved)"
    )

    feature_list = "\n".join(f"  {f.index}. {f.description}" for f in features)

    system_msg = (
        "You are a patent bibliographic analyst. "
        "Your job is to extract structured metadata from patent documents. "
        "Always return valid data — use the fallback values provided if the "
        "text does not contain the information."
    )

    user_msg = (
        f"Extract bibliographic information from the following patent passages.\n\n"
        f"=== PATENT PASSAGES ===\n{context_str}\n\n"
        f"=== FALLBACK METADATA (use if not found in text) ===\n"
        f"Title: {patent.title}\n"
        f"Publication Number: {patent.publication_number}\n"
        f"Owner/Assignee: {patent.owner or 'Unknown'}\n\n"
        f"=== INVENTION FEATURES (for relevance note) ===\n{feature_list}\n\n"
        "Write a one-sentence relevance note explaining how this patent "
        "relates to the invention features listed above."
    )

    errors = state["errors"]

    try:
        result: SummaryLLMOutput = llm.chat.completions.create(
            model=cfg.LM_STUDIO_MODEL,
            response_model=SummaryLLMOutput,
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            max_tokens=cfg.MAX_TOKENS,
            temperature=cfg.TEMPERATURE,
            max_retries=2,
        )
        entry = SummaryTableEntry(
            patent_id=patent.id,
            title=result.title or patent.title,
            publication_number=result.publication_number or patent.publication_number,
            owner=result.owner or patent.owner,
            relevance_note=result.relevance_note,
        )
        msg = f"  ✓ Summary: '{entry.title[:50]}'"
    except Exception as exc:
        log.warning("Summary entry failed for %s: %s", patent.id, exc)
        entry = SummaryTableEntry(
            patent_id=patent.id,
            title=patent.title,
            publication_number=patent.publication_number,
            owner=patent.owner,
            relevance_note="[Auto-generation failed — please fill in manually]",
        )
        msg = f"  ⚠ Summary fallback for '{patent.publication_number}'"
        errors = errors + [f"summary/{patent.id}: {exc}"]

    return {
        "summary_table": state["summary_table"] + [entry],
        "logs": state["logs"] + [msg],
        "errors": errors,
    }


# ─────────────────────────────────────────────────────────────────────────────


def node_generate_claim_entry(state: AgentState) -> dict:
    """
    For the current (patent, feature) pair:
      1. Retrieve the most relevant passages via RAG.
      2. Ask the LLM to determine if the feature is disclosed and
         produce a paraphrased justification.
      3. Store the ClaimChartEntry and advance feature_idx.
    """
    patent = state["patents"][state["patent_idx"]]
    feature = state["key_features"][state["feature_idx"]]
    errors = state["errors"]

    # RAG retrieval — use the full feature description as the search query
    context_chunks = rag.retrieve(feature.description, n_results=cfg.RAG_TOP_K)
    context_str = (
        "\n\n---\n\n".join(context_chunks)
        if context_chunks
        else "(No relevant passages found in this patent.)"
    )

    system_msg = (
        "You are an expert patent analyst performing prior art searches. "
        "Your task is to determine whether a given key feature of an invention "
        "is disclosed — explicitly or implicitly — in a prior art patent. "
        "\n\n"
        "IMPORTANT RULES:\n"
        "- Set found=true if the patent discloses the feature directly, or describes "
        "a component/method that inherently performs the same function, even if "
        "different words are used. Look for conceptual equivalence, not just "
        "verbatim matches.\n"
        "- Set found=false ONLY if there is genuinely no corresponding concept "
        "anywhere in the provided passages.\n"
        "- Do NOT default to found=false out of uncertainty. If the passages "
        "show any related concept, set found=true and explain the correspondence.\n"
        "- Your justification must cite specific language from the patent passages."
    )

    user_msg = (
        f"=== KEY FEATURE (Feature {feature.index}) ===\n"
        f"{feature.description}\n\n"
        f"=== RELEVANT PASSAGES FROM PATENT {patent.publication_number} ===\n"
        f"{context_str}\n\n"
        "=== YOUR TASK ===\n"
        "Read the passages above carefully. Determine whether the patent "
        "discloses the key feature (directly or through an equivalent concept).\n\n"
        "If found=true: Write 2-4 sentences explaining which passage discloses "
        "the feature and how, paraphrasing the patent's own language.\n"
        "If found=false (only if truly absent): Write exactly: "
        "'This feature is not explicitly disclosed in this patent.'"
    )

    try:
        result: ClaimChartLLMOutput = llm.chat.completions.create(
            model=cfg.LM_STUDIO_MODEL,
            response_model=ClaimChartLLMOutput,
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            max_tokens=cfg.MAX_TOKENS,
            temperature=cfg.TEMPERATURE,
            max_retries=2,
        )
        entry = ClaimChartEntry(
            feature_index=feature.index,
            feature_description=feature.description,
            justification=result.justification,
            found=result.found,
        )
        status = "✓" if result.found else "✗"
        msg = f"    F{feature.index} {status} [{patent.publication_number}]"
        log.info(
            "Claim entry %s/F%d: found=%s",
            patent.id, feature.index, result.found
        )

    except Exception as exc:
        log.warning("Claim entry failed for %s/F%d: %s", patent.id, feature.index, exc)
        entry = ClaimChartEntry(
            feature_index=feature.index,
            feature_description=feature.description,
            justification="[Auto-generation failed — please fill in manually]",
            found=False,
        )
        msg = f"    F{feature.index} ⚠ [{patent.publication_number}] (error)"
        errors = errors + [f"claim/{patent.id}/F{feature.index}: {exc}"]

    # Merge into claim_charts dict (return full dict — LangGraph replaces the field)
    charts = dict(state["claim_charts"])
    charts[patent.id] = charts.get(patent.id, []) + [entry]

    return {
        "claim_charts": charts,
        "feature_idx": state["feature_idx"] + 1,
        "logs": state["logs"] + [msg],
        "errors": errors,
    }


# ─────────────────────────────────────────────────────────────────────────────


def node_advance_to_next_patent(state: AgentState) -> dict:
    """Reset the feature cursor and move to the next patent."""
    msg = f"  → Advancing to patent {state['patent_idx'] + 2}"
    log.info(msg)
    return {
        "patent_idx": state["patent_idx"] + 1,
        "feature_idx": 0,
        "logs": state["logs"] + [msg],
    }


# ─────────────────────────────────────────────────────────────────────────────


def node_generate_matrix(state: AgentState) -> dict:
    """
    Derive the Novelty Matrix from completed claim charts.
    No LLM call needed — the matrix is a structured summary of found/not-found
    decisions already made by the claim chart agents.
    """
    matrix: List[MatrixEntry] = []

    for patent in state["patents"]:
        entries = state["claim_charts"].get(patent.id, [])
        feature_results = {e.feature_index: e.found for e in entries}
        matrix.append(
            MatrixEntry(
                patent_id=patent.id,
                patent_title=patent.title,
                publication_number=patent.publication_number,
                feature_results=feature_results,
            )
        )

    msg = f"✓ Matrix generated for {len(matrix)} patent(s)"
    log.info(msg)
    return {
        "matrix": matrix,
        "logs": state["logs"] + [msg],
    }


# =============================================================================
# Routing
# =============================================================================


def route_after_claim_entry(state: AgentState) -> str:
    """
    Decide what to do after generating a (patent, feature) claim chart entry.

    - More features remain for this patent   → generate_claim_entry  (self-loop)
    - All features done, more patents remain → advance_to_next_patent
    - All features AND patents done          → generate_matrix
    """
    if state["feature_idx"] < len(state["key_features"]):
        return "generate_claim_entry"

    if state["patent_idx"] + 1 < len(state["patents"]):
        return "advance_to_next_patent"

    return "generate_matrix"


# =============================================================================
# Graph assembly
# =============================================================================


def build_graph() -> "CompiledStateGraph":
    """
    Construct and compile the LangGraph state machine.

    The compiled graph is callable:
        result_state = graph.invoke(initial_state)
    """
    g = StateGraph(AgentState)

    # Register nodes
    g.add_node("index_patent", node_index_patent)
    g.add_node("generate_summary_entry", node_generate_summary_entry)
    g.add_node("generate_claim_entry", node_generate_claim_entry)
    g.add_node("advance_to_next_patent", node_advance_to_next_patent)
    g.add_node("generate_matrix", node_generate_matrix)

    # Edges
    g.add_edge(START, "index_patent")
    g.add_edge("index_patent", "generate_summary_entry")
    g.add_edge("generate_summary_entry", "generate_claim_entry")

    g.add_conditional_edges(
        "generate_claim_entry",
        route_after_claim_entry,
        {
            "generate_claim_entry": "generate_claim_entry",  # self-loop
            "advance_to_next_patent": "advance_to_next_patent",
            "generate_matrix": "generate_matrix",
        },
    )

    g.add_edge("advance_to_next_patent", "index_patent")  # patent loop
    g.add_edge("generate_matrix", END)

    return g.compile()


# =============================================================================
# Public runner
# =============================================================================


def run_pipeline(
    patents: List[PatentDocument],
    key_features: List[KeyFeature],
    verbose: bool = True,
) -> ReportData:
    """
    Run the full prior-art pipeline and return a ReportData object
    ready for generate_docx().

    Args:
        patents:      List of PatentDocument objects (content already extracted).
        key_features: List of KeyFeature objects (1-indexed).
        verbose:      Print progress logs to stdout.

    Returns:
        ReportData with summary_table, claim_charts, and matrix populated.
    """
    if not patents:
        raise ValueError("patents list is empty")
    if not key_features:
        raise ValueError("key_features list is empty")

    graph = build_graph()

    initial_state: AgentState = {
        "patents": patents,
        "key_features": key_features,
        "patent_idx": 0,
        "feature_idx": 0,
        "summary_table": [],
        "claim_charts": {},
        "matrix": [],
        "logs": ["Pipeline started"],
        "errors": [],
    }

    final_state: AgentState = graph.invoke(initial_state)

    if verbose:
        print("\n".join(final_state["logs"]))
        if final_state["errors"]:
            print("\n⚠ Errors:")
            for e in final_state["errors"]:
                print(f"  • {e}")

    return ReportData(
        key_features=key_features,
        patents=patents,
        summary_table=final_state["summary_table"],
        claim_charts=final_state["claim_charts"],
        matrix=final_state["matrix"],
    )
