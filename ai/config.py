# =============================================================================
# config.py — Central configuration for the Prior Art Agent
# =============================================================================
# All values can be overridden via environment variables.
# Defaults are configured for Ollama (http://127.0.0.1:11434/v1), but you
# can switch back to LM Studio at any time by setting LM_STUDIO_BASE_URL
# to http://127.0.0.1:1234/v1 without changing any code or API endpoints.
# =============================================================================
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional

# ── Base LLM URL & Credentials ───────────────────────────────────────────────
# For Ollama (default):    http://127.0.0.1:11434/v1
# For LM Studio:           http://127.0.0.1:1234/v1
# In Docker:               http://host.docker.internal:11434/v1
LM_STUDIO_BASE_URL = os.getenv("LM_STUDIO_BASE_URL", "http://127.0.0.1:11434/v1")
LM_STUDIO_API_KEY  = os.getenv("LM_STUDIO_API_KEY",  "lm-studio")
LM_STUDIO_MODEL    = os.getenv("LM_STUDIO_MODEL", "local-model")

# ── Dynamic Model Selection ───────────────────────────────────────────────────
ACTIVE_MODEL_JSON = os.getenv("ACTIVE_MODEL_JSON", "./_active_model.json")
ACTIVE_MODEL_FILE = os.getenv("ACTIVE_MODEL_FILE", "./_active_model.txt")
ACTIVE_PROVIDER   = "ollama"


def get_active_model_config() -> dict:
    """Read persisted active model config from JSON or fallback to text file/env vars."""
    global ACTIVE_PROVIDER, LM_STUDIO_BASE_URL, LM_STUDIO_API_KEY, LM_STUDIO_MODEL
    try:
        if os.path.exists(ACTIVE_MODEL_JSON):
            with open(ACTIVE_MODEL_JSON, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict) and "model" in data:
                    ACTIVE_PROVIDER = data.get("provider", "ollama")
                    LM_STUDIO_BASE_URL = data.get("base_url") or LM_STUDIO_BASE_URL
                    LM_STUDIO_API_KEY = data.get("api_key") or LM_STUDIO_API_KEY
                    LM_STUDIO_MODEL = data["model"]
                    return data
    except Exception:
        pass

    try:
        if os.path.exists(ACTIVE_MODEL_FILE):
            with open(ACTIVE_MODEL_FILE, "r", encoding="utf-8") as f:
                model = f.read().strip()
                if model:
                    LM_STUDIO_MODEL = model
                    ACTIVE_PROVIDER = "ollama"
                    return {"model": model, "provider": "ollama", "base_url": LM_STUDIO_BASE_URL, "api_key": LM_STUDIO_API_KEY}
    except Exception:
        pass

    return {
        "model": os.getenv("LM_STUDIO_MODEL", "local-model"),
        "provider": "ollama",
        "base_url": LM_STUDIO_BASE_URL,
        "api_key": LM_STUDIO_API_KEY,
    }


def get_active_model() -> str:
    """Read the persisted active model selection."""
    cfg_data = get_active_model_config()
    return cfg_data.get("model", "local-model")


def set_active_model(
    model_name: str,
    provider: str = "ollama",
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
) -> None:
    """Set the active model + provider in memory and persist across restarts."""
    global LM_STUDIO_MODEL, ACTIVE_PROVIDER, LM_STUDIO_BASE_URL, LM_STUDIO_API_KEY
    LM_STUDIO_MODEL = model_name
    ACTIVE_PROVIDER = provider
    if base_url:
        LM_STUDIO_BASE_URL = base_url
    elif provider == "ollama" and "host.docker.internal" not in LM_STUDIO_BASE_URL:
        LM_STUDIO_BASE_URL = "http://127.0.0.1:11434/v1"
    if api_key is not None:
        LM_STUDIO_API_KEY = api_key

    cfg_dict = {
        "model": model_name,
        "provider": provider,
        "base_url": LM_STUDIO_BASE_URL,
        "api_key": LM_STUDIO_API_KEY,
    }
    try:
        with open(ACTIVE_MODEL_JSON, "w", encoding="utf-8") as f:
            json.dump(cfg_dict, f, indent=2)
        with open(ACTIVE_MODEL_FILE, "w", encoding="utf-8") as f:
            f.write(model_name)
    except Exception as e:
        print(f"Failed to save active model to {ACTIVE_MODEL_JSON}: {e}")


get_active_model_config()

