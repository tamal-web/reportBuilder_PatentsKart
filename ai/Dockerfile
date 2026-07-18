# =============================================================================
# Backend Dockerfile — Prior-Art Report Builder (FastAPI)
# =============================================================================
# Stage 1: dependency builder (cached separately from app code)
FROM python:3.11-slim AS deps

WORKDIR /build

# Install build tools needed by some Python packages (chromadb, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        gcc \
        g++ \
        git \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip first (separate layer — cached)
RUN pip install --upgrade pip

COPY requirements.txt .

# ── Step 1: Install lightweight deps first (fast, cached separately) ──────────
# Split from the heavy deps so a network failure on a large package
# doesn't re-download these from scratch.
RUN pip install --no-cache-dir \
        --retries 10 \
        --timeout 300 \
        --prefix=/install \
        fastapi>=0.111.0 \
        uvicorn[standard]>=0.30.0 \
        python-multipart>=0.0.9 \
        sqlmodel>=0.0.19 \
        pydantic>=2.7.0 \
        python-docx>=1.1.0 \
        openai>=1.0.0

# ── Step 2: Install heavy AI/ML deps (large downloads, separate cached layer) ─
# chromadb + sentence-transformers are ~400-500 MB combined.
# Separate layer means Docker cache preserves them on rebuild.
RUN pip install --no-cache-dir \
        --retries 10 \
        --timeout 600 \
        --prefix=/install \
        langgraph>=0.1.0 \
        instructor>=1.0.0

RUN pip install --no-cache-dir \
        --retries 10 \
        --timeout 600 \
        --prefix=/install \
        sentence-transformers>=2.7.0

RUN pip install --no-cache-dir \
        --retries 10 \
        --timeout 600 \
        --prefix=/install \
        chromadb>=0.5.0


# =============================================================================
# Stage 2: runtime image
FROM python:3.11-slim AS runtime

WORKDIR /app

# Runtime system deps (no build tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder stage
COPY --from=deps /install /usr/local

# Create non-root user
RUN useradd -m -u 1001 appuser

# Copy application source
COPY --chown=appuser:appuser . .

# Create mount-point directories that will be Docker volumes
RUN mkdir -p /data/db /data/chroma /data/exports \
 && chown -R appuser:appuser /data

USER appuser

# Expose FastAPI port
EXPOSE 8000

# Health check — hits the root endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/')" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
