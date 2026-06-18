"""Tactics mode: turn-based, grid-based army battler.

v1.3.0 ships only the foundation — a hand-built map, the commander sprite,
and click-to-move with movement-range highlighting. Enemies, full turn
structure, and procedurally generated maps come in later releases.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

from app import __version__

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

router = APIRouter(tags=["tactics"])


@lru_cache(maxsize=1)
def _rendered_tactics() -> str:
    html = (STATIC_DIR / "tactics.html").read_text(encoding="utf-8")
    return html.replace("{{VERSION}}", __version__)


@router.get("/tactics", include_in_schema=False, response_class=HTMLResponse)
async def tactics() -> HTMLResponse:
    return HTMLResponse(content=_rendered_tactics())
