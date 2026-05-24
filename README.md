# DailyDefense

A browser-based **idle RPG**. Your character auto-fights monsters in zones,
earns XP and gold, levels up, and buys upgrades. No sign-in required.
Progress saves locally to your browser.

- **Port**: `8014`
- **Stack**: Python 3.12, FastAPI, Uvicorn, vanilla JS
- **Auth**: Google SSO is scaffolded but **disabled by default** (`AUTH_ENABLED=false`)
- **Container**: Docker / Docker Compose, GHCR-publishable

> The `0.x` series shipped as a tower-defense game; the `1.x` series is an
> idle RPG. See [`docs/CHANGELOG-v1.md`](docs/CHANGELOG-v1.md) for the
> pivot details.

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

- **Auto-combat.** Your character swings every 1.5 s; each enemy has its
  own attack cadence. Damage = `max(1, atk - def)`.
- **Four zones** with progressively tougher enemies (Slime → Goblin → Orc
  → Dragon). New zones unlock as you level up.
- **Three upgrades** with exponential cost: Attack, Defense, Health.
- **Leveling** auto-grants +1 ATK and +5 max HP every level (full heal too).
- **Persistence** via `localStorage` — closes and re-opens cleanly.

## Cloudflare Tunnel

See the [Cloudflare Tunnel section](#cloudflare-tunnel-detailed) below.
Briefly: a `docker-compose.cloudflared.yml` override lets the app join an
existing external Docker network where your `cloudflared` container lives.

## Project layout

```
DailyDefense/
├── app/
│   ├── main.py          # FastAPI: routes, cache headers, static mount
│   ├── config.py        # pydantic-settings
│   ├── auth.py          # Google SSO scaffold (gated by AUTH_ENABLED)
│   ├── routes/health.py
│   └── static/          # index.html, game.js (idle RPG), style.css, icons
├── docs/                # Per-major changelogs and TODO
├── .github/workflows/   # GHCR publish
├── Dockerfile
├── docker-compose.yml
├── docker-compose.cloudflared.yml
├── requirements.txt
├── pyproject.toml
├── VERSION
└── .env.example
```

## Versioning

- Semantic versioning (`MAJOR.MINOR.PATCH`), bumped per feature or bugfix.
- Each major version has its own changelog under `docs/CHANGELOG-vN.md`.
- Every version change is committed, pushed, and the app is restarted via
  `docker compose up --build -d`.

## Container image

Published to GHCR on pushes to `main` and on `v*.*.*` tags:

```
ghcr.io/mkolakowski/dailydefense:<tag>
```

## Cloudflare Tunnel — detailed

The app trusts `X-Forwarded-*` headers (uvicorn is started with
`--proxy-headers --forwarded-allow-ips=*`).

### Same Docker host

```bash
docker network ls
docker network create cloudflared        # only if it doesn't exist
docker compose -f docker-compose.yml -f docker-compose.cloudflared.yml up -d
```

In the Cloudflare Zero Trust dashboard, point the tunnel at
`http://dailydefense:8014`. Override the network name with
`CLOUDFLARED_NETWORK` in `.env` if needed.

### Host-installed cloudflared

Port 8014 is published — point the tunnel at `http://localhost:8014`.

## License

MIT — see [LICENSE](LICENSE).
