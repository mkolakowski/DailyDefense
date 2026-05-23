from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.game.daily import daily_payload, today_utc
from app.game.scores import submit_score, top_scores

router = APIRouter(prefix="/api", tags=["game"])


class ScoreSubmission(BaseModel):
    date: str = Field(..., description="ISO date the run was played (UTC).")
    name: str = Field(default="anon", max_length=16)
    score: int = Field(..., ge=0, le=10_000_000)


@router.get("/daily")
async def get_daily() -> dict:
    return daily_payload()


@router.get("/scores")
async def get_scores(date: str | None = None, limit: int = 10) -> dict:
    d = date or today_utc().isoformat()
    return {"date": d, "scores": top_scores(d, limit=max(1, min(limit, 50)))}


@router.post("/scores")
async def post_score(submission: ScoreSubmission) -> dict:
    if submission.date != today_utc().isoformat():
        raise HTTPException(status_code=400, detail="Score date must be today (UTC).")
    return submit_score(submission.date, submission.name, submission.score)
