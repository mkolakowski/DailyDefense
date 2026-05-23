from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.game.daily import daily_payload, today_utc
from app.game.scores import VALID_MODES, submit_score, top_scores

router = APIRouter(prefix="/api", tags=["game"])


class ScoreSubmission(BaseModel):
    date: str = Field(..., description="ISO date the run was played (UTC).")
    mode: str = Field(default="daily", description="Game mode.")
    name: str = Field(default="anon", max_length=16)
    score: int = Field(..., ge=0, le=10_000_000)


@router.get("/daily")
async def get_daily() -> dict:
    return daily_payload()


@router.get("/scores")
async def get_scores(date: str | None = None, mode: str = "daily", limit: int = 10) -> dict:
    if mode not in VALID_MODES:
        raise HTTPException(status_code=400, detail=f"Invalid mode: {mode}")
    d = date or today_utc().isoformat()
    return {
        "date": d,
        "mode": mode,
        "scores": top_scores(d, mode, limit=max(1, min(limit, 50))),
    }


@router.post("/scores")
async def post_score(submission: ScoreSubmission) -> dict:
    if submission.mode not in VALID_MODES:
        raise HTTPException(status_code=400, detail=f"Invalid mode: {submission.mode}")
    if submission.date != today_utc().isoformat():
        raise HTTPException(status_code=400, detail="Score date must be today (UTC).")
    return submit_score(submission.date, submission.mode, submission.name, submission.score)
