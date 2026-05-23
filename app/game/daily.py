from __future__ import annotations

from datetime import date, datetime, timezone
from hashlib import sha256


GRID_WIDTH = 10
GRID_HEIGHT = 20


def today_utc() -> date:
    return datetime.now(timezone.utc).date()


def seed_for_date(d: date) -> int:
    """Deterministic 32-bit seed derived from the UTC date."""
    digest = sha256(d.isoformat().encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big")


def daily_payload(d: date | None = None) -> dict:
    d = d or today_utc()
    return {
        "date": d.isoformat(),
        "seed": seed_for_date(d),
        "grid": {"width": GRID_WIDTH, "height": GRID_HEIGHT},
    }
