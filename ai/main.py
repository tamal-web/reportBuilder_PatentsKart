# =============================================================================
# main.py — FastAPI application entry point
# =============================================================================
"""
Prior-Art Search Report Generation System — FastAPI Backend

Local development (unchanged):
    cd ai
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
    # or:
    uv run fastapi dev

Docker:
    docker compose up --build

API docs: http://localhost:8000/docs
"""
from __future__ import annotations

import asyncio
import json
import logging
import sys
from contextlib import asynccontextmanager
from typing import Optional

import httpx
import shutil
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, File, UploadFile, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

import config as cfg
from database import create_db_and_tables
from routers import export, reports

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger(__name__)


@asynccontextmanager

async def lifespan(app: FastAPI):
    """Create DB tables on startup."""
    create_db_and_tables()
    yield


app = FastAPI(
    title="Prior-Art Report Builder API",
    description="Agentic prior-art search report generation with LangGraph + LM Studio.",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Origins come from config (env var CORS_ORIGINS).
# Default covers localhost:3000 for both local dev and Docker.
app.add_middleware(
    CORSMiddleware,
    allow_origins=cfg.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(reports.router)
app.include_router(export.router)


@app.get("/")
def health_check():
    """Health check endpoint — used by Docker HEALTHCHECK."""
    return {"status": "ok", "service": "Prior-Art Report Builder API"}


from pydantic import BaseModel

def get_backend_llm_base_url() -> str:
    """Derive root host URL (e.g. http://127.0.0.1:11434 or http://host.docker.internal:11434) from cfg.LM_STUDIO_BASE_URL."""
    return cfg.LM_STUDIO_BASE_URL.split("/v1")[0].rstrip("/")


# Your curated "best for this app" list. Add/remove freely.
OLD_CURATED_MODELS = [
    {
        "id": "llama3.1:8b",
        "name": "Llama 3.1 8B",
        "description": "Meta's general-purpose model, solid all-rounder.",
    },
    {
        "id": "qwen2.5:14b",
        "name": "Qwen 2.5 14B",
        "description": "Strong reasoning and coding performance.",
    },
    {
        "id": "deepseek-r1:8b",
        "name": "DeepSeek R1 8B",
        "description": "Reasoning-focused distilled model.",
    },
    {
        "id": "mistral:7b",
        "name": "Mistral 7B",
        "description": "Fast, lightweight, good for general chat.",
    },
]
CURATED_MODELS = [
    {
        "id": "qwen2.5:0.5b",
        "name": "Qwen 2.5 0.5B",
        "description": "Tiny, ultra-fast model for basic chat and simple tasks.",
    },
    {
        "id": "tinyllama",
        "name": "TinyLlama 1.1B",
        "description": "Very lightweight general-purpose chat model.",
    },
    {
        "id": "qwen2.5:1.5b",
        "name": "Qwen 2.5 1.5B",
        "description": "Small model with decent reasoning for its size.",
    },
    {
        "id": "llama3.2:1b",
        "name": "Llama 3.2 1B",
        "description": "Meta's compact model, good all-rounder for low-resource setups.",
    },
    {
        "id": "deepseek-r1:1.5b",
        "name": "DeepSeek R1 1.5B",
        "description": "Small distilled reasoning-focused model.",
    },
    {
        "id": "gemma2:2b",
        "name": "Gemma 2 2B",
        "description": "Google's efficient small model, strong for its size.",
    },
    {
        "id": "smollm2:1.7b",
        "name": "SmolLM2 1.7B",
        "description": "Compact model tuned for fast, lightweight chat.",
    },
]


class ActiveModelRequest(BaseModel):
    model_id: str
    provider: Optional[str] = "ollama"
    base_url: Optional[str] = None
    api_key: Optional[str] = None


class CloudModelSearchRequest(BaseModel):
    provider: str
    api_key: str


@app.get("/api/models/active")
async def get_active_model_endpoint():
    """Get the currently selected model and provider used for inference."""
    cfg.get_active_model_config()
    return {
        "active_model": cfg.LM_STUDIO_MODEL,
        "provider": getattr(cfg, "ACTIVE_PROVIDER", "ollama"),
        "base_url": cfg.LM_STUDIO_BASE_URL,
        "has_api_key": bool(cfg.LM_STUDIO_API_KEY and cfg.LM_STUDIO_API_KEY != "lm-studio"),
    }


@app.post("/api/models/active")
async def set_active_model_endpoint(req: ActiveModelRequest):
    """Set the currently selected model and provider to be used for inference."""
    provider = (req.provider or "ollama").lower().strip()
    if provider != "ollama" and not req.api_key:
        if getattr(cfg, "ACTIVE_PROVIDER", "ollama") != provider or not cfg.LM_STUDIO_API_KEY or cfg.LM_STUDIO_API_KEY == "lm-studio":
            raise HTTPException(status_code=400, detail=f"API key is required to activate cloud provider: {provider}")

    cfg.set_active_model(
        model_name=req.model_id,
        provider=provider,
        base_url=req.base_url,
        api_key=req.api_key or cfg.LM_STUDIO_API_KEY,
    )
    return {
        "status": "ok",
        "active_model": cfg.LM_STUDIO_MODEL,
        "provider": getattr(cfg, "ACTIVE_PROVIDER", "ollama"),
    }


@app.post("/api/models/cloud/search")
async def search_cloud_models(req: CloudModelSearchRequest):
    """Fetch available models using the provided API key for Claude, Gemini, or Grok."""
    provider = req.provider.lower().strip()
    api_key = req.api_key.strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="Please enter an API key to search models.")

    models = []
    if provider == "claude":
        try:
            headers = {
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            }
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get("https://api.anthropic.com/v1/models", headers=headers)
                if resp.status_code == 200:
                    data = resp.json().get("data", [])
                    for m in data:
                        mid = m.get("id", "")
                        if mid:
                            models.append({
                                "id": mid,
                                "name": m.get("display_name", mid),
                                "description": f"Anthropic Claude model ({mid})",
                                "recommended": mid == "claude-3-5-sonnet-latest" or "3-5-sonnet" in mid,
                            })
                elif resp.status_code in (401, 403):
                    raise HTTPException(status_code=401, detail="Invalid Anthropic API Key provided.")
        except HTTPException:
            raise
        except Exception as exc:
            log.warning(f"Could not reach Anthropic API models endpoint directly: {exc}")

        if not models:
            models = [
                {
                    "id": "claude-3-5-sonnet-latest",
                    "name": "Claude 3.5 Sonnet",
                    "description": "Most intelligent model for complex reasoning and structured reports",
                    "recommended": True,
                },
                {
                    "id": "claude-3-5-haiku-latest",
                    "name": "Claude 3.5 Haiku",
                    "description": "Fastest and most cost-effective model for rapid analysis",
                    "recommended": False,
                },
                {
                    "id": "claude-3-opus-latest",
                    "name": "Claude 3 Opus",
                    "description": "Powerful model for highly complex and specialized evaluation",
                    "recommended": False,
                },
            ]

    elif provider == "gemini":
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}")
                if resp.status_code == 200:
                    data = resp.json().get("models", [])
                    for m in data:
                        name = m.get("name", "").replace("models/", "")
                        methods = m.get("supportedGenerationMethods", [])
                        if "generateContent" in methods and "gemini" in name.lower():
                            models.append({
                                "id": name,
                                "name": m.get("displayName", name),
                                "description": m.get("description", f"Google Gemini model ({name})")[:120],
                                "recommended": name in ("gemini-1.5-flash", "gemini-2.5-flash", "gemini-2.0-flash"),
                            })
                elif resp.status_code in (400, 401, 403):
                    raise HTTPException(status_code=401, detail="Invalid Google Gemini API Key provided.")
        except HTTPException:
            raise
        except Exception as exc:
            log.warning(f"Could not reach Google Gemini models endpoint directly: {exc}")

        if not models:
            models = [
                {
                    "id": "gemini-1.5-flash",
                    "name": "Gemini 1.5 Flash",
                    "description": "Best balance of speed, accuracy, and long-context reasoning",
                    "recommended": True,
                },
                {
                    "id": "gemini-1.5-pro",
                    "name": "Gemini 1.5 Pro",
                    "description": "Advanced reasoning model for complex multi-patent analysis",
                    "recommended": False,
                },
                {
                    "id": "gemini-2.0-flash",
                    "name": "Gemini 2.0 Flash",
                    "description": "Next-gen multimodal and fast evaluation model",
                    "recommended": False,
                },
            ]

    elif provider == "grok":
        try:
            headers = {"Authorization": f"Bearer {api_key}"}
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get("https://api.x.ai/v1/models", headers=headers)
                if resp.status_code == 200:
                    data = resp.json().get("data", [])
                    for m in data:
                        mid = m.get("id", "")
                        if mid:
                            models.append({
                                "id": mid,
                                "name": mid.replace("-", " ").title(),
                                "description": f"xAI Grok model ({mid})",
                                "recommended": mid == "grok-2-latest" or "grok-2" in mid,
                            })
                elif resp.status_code in (401, 403):
                    raise HTTPException(status_code=401, detail="Invalid xAI Grok API Key provided.")
        except HTTPException:
            raise
        except Exception as exc:
            log.warning(f"Could not reach xAI Grok models endpoint directly: {exc}")

        if not models:
            models = [
                {
                    "id": "grok-2-latest",
                    "name": "Grok 2 Latest",
                    "description": "Latest Grok 2 model with cutting-edge reasoning and tool capabilities",
                    "recommended": True,
                },
                {
                    "id": "grok-2-1212",
                    "name": "Grok 2 (1212)",
                    "description": "Stable Grok 2 release build",
                    "recommended": False,
                },
                {
                    "id": "grok-beta",
                    "name": "Grok Beta",
                    "description": "Fast general intelligence model by xAI",
                    "recommended": False,
                },
            ]
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported cloud provider: {req.provider}")

    models.sort(key=lambda x: (not x.get("recommended", False), x["name"]))
    return {"provider": req.provider, "models": models}


