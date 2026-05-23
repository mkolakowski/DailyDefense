from __future__ import annotations

import json
import os
import threading
from pathlib import Path

DATA_DIR = Path(os.environ.get("DATA_DIR", "/app/data"))
SCORES_FILE = DATA_DIR / "scores.json"

_lock = threading.Lock()


def _ensure_storage() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not SCORES_FILE.exists():
        SCORES_FILE.write_text(json.dumps({}), encoding="utf-8")


def _load() -> dict[str, list[dict]]:
    _ensure_storage()
    try:
        return json.loads(SCORES_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def _save(data: dict[str, list[dict]]) -> None:
    SCORES_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def submit_score(date_str: str, name: str, score: int) -> dict:
    name = (name or "anon").strip()[:16] or "anon"
    score = max(0, int(score))

    with _lock:
        data = _load()
        entries = data.setdefault(date_str, [])
        entries.append({"name": name, "score": score})
        entries.sort(key=lambda e: e["score"], reverse=True)
        del entries[50:]
        _save(data)
        rank = next(
            (i + 1 for i, e in enumerate(entries) if e["name"] == name and e["score"] == score),
            None,
        )
        return {"rank": rank, "total": len(entries), "top": entries[:10]}


def top_scores(date_str: str, limit: int = 10) -> list[dict]:
    with _lock:
        data = _load()
        return data.get(date_str, [])[:limit]
