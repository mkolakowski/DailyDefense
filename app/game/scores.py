from __future__ import annotations

import json
import os
import threading
from pathlib import Path

DATA_DIR = Path(os.environ.get("DATA_DIR", "/app/data"))
SCORES_FILE = DATA_DIR / "scores.json"

VALID_MODES = ("daily", "endless-easy", "endless-normal", "endless-hard")

_lock = threading.Lock()


def _ensure_storage() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not SCORES_FILE.exists():
        SCORES_FILE.write_text(json.dumps({}), encoding="utf-8")


def _normalized(raw: dict) -> dict[str, dict[str, list[dict]]]:
    """Storage is `{date: {mode: [scores]}}`. Migrations applied on read:

    - Legacy `{date: [scores]}` (pre-v0.7.0) -> daily bucket.
    - Legacy `endless` bucket (v0.7.0) -> `endless-normal`.
    """
    out: dict[str, dict[str, list[dict]]] = {}
    for date, entry in raw.items():
        if isinstance(entry, list):
            out[date] = {"daily": entry}
            continue
        if not isinstance(entry, dict):
            continue
        bucket: dict[str, list[dict]] = {}
        for m in VALID_MODES:
            if m in entry:
                bucket[m] = list(entry[m])
        if "endless" in entry and "endless-normal" not in bucket:
            bucket["endless-normal"] = list(entry["endless"])
        out[date] = bucket
    return out


def _load() -> dict[str, dict[str, list[dict]]]:
    _ensure_storage()
    try:
        raw = json.loads(SCORES_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        raw = {}
    return _normalized(raw)


def _save(data: dict[str, dict[str, list[dict]]]) -> None:
    SCORES_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def submit_score(date_str: str, mode: str, name: str, score: int) -> dict:
    if mode not in VALID_MODES:
        raise ValueError(f"Invalid mode: {mode}")
    name = (name or "anon").strip()[:16] or "anon"
    score = max(0, int(score))

    with _lock:
        data = _load()
        day = data.setdefault(date_str, {})
        entries = day.setdefault(mode, [])
        entries.append({"name": name, "score": score})
        entries.sort(key=lambda e: e["score"], reverse=True)
        del entries[50:]
        _save(data)
        rank = next(
            (i + 1 for i, e in enumerate(entries) if e["name"] == name and e["score"] == score),
            None,
        )
        return {"rank": rank, "total": len(entries), "top": entries[:10]}


def top_scores(date_str: str, mode: str, limit: int = 10) -> list[dict]:
    if mode not in VALID_MODES:
        return []
    with _lock:
        data = _load()
        return data.get(date_str, {}).get(mode, [])[:limit]
