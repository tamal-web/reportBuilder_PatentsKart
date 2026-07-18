# =============================================================================
# rag.py — Patent RAG: index one patent at a time, retrieve by feature query
# =============================================================================
from __future__ import annotations

import logging
import re
import uuid
from typing import Dict, List, Optional

import chromadb
from chromadb.utils import embedding_functions

import config as cfg
from models import PatentDocument

log = logging.getLogger(__name__)


# ── Chunk helpers ─────────────────────────────────────────────────────────────


def _split_claims(text: str) -> List[str]:
    """
    Extract individual patent claims from the claims section.
    Handles both "1. ..." and "Claim 1. ..." numbering styles.
    """
    chunks: List[str] = []

    # Locate the CLAIMS section (common header variants)
    m = re.search(
        r"\b(?:CLAIMS?|What is claimed is)\b[:\s]*\n(.*)",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if not m:
        return chunks

    claims_block = m.group(1)

    # Split on "1. " / "1) " at the start of a line
    parts = re.split(r"(?m)^\s*(\d{1,3})[.)]\s+", claims_block)

    i = 1
    while i < len(parts) - 1:
        num = parts[i].strip()
        body = parts[i + 1].strip()
        if body:
            chunks.append(f"Claim {num}: {body}")
        i += 2

    return chunks


def _split_description(text: str) -> List[str]:
    """
    Extract numbered paragraphs [0001] from the description section,
    or fall back to double-newline paragraph splitting.
    """
    chunks: List[str] = []

    # Locate description block (before CLAIMS)
    m = re.search(
        r"\b(?:DETAILED\s+DESCRIPTION|DESCRIPTION\s+OF\s+(?:THE\s+)?(?:PREFERRED\s+)?EMBODIMENT|SPECIFICATION)\b(.*?)(?=\bCLAIMS?\b)",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    block = m.group(1) if m else text

    # Numbered paragraph style [0001]
    parts = re.split(r"\[(\d{4,6})\]", block)
    if len(parts) > 2:
        i = 1
        while i < len(parts) - 1:
            num = parts[i]
            body = parts[i + 1].strip()
            if len(body) > 40:
                chunks.append(f"[{num}] {body}")
            i += 2
        return chunks

    # Double-newline paragraphs
    for para in re.split(r"\n{2,}", block):
        para = para.strip()
        if len(para) > 60:
            chunks.append(para)

    return chunks


def _word_chunks(text: str, size: int = 350, overlap: int = 40) -> List[str]:
    """Fixed-size word-level chunking with overlap — used as final fallback."""
    words = text.split()
    chunks: List[str] = []
    step = max(size - overlap, 1)
    for i in range(0, len(words), step):
        chunk = " ".join(words[i : i + size])
        if chunk:
            chunks.append(chunk)
    return chunks


def chunk_patent(patent: PatentDocument) -> List[str]:
    """
    Chunk a patent into retrievable pieces.

    Priority:
      1. Individual claims (highest signal for claim chart generation)
      2. Numbered description paragraphs
      3. Double-newline paragraphs
      4. Fixed word-size fallback
    """
    text = patent.content

    claim_chunks = _split_claims(text)
    desc_chunks = _split_description(text)

    all_chunks = claim_chunks + desc_chunks

    if len(all_chunks) < 5:
        # Not enough structure found — fall back to word-level chunking
        all_chunks = _word_chunks(text, size=350, overlap=cfg.CHUNK_OVERLAP)

    # Deduplicate while preserving order
    seen: set = set()
    unique: List[str] = []
    for c in all_chunks:
        key = c[:120]
        if key not in seen:
            seen.add(key)
            unique.append(c)

    log.info(
        "Chunked '%s' → %d chunks (%d claims, %d desc)",
        patent.publication_number,
        len(unique),
        len(claim_chunks),
        len(desc_chunks),
    )
    return unique


# ── PatentRAG class ───────────────────────────────────────────────────────────


class PatentRAG:
    """
    Manages a ChromaDB vector store for one patent at a time.

    Usage:
        rag = PatentRAG()
        rag.index_patent(patent)          # clears previous, indexes new
        passages = rag.retrieve(query)    # returns top-k passages
    """

    def __init__(self, persist_dir: str = cfg.CHROMA_PERSIST_DIR):
        self._client = chromadb.PersistentClient(path=persist_dir)
        self._ef = embedding_functions.DefaultEmbeddingFunction()
        self._collection: Optional[chromadb.Collection] = None
        self._active_patent_id: Optional[str] = None

    # ── Public API ──────────────────────────────────────────────────────────

    def index_patent(self, patent: PatentDocument) -> int:
        """
        Index a single patent. Any previously indexed patent is cleared first.
        Returns the number of chunks indexed.
        """
        col_name = self._collection_name(patent.id)

        # Delete previous collection if it exists
        self._clear_collection(col_name)

        collection = self._client.create_collection(
            name=col_name,
            embedding_function=self._ef,
            metadata={"patent_id": patent.id, "pub_number": patent.publication_number},
        )

        chunks = chunk_patent(patent)
        if not chunks:
            log.warning("No chunks produced for patent %s", patent.id)
            return 0

        ids = [f"{patent.id}_{i}" for i in range(len(chunks))]
        collection.add(documents=chunks, ids=ids)

        self._collection = collection
        self._active_patent_id = patent.id
        log.info("Indexed %d chunks for '%s'", len(chunks), patent.publication_number)
        return len(chunks)

    def retrieve(self, query: str, n_results: int = cfg.RAG_TOP_K) -> List[str]:
        """
        Retrieve the top-n most semantically similar chunks for a query.
        Raises RuntimeError if no patent is indexed.
        """
        if self._collection is None:
            raise RuntimeError("No patent indexed. Call index_patent() first.")

        count = self._collection.count()
        if count == 0:
            return []

        results = self._collection.query(
            query_texts=[query],
            n_results=min(n_results, count),
        )
        docs = results.get("documents", [[]])[0]
        return docs

    def clear(self):
        """Explicitly remove the active patent index from memory."""
        if self._collection and self._active_patent_id:
            self._clear_collection(self._collection_name(self._active_patent_id))
        self._collection = None
        self._active_patent_id = None

    # ── Private helpers ─────────────────────────────────────────────────────

    @staticmethod
    def _collection_name(patent_id: str) -> str:
        # ChromaDB collection names must be alphanumeric + hyphens, 3-63 chars
        safe = re.sub(r"[^a-zA-Z0-9\-]", "-", patent_id)[:50]
        return f"pat-{safe}"

    def _clear_collection(self, name: str):
        try:
            self._client.delete_collection(name)
        except Exception:
            pass
