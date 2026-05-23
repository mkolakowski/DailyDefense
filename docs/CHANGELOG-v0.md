# Changelog — v0

All notable changes to the `0.x` series of DailyDefense are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] — 2026-05-23

### Added
- **Tower defense game** — playable in desktop browsers and iOS Safari.
- 10×20 grid map with **1–6 paths** and **1–2 defense points**, deterministically generated per UTC date (seed from `/api/daily`).
- Three turret types: **Close** (short range, high DPS), **Medium** (long range, single target), **AoE** (splash damage). Turrets cannot be placed on path cells.
- Two enemy types: **Runner** (fast, low HP) and **Tank** (slow, high HP). Enemies pick a random path per spawn.
- Daily leaderboard at `/api/scores` backed by a JSON file in the `dailydefense-data` Docker volume.
- Static frontend at `/` (`app/static/`) with touch + mouse input, HUD (lives/money/wave/score), and an end-of-run submission flow.

### Changed
- `/` now serves the game UI instead of the SSO landing page. SSO routes are still gated by `AUTH_ENABLED` and remain reachable when enabled.
- `docker-compose.yml` adds a named volume (`dailydefense-data`) mounted at `/app/data` for persistent scores.

## [0.2.0] — 2026-05-23

### Added
- `AUTH_ENABLED` environment toggle. Google SSO is **disabled by default**; set `AUTH_ENABLED=true` in `.env` to re-enable.
- CLAUDE.md rules: start the app via `docker compose up --build -d` after every version update; document the SSO toggle.

### Changed
- `/auth/login` and `/auth/callback` return 404 when authentication is disabled.
- Index page (`/`) shows a "Authentication is currently disabled" notice when `AUTH_ENABLED=false`.

## [0.1.0] — 2026-05-23

### Added
- Initial project scaffold.
- FastAPI application skeleton on port `8014` with `/health` and `/` routes.
- Google SSO via Authlib (`/auth/login`, `/auth/callback`, `/auth/logout`).
- `Dockerfile` and `docker-compose.yml` (GHCR-labelled image).
- GitHub Actions workflow to build and publish the image to GHCR on `main` and `v*.*.*` tags.
- `.env.example` template, `pyproject.toml`, `requirements.txt`, `VERSION` file, `README.md`, and `LICENSE` (MIT).