@app.get("/api/settings/logo")
async def get_logo_settings():
    """Get active logo image configuration."""
    logo_path = cfg.get_report_logo_path()
    if logo_path is None:
        return {
            "status": "disabled",
            "logo_url": None,
            "filename": None,
        }
    return {
        "status": "active",
        "logo_url": "/api/settings/logo/image",
        "filename": logo_path.name,
    }


@app.get("/api/settings/logo/image")
async def get_logo_image():
    """Stream the active logo image file."""
    logo_path = cfg.get_report_logo_path()
    if not logo_path or not logo_path.exists():
        raise HTTPException(404, "No active logo image found.")
    ext = logo_path.suffix.lower()
    media_type = "image/png"
    if ext in [".jpg", ".jpeg"]:
        media_type = "image/jpeg"
    elif ext == ".svg":
        media_type = "image/svg+xml"
    return FileResponse(path=str(logo_path), media_type=media_type)


@app.post("/api/settings/logo/upload")
async def upload_logo_image(file: UploadFile = File(...)):
    """Upload and set a new custom logo image for .docx reports."""
    base_dir = Path(__file__).parent
    logos_dir = base_dir / "logos"
    logos_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename or "logo.png").suffix or ".png"
    dest_path = logos_dir / f"custom_logo{ext}"

    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    cfg.set_report_logo_path(str(dest_path))
    return {
        "status": "ok",
        "logo_url": "/api/settings/logo/image",
        "filename": dest_path.name,
    }


