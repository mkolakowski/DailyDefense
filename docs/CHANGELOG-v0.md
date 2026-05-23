# Changelog — v0

All notable changes to the `0.x` series of DailyDefense are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-05-23

### Added
- Initial project scaffold.
- FastAPI application skeleton on port `8014` with `/health` and `/` routes.
- Google SSO via Authlib (`/auth/login`, `/auth/callback`, `/auth/logout`).
- `Dockerfile` and `docker-compose.yml` (GHCR-labelled image).
- GitHub Actions workflow to build and publish the image to GHCR on `main` and `v*.*.*` tags.
- `.env.example` template, `pyproject.toml`, `requirements.txt`, `VERSION` file, `README.md`, and `LICENSE` (MIT).
