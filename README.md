# DailyDefense

A daily tower-defense game in the browser. No sign-in required; everyone gets the same map each day and competes on a daily leaderboard.

- **Port**: `8014`
- **Stack**: Python 3.12, FastAPI, Uvicorn, vanilla JS + Canvas
- **Auth**: Google SSO is scaffolded but **disabled by default** (`AUTH_ENABLED=false`)
- **Container**: Docker / Docker Compose, GHCR-publishable

## Quick start

```bash
cp .env.example .env
docker compose up --build -d
```

Open <http://localhost:8014> on desktop or iOS Safari.

### Local (without Docker)

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8014 --reload
```

## Gameplay

- **Grid**: 10 wide × 20 tall.
- **Map**: 1–6 enemy paths, 1–2 defense points. Deterministic per UTC day.
- **Turrets** (cannot be placed on path cells):
  - **Close** — short range, high DPS.
  - **Medium** — long range, single target.
  - **AoE** — splash damage on impact.
- **Enemies**:
  - **Runner** — fast, low HP.
  - **Tank** — slow, high HP.
- **Lives** drop when an enemy reaches a defense point. Survive 12 waves to win.
- **Scores** are submitted to the daily leaderboard at `/api/scores`.

Keyboard: `1`/`2`/`3` select turret · `N` next wave · `R` reset.

## Project layout

```
DailyDefense/
├── app/
│   ├── main.py          # FastAPI: mounts /static, routes
│   ├── config.py        # pydantic-settings
│   ├── auth.py          # Google SSO (gated by AUTH_ENABLED)
│   ├── routes/
│   │   ├── health.py
│   │   └── game.py      # /api/daily, /api/scores
│   ├── game/
│   │   ├── daily.py     # date-seeded daily payload
│   │   └── scores.py    # JSON-backed score store (volume)
│   └── static/          # index.html, game.js, style.css
├── docs/                # per-major changelogs
├── .github/workflows/   # GHCR publish
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── pyproject.toml
├── VERSION
└── .env.example
```

## Versioning

- Semantic versioning (`MAJOR.MINOR.PATCH`), bumped per feature or bugfix.
- Each major version has its own changelog under `docs/CHANGELOG-vN.md`.
- Every version change is committed, pushed, and the app is restarted via `docker compose up --build -d`.

## Container image

Published to GHCR on pushes to `main` and on `v*.*.*` tags:

```
ghcr.io/mkolakowski/dailydefense:<tag>
```

## License

MIT — see [LICENSE](LICENSE).
