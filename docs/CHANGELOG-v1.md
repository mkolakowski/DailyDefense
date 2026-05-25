# Changelog — v1

All notable changes to the `1.x` series of DailyDefense are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] — 2026-05-25

### Added
- **In-app wiki at `/wiki`.** Renders every Markdown file in `docs/`
  (changelogs, TODO, etc.) as a styled HTML page. The wiki home lists
  all available documents and links to the GitHub project at
  <https://github.com/mkolakowski/DailyDefense>. Each doc page has a
  back link to the wiki home and a footer with GitHub / Wiki / App
  links. From now on, any new documentation dropped into `docs/` is
  served by the wiki automatically — no code change required.
- **"Wiki" link in the main-page footer**, next to "Reset save" and
  "health".
- `app/routes/wiki.py` — slug validation (`[A-Za-z0-9._-]+` only, and
  the resolved path must stay inside `docs/`), so the route cannot be
  coaxed into serving arbitrary files.
- `app/static/wiki.css` — minimal MD3-styled prose layout for the
  rendered pages (tables, code blocks, blockquotes, headings).
- `markdown==3.7` dependency for server-side rendering. Extensions
  enabled: `extra` (tables, fenced code), `sane_lists`, `toc`.

### Changed
- Cache-control middleware: `/wiki` and `/wiki/*` now use `no-cache`
  so documentation updates are picked up immediately on the next
  request after a release.

## [1.0.0] — 2026-05-24

### Changed — project pivot
DailyDefense is now an **idle RPG** instead of a tower defense game. All
gameplay code from the `0.x` series was removed; the FastAPI / Docker /
cache-busting / Cloudflare-tunnel / MD3 foundation is unchanged.

### Added
- **Auto-combat loop.** Your character and the current zone's enemy trade
  blows on independent timers (player swings every 1.5 s, each enemy has
  its own attack cadence). Damage = `max(1, attacker.atk - defender.def)`.
- **Four zones**, each with one enemy and a level requirement:
  | Zone             | Enemy   | HP  | ATK | DEF | XP  | Gold | Lv req |
  |------------------|---------|-----|-----|-----|-----|------|--------|
  | Forest Meadow    | Slime   | 20  | 2   | 0   | 10  | 3    | 1      |
  | Goblin Caves     | Goblin  | 60  | 5   | 1   | 25  | 8    | 3      |
  | Orc Mountain     | Orc     | 150 | 12  | 3   | 60  | 20   | 6      |
  | Dragon Volcano   | Dragon  | 500 | 30  | 8   | 200 | 75   | 10     |
- **Three upgrades** with exponential pricing: Attack (+1 ATK), Defense
  (+1 DEF), Health (+10 max HP).
- **Leveling** via XP curve `floor(40 · level^1.65)`. Each level grants
  +1 ATK and +5 max HP and fully heals.
- **Persistence** via `localStorage`. Saves every 5 s and on `pagehide` /
  `visibilitychange → hidden`. Tab close + reopen restores progress.
- **Combat log** (last 24 events), colour-coded for kills, deaths,
  level-ups, and zone changes.
- "Reset save" link in the footer (with confirmation).

### Removed
- Tower-defense gameplay: canvas board, enemy paths, turret placement,
  XP/leveling per turret, mode picker (Daily / Endless / Random), wave
  scheduling, daily seed, score submission, leaderboards.
- Backend routes: `/api/daily`, `/api/scores`.
- Files: `app/game/daily.py`, `app/game/scores.py`,
  `app/routes/game.py`, `app/game/__init__.py`.

### Retained from `0.x`
- FastAPI app, uvicorn `--proxy-headers --forwarded-allow-ips=*`.
- Cache-busting middleware (`/static/*` immutable, `/` no-cache,
  `/api/*` + `/health` no-store).
- `?v=<APP_VERSION>` query strings on static assets.
- Favicon (SVG + 32 PNG + 180 PNG apple-touch-icon) and the
  `/favicon.ico` route.
- Google SSO scaffolding (still gated behind `AUTH_ENABLED`).
- Cloudflare Tunnel compose override.
- MD3 design tokens, Roboto / Roboto Mono.
- All CLAUDE.md rules — every version change is still committed, pushed,
  and the container is restarted via `docker compose up --build -d`.
