# =============================================================================
# llm_client.py — Instructor-wrapped LLM client (Ollama & LM Studio compatible)
# =============================================================================
"""
Ollama and LM Studio both expose an OpenAI-compatible REST API (/v1).
Instructor wraps it to enforce typed, Pydantic-validated outputs.

Mode selection rationale
────────────────────────
Mode.JSON_SCHEMA  → sends response_format: {type: "json_schema", schema: {...}}
                    Both modern Ollama and LM Studio builds support "json_schema"
                    and "text".

Mode.MD_JSON      → no response_format header; instructs via system prompt to
                    wrap output in ```json fences. Use as fallback if
                    JSON_SCHEMA causes issues with a particular model.

Mode.JSON         → sends response_format: {type: "json_object"} — rejected by
                    most LM Studio builds (only "json_schema"/"text" allowed).
"""
from __future__ import annotations

import instructor
from instructor import Mode
from openai import OpenAI

import config as cfg


def get_client(mode: Mode = Mode.JSON_SCHEMA) -> instructor.Instructor:
    """
    Return an Instructor-patched client pointing at the configured LLM endpoint or provider.
    """
    cfg.get_active_model_config()
    if cfg.ACTIVE_PROVIDER == "claude":
        from anthropic import Anthropic
        base = Anthropic(api_key=cfg.LM_STUDIO_API_KEY)
        return instructor.from_anthropic(base)
    base = OpenAI(
        base_url=cfg.LM_STUDIO_BASE_URL,
        api_key=cfg.LM_STUDIO_API_KEY,
    )
    return instructor.from_openai(base, mode=mode)


class DynamicInstructorClient:
    """
    Dynamic wrapper around Instructor + OpenAI/Anthropic client so changing
    provider, cfg.LM_STUDIO_BASE_URL or API key takes immediate effect without server restart.
    """

    def __init__(self, mode: Mode = Mode.JSON_SCHEMA):
        self._mode = mode
        self._cached_provider = None
        self._cached_url = None
        self._cached_key = None
        self._client = None

    @property
    def chat(self):
        cfg.get_active_model_config()
        if (
            self._client is None
            or self._cached_provider != cfg.ACTIVE_PROVIDER
            or self._cached_url != cfg.LM_STUDIO_BASE_URL
            or self._cached_key != cfg.LM_STUDIO_API_KEY
        ):
            self._cached_provider = cfg.ACTIVE_PROVIDER
            self._cached_url = cfg.LM_STUDIO_BASE_URL
            self._cached_key = cfg.LM_STUDIO_API_KEY

            if self._cached_provider == "claude":
                from anthropic import Anthropic
                base = Anthropic(api_key=self._cached_key)
                self._client = instructor.from_anthropic(base)
            else:
                base = OpenAI(
                    base_url=self._cached_url,
                    api_key=self._cached_key,
                )
                self._client = instructor.from_openai(base, mode=self._mode)
        return self._client.chat


# Module-level singleton — imported by pipeline.py
llm = DynamicInstructorClient()