@app.post("/api/settings/logo/reset")
async def reset_logo_image():
    """Reset logo to the default patentskart.png."""
    base_dir = Path(__file__).parent
    default_p = base_dir / "patentskart.png"
    if default_p.exists():
        cfg.set_report_logo_path(str(default_p))
    else:
        cfg.set_report_logo_path("")
    return {"status": "ok", "filename": "patentskart.png"}


@app.post("/api/settings/logo/disable")
async def disable_logo_image():
    """Disable logo insertion in .docx reports."""
    cfg.set_report_logo_path("NONE")
    return {"status": "ok", "filename": None}


@app.get("/api/models")
async def list_models():
    """Curated models merged with their installed status and active status, read live from Ollama or LM Studio."""
    installed_ids = set()
    base_url = get_backend_llm_base_url()
    async with httpx.AsyncClient() as client:
        # 1. Try Ollama native /api/tags endpoint
        try:
            resp = await client.get(f"{base_url}/api/tags", timeout=5)
            if resp.status_code == 200:
                for m in resp.json().get("models", []):
                    name = m.get("name") or m.get("model")
                    if name:
                        installed_ids.add(name)
                        if name.endswith(":latest"):
                            installed_ids.add(name.replace(":latest", ""))
        except Exception:
            pass

        # 2. Try OpenAI-compatible /v1/models (supported by both Ollama and LM Studio)
        try:
            resp = await client.get(f"{cfg.LM_STUDIO_BASE_URL}/models", timeout=5)
            if resp.status_code == 200:
                for m in resp.json().get("data", []):
                    mid = m.get("id")
                    if mid:
                        installed_ids.add(mid)
                        if mid.endswith(":latest"):
                            installed_ids.add(mid.replace(":latest", ""))
        except Exception:
            pass

    curated_ids = {m["id"] for m in CURATED_MODELS}
    is_ollama_provider = getattr(cfg, "ACTIVE_PROVIDER", "ollama") == "ollama"
    result = []
    for model in CURATED_MODELS:
        mid = model["id"]
        is_installed = mid in installed_ids or f"{mid}:latest" in installed_ids
        is_active = is_ollama_provider and (
            mid == cfg.LM_STUDIO_MODEL
            or f"{mid}:latest" == cfg.LM_STUDIO_MODEL
            or mid == cfg.LM_STUDIO_MODEL.replace(":latest", "")
        )
        result.append({
            **model,
            "installed": is_installed,
            "active": is_active,
        })

    # Dynamically append any extra installed models found (e.g. pulled or custom models)
    for mid in sorted(installed_ids):
        clean_id = mid.replace(":latest", "")
        if clean_id not in curated_ids and mid not in curated_ids:
            is_active = is_ollama_provider and (
                mid == cfg.LM_STUDIO_MODEL
                or clean_id == cfg.LM_STUDIO_MODEL.replace(":latest", "")
            )
            result.append({
                "id": mid,
                "name": mid,
                "description": "Installed local model",
                "installed": True,
                "active": is_active,
            })

    return result


