# DailyDefense

A Python application scaffold with Google SSO, ready to run via Docker Compose and to publish to the GitHub Container Registry.

- **Port**: `8014`
- **Stack**: Python 3.12, FastAPI, Uvicorn, Authlib
- **Auth**: Google SSO (OpenID Connect)
- **Container**: Docker / Docker Compose, GHCR-publishable

## Quick start

1. Copy the env template and fill in values:
   ```bash
   cp .env.example .env
   ```
   Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and a strong `SESSION_SECRET`.

2. Build and run with Docker Compose:
   ```bash
   docker compose up --build
   ```

3. Open <http://localhost:8014> and sign in with Google.

### Local (without Docker)

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8014 --reload
```

## Project layout

```
DailyDefense/
├── app/                 # FastAPI application
│   ├── main.py
│   ├── config.py
│   ├── auth.py          # Google SSO
│   └── routes/
├── docs/                # Changelogs and docs
├── .github/workflows/   # GHCR publish workflow
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
- Every version change is committed and pushed.

## Container image

Published to GHCR on pushes to `main` and on `v*.*.*` tags:

```
ghcr.io/mkolakowski/dailydefense:<tag>
```

## License

MIT — see [LICENSE](LICENSE).