# ── Dynamic Report Logo Selection ─────────────────────────────────────────────
REPORT_LOGO_FILE = os.getenv("REPORT_LOGO_FILE", "./_active_logo.txt")


def get_report_logo_path() -> Optional[Path]:
    """Return the absolute Path to the active report logo image (or None if disabled)."""
    base_dir = Path(__file__).parent
    try:
        if os.path.exists(REPORT_LOGO_FILE):
            with open(REPORT_LOGO_FILE, "r", encoding="utf-8") as f:
                path_str = f.read().strip()
                if path_str == "NONE":
                    return None
                if path_str:
                    p = Path(path_str)
                    if not p.is_absolute():
                        p = base_dir / p
                    if p.exists():
                        return p
    except Exception:
        pass
    default_logo = base_dir / "patentskart.png"
    return default_logo if default_logo.exists() else None


def set_report_logo_path(path_str: str) -> None:
    """Set and persist the active logo path (or 'NONE' to disable)."""
    try:
        with open(REPORT_LOGO_FILE, "w", encoding="utf-8") as f:
            f.write(path_str)
    except Exception as e:
        print(f"Failed to save active logo path to {REPORT_LOGO_FILE}: {e}")


# ── LLM inference ─────────────────────────────────────────────────────────────
MAX_TOKENS  = int(os.getenv("MAX_TOKENS",  "1024"))
TEMPERATURE = float(os.getenv("TEMPERATURE", "0.1"))

# ── Database ──────────────────────────────────────────────────────────────────
# Locally:    sqlite:///./reports.db  (relative to ai/ directory — unchanged)
# In Docker:  sqlite:////data/db/reports.db  (mounted volume)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./reports.db")

# ── RAG ───────────────────────────────────────────────────────────────────────
# Locally:    ./chroma_store   (relative to ai/ directory — unchanged)
# In Docker:  /data/chroma     (mounted volume)
CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "./chroma_store")
EMBEDDING_MODEL    = os.getenv("EMBEDDING_MODEL",    "all-MiniLM-L6-v2")
RAG_TOP_K          = int(os.getenv("RAG_TOP_K", "10"))
CHUNK_OVERLAP      = int(os.getenv("CHUNK_OVERLAP",  "40"))

# ── Exports ───────────────────────────────────────────────────────────────────
# Locally:    ./exports   (relative to ai/ directory — unchanged)
# In Docker:  /data/exports  (mounted volume)
EXPORTS_DIR = os.getenv("EXPORTS_DIR", "./exports")

# ── CORS ──────────────────────────────────────────────────────────────────────
# Comma-separated list of allowed origins.
# Default covers both local dev and Docker (frontend on port 3000).
_cors_raw    = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
CORS_ORIGINS = [o.strip() for o in _cors_raw.split(",") if o.strip()]


# ── Report templates ──────────────────────────────────────────────────────────
@dataclass
class ReportTemplate:
    """Visual style settings for the generated .docx report."""

    name: str = "Default"
    header_bg_color: str = "1B3A6B"   # Navy  (no leading #)
    header_text_color: str = "FFFFFF"  # White
    alt_row_bg_color: str = "EFF6FF"   # Light blue
    border_color: str = "CBD5E1"       # Slate
    yes_cell_color: str = "DCFCE7"     # Light green  (feature found)
    no_cell_color: str = "FEE2E2"      # Light red    (feature not found)
    font_name: str = "Calibri"
    font_size_pt: int = 11
    header_font_size_pt: int = 11


TEMPLATES: Dict[str, ReportTemplate] = {
    "default": ReportTemplate(),
    "professional": ReportTemplate(
        name="Professional",
        header_bg_color="1E293B",
        alt_row_bg_color="F8FAFC",
        border_color="94A3B8",
    ),
    "blue": ReportTemplate(
        name="Blue",
        header_bg_color="1D4ED8",
        alt_row_bg_color="DBEAFE",
        border_color="93C5FD",
    ),
    "green": ReportTemplate(
        name="Green",
        header_bg_color="166534",
        alt_row_bg_color="F0FDF4",
        yes_cell_color="BBF7D0",
        no_cell_color="FEE2E2",
    ),
    "minimal": ReportTemplate(
        name="Minimal",
        header_bg_color="374151",
        alt_row_bg_color="F9FAFB",
        border_color="D1D5DB",
        yes_cell_color="D1FAE5",
        no_cell_color="FEE2E2",
    ),
}