@app.websocket("/ws/models/pull")
async def pull_model_ws(websocket: WebSocket):
    """
    Protocol (client -> server), one pull at a time per connection:
      {"action": "start", "model": "llama3.1:8b"}
      {"action": "cancel"}

    Protocol (server -> client):
      {"type": "progress", "status": str, "percent": float|None, "completed": int|None, "total": int|None}
      {"type": "done", "model": str}
      {"type": "cancelled", "model": str}
      {"type": "error", "message": str}
    """
    await websocket.accept()
    pull_task: Optional[asyncio.Task] = None

    async def run_pull(model_id: str):
        base_url = get_backend_llm_base_url()
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream(
                    "POST",
                    f"{base_url}/api/pull",
                    json={"model": model_id, "stream": True},
                ) as response:
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        data = json.loads(line)

                        if "error" in data:
                            await websocket.send_json(
                                {"type": "error", "message": data["error"]}
                            )
                            return

                        if data.get("status") == "success":
                            await websocket.send_json(
                                {"type": "done", "model": model_id}
                            )
                            return

                        total = data.get("total")
                        completed = data.get("completed")
                        percent = (
                            round((completed / total) * 100, 1)
                            if total and completed
                            else None
                        )

                        await websocket.send_json(
                            {
                                "type": "progress",
                                "status": data.get("status"),
                                "percent": percent,
                                "completed": completed,
                                "total": total,
                            }
                        )
        except asyncio.CancelledError:
            await websocket.send_json({"type": "cancelled", "model": model_id})
            raise
        except Exception as exc:
            await websocket.send_json({"type": "error", "message": str(exc)})

    try:
        while True:
            message = await websocket.receive_json()
            action = message.get("action")

            if action == "start":
                model_id = message.get("model")
                if not model_id:
                    await websocket.send_json(
                        {"type": "error", "message": "No model id provided."}
                    )
                    continue
                if pull_task and not pull_task.done():
                    await websocket.send_json(
                        {"type": "error", "message": "A pull is already in progress."}
                    )
                    continue
                pull_task = asyncio.create_task(run_pull(model_id))

            elif action == "cancel":
                if pull_task and not pull_task.done():
                    pull_task.cancel()
                else:
                    await websocket.send_json(
                        {"type": "error", "message": "No active pull to cancel."}
                    )

            else:
                await websocket.send_json(
                    {"type": "error", "message": f"Unknown action: {action}"}
                )

    except WebSocketDisconnect:
        if pull_task and not pull_task.done():
            pull_task.cancel()


if __name__ == "__main__":
    import os
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "127.0.0.1")
    log.info("Starting standalone PyInstaller backend server on %s:%d...", host, port)
    uvicorn.run(app, host=host, port=port)


