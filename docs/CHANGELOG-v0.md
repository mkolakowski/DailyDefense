# Changelog — v0

All notable changes to the `0.x` series of DailyDefense are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.10.1] — 2026-05-23

### Fixed
- **Random mode was unreachable from the UI.** v0.10.0 added the mode, its config, its leaderboards, and its sub-picker — but I never added the `Random` segment to the top-level mode picker. The picker is now three segments (Daily / Endless / Random), and selecting Random reveals the `12 waves / Infinite` sub-picker as designed.

## [0.10.0] — 2026-05-23

### Added
- **Random mode.** A third top-level mode in the picker — no money management; tap any eligible cell and the next random turret (Close / Medium / AoE) drops there. A fresh random turret rolls after every placement. Two length options:
  - **12 waves** — finite run (`random` mode key).
  - **Infinite** — endless-normal-style scaling, auto-advance, never stops (`random-infinite` mode key).
- **Placement radius.** Turrets must be placed within a Chebyshev distance of `5` cells of any defense point — the "home base" zone. The first stretch of every path is now intentionally undefended, forcing concentrated placement around the base. Applies to all modes.
- **Eligible-cell highlighting.** Cells where a turret can be placed are now drawn with a soft cyan overlay on the board. Updates live as turrets are placed (occupied cells lose the highlight).
- **Per-mode leaderboards** for `random` and `random-infinite` (six leaderboards total now).
- New "Next turret" indicator in the sidebar (replaces the picker when in Random mode).
- Sidebar HUD shows `—` for money in Random mode.

### Changed
- `waveSpec()` now reads scaling from any mode that has a `cfg.scaling` table (was: only `cfg.family === "endless"`). This makes `random-infinite` reuse the endless-normal escalation curve without duplication.
- `endRun()` shows the survival format (`Survived 1m 23s · wave N · score X`) for any infinite-wave mode, not just `endless-*`.

## [0.9.0] — 2026-05-23

### Added — Material Design migration, phase 1 (foundations)
- **MD3 system colour tokens** defined on `:root` as CSS custom properties: `--md-sys-color-primary`, `--md-sys-color-surface`, `--md-sys-color-surface-container-*`, `--md-sys-color-outline`, etc. The existing palette is mapped into the MD3 roles; the in-canvas game palette (cyan / yellow / magenta turrets) is untouched.
- **MD3 elevation tokens** (`--md-sys-elevation-0` through `-5`) using the standard two-layer shadow recipe.
- **Roboto** and **Roboto Mono** loaded from Google Fonts (`preconnect` + `display: swap`). System stack is the fallback if fonts are blocked. HUD stats now use Roboto Mono for tabular numerals.
- Legacy `--accent`, `--panel`, `--ink` etc. tokens now alias to the MD3 tokens so existing CSS keeps working during the migration.

### Changed
- Mode picker and difficulty picker are now **MD3 segmented buttons** — a single rounded pill with connected segments, selected segment filled with secondary-container, MD3 state-layer hover/press tint. First proof of the new design system.
- `docs/TODO.md` rewritten as a four-phase Material Design plan; phase 1 marked in progress.

## [0.8.0] — 2026-05-23

### Added
- **Endless difficulties.** Three tiers, each with its own starting money, lives, scaling, and auto-advance cadence:
  | Difficulty | Start $ | Lives | Speed/wave | HP/wave | Auto-advance |
  |------------|---------|-------|------------|---------|--------------|
  | Easy       | $400    | 25    | +2.5 %     | +12 %   | 4 s          |
  | Normal     | $300    | 20    | +3.5 %     | +15 %   | 3 s          |
  | Hard       | $200    | 15    | +5.0 %     | +20 %   | 2 s          |
  Each also tightens spawn spacing and increases enemies-per-wave more aggressively.
- The mode picker now reveals a three-button difficulty selector when Endless is chosen.
- Each difficulty has its own leaderboard. New mode keys: `endless-easy`, `endless-normal`, `endless-hard`.
- `_normalized()` migrates any v0.7.0 `endless` rows into `endless-normal` on first read so no scores are lost.

### Changed
- `MODES` table now drives scaling — `waveSpec()` reads `cfg.scaling` instead of hard-coding numbers per mode. Adding a new difficulty or tweaking one is a single-row change.

## [0.7.0] — 2026-05-23

### Added
- **Endless mode.** A new game mode picker on the start overlay:
  - **Daily** — unchanged: 12 waves on today's seeded map, $120 to start.
  - **Endless** — **$300 to start**, **no wave cap**, and waves **auto-advance with a 3-second countdown** once the previous wave is cleared. Enemy speed multiplies by `1 + (wave-1) × 0.035` per wave, HP grows at `1 + (wave-1) × 0.15`, spawn spacing tightens, and there are more enemies per wave. Goal: highest score / longest survival.
  - The HUD's mode label shows `· Endless · 1m 23s` (elapsed survival time) for endless runs; for daily runs it still shows the date.
  - The Start Wave button doubles as a "skip countdown" button during the endless auto-advance window.
- **Per-mode leaderboards.** `/api/scores` and the storage layer now accept a `mode` parameter (`daily` or `endless`). Daily and endless scores have separate top-N lists for the same date. Legacy `{date: [scores]}` rows from before 0.7.0 are migrated into the `daily` bucket on read.

### Changed
- `applyModeDefaults()` was split out of `resetRun()` so switching modes on the start overlay re-applies the right starting money/lives immediately (you can preview what you're getting before clicking Start).
- `state.leaderboard` → `state.leaderboards.{daily,endless}` so both lists can be cached client-side and rendered without an extra round-trip when toggling modes.

## [0.6.0] — 2026-05-23

### Added
- **Turret XP and leveling system.**
  - Every enemy kill grants `XP = enemy.maxHp / 2`. The wave HP scaler means late-game kills are worth more XP.
  - Split **40 % killer · 30 % closest turret · 30 % even across all turrets**. If closest is the killer, both shares stack.
  - Unlimited levels. **XP to next level = `floor(50 × 1.5^(L−1))`** — 50, 75, 112, 168, 253, 380, 569 … so each level takes meaningfully longer.
  - Per-level bonuses use a diminishing-returns formula `bonus(L, cap) = cap × (1 − 0.8^(L−1))`. Caps: **damage +150 %, range +50 %, cooldown −60 %, splash +50 %** (AoE only). L2 ≈ +20 % dmg / +6 % range / −12 % cd; L5 ≈ +59 / +18 / −36; L10 ≈ +87 / +27 / −53.
  - The level digit is drawn inside the turret circle (bold dark ink on the bright fill).
- New `effectiveStats(turret)` is the single source of truth for in-flight stats; the simulation no longer reads `TURRETS[type]` directly.

### Changed
- "How to play" hint updated to explain the XP system.

## [0.5.4] — 2026-05-23

### Added
- **Favicon.** A small shield-with-defense-point icon (cyan outline + yellow centre dot on the app's dark navy background, matching the in-game palette). Shipped as:
  - `favicon.svg` (modern browsers)
  - `icon-32.png` (favicon fallback)
  - `icon-180.png` (`apple-touch-icon` for iOS home-screen install)
  - `/favicon.ico` is served as the 32×32 PNG so legacy clients stop logging 404s.
- All favicon URLs are versioned via `?v=<APP_VERSION>` so the cache-busting policy from v0.5.0 applies — a new icon in a future release will be picked up immediately.

## [0.5.3] — 2026-05-23

### Fixed
- **Turret selection still broken on iOS — root cause.** `updateHUD()` runs roughly every 100 ms and was calling the old `renderTurretButtons()`, which **rebuilt all three button DOM nodes from scratch**. On iOS Safari that destroyed the button between `pointerdown` and `pointerup`, so taps on Medium / AoE were silently dropped. Split into `buildTurretButtons()` (called once at init) and `syncTurretButtons()` (called on HUD updates and selection changes — only toggles `.selected` / `.unaffordable` classes on the existing nodes).

### Changed
- Enemy speeds halved again: Runner `0.035 → 0.018`, Tank `0.015 → 0.008`.

## [0.5.2] — 2026-05-23

### Fixed
- **Cannot select Medium or AoE turrets regardless of money.** Turret buttons were being `disabled` whenever the player couldn't afford them, which also blocked *selection*. They now stay enabled; the affordability is now a visual state only (`.unaffordable` class — dimmed and the price in red). The actual money check still runs at placement time inside `tryPlaceTurret`.
- **Erratic enemy pathing.** `walkPath` previously emitted a path that could revisit cells, then `dedupePath` stripped the duplicates, leaving non-adjacent cells next to each other in the path array — the enemy's interpolation then "teleported" between them. Rewrote `walkPath` so it never revisits cells (consecutive entries are always 4-adjacent), with strong weight toward the target and small perpendicular detours for variety. `dedupePath` is gone.

### Changed
- Enemy speeds slowed to keep the new shorter paths fair: Runner `0.06 → 0.035`, Tank `0.025 → 0.015`. Roughly half-speed across the board.

## [0.5.1] — 2026-05-23

### Fixed
- **Start button unresponsive on iOS Safari.** Replaced raw `click` listeners on every interactive button (overlay Start/Submit, sidebar Start Wave/Reset, all turret buttons) with a new `activate()` helper that listens for both `click` and `pointerup` (touch/pen only, deduped within 350 ms). This works around a Safari quirk where the synthesized `click` is occasionally suppressed for elements inside an absolutely-positioned overlay layered over a canvas with active touch listeners.
- Added explicit `type="button"` to all `<button>` elements so they never fall back to the implicit `submit` behaviour, even though there is no form on the page.

## [0.5.0] — 2026-05-23

### Added
- **Cache-busting on version change.** `index.html` now references static assets as `style.css?v=<APP_VERSION>` and `game.js?v=<APP_VERSION>` (the version is injected server-side from `app.__version__`). When a new release ships, the URLs change and Cloudflare/browsers treat them as new resources — no manual cache purge required.
- HTTP response middleware sets explicit `Cache-Control` headers:
  - `/static/*` → `public, max-age=31536000, immutable` (cache effectively forever; safe because URLs are versioned).
  - `/` → `no-cache` (the entry-point HTML must always be revalidated so new versioned URLs are picked up immediately).
  - `/health` and `/api/*` → `no-store` (never cache dynamic JSON).

### Changed
- `app/main.py` renders `index.html` through a small in-memory template (single `{{VERSION}}` substitution, cached with `lru_cache`) instead of returning the raw file. Negligible per-request cost; rendered once per process.

## [0.4.4] — 2026-05-23

### Added
- `docs/TODO.md` — running list of open work items. First entry: refresh the UI to Material Design.
- Link to TODO.md from `docs/README.md`.

## [0.4.3] — 2026-05-23

### Changed
- CLAUDE.md rule 12 rewritten to make it unambiguous: the application must be restarted via `docker compose up --build -d` after **every** version change (major, minor, or patch). Verification step (`/health` returns the new version) is now part of the rule.

## [0.4.2] — 2026-05-23

### Changed
- Version number is now shown as a pill next to "DailyDefense" in the header HUD (still fetched from `/health`).
- Removed the duplicate version label from the footer; the footer keeps only the `health` link.

## [0.4.1] — 2026-05-23

### Fixed
- **Overlay buttons on iOS Safari (and everywhere else).** The `.hidden` class was scoped only to the overlay container, so toggling `hidden` on `#overlay-start` / `#overlay-submit` did nothing — both buttons were always visible at the start of a run and at game over. Promoted `.hidden` to a global rule.
- iOS hit area: bumped `button.primary` / `button.ghost` to `min-height: 44px` and increased padding to match the iOS Human Interface Guidelines tap target.
- iOS quirks: added `touch-action: manipulation`, `-webkit-user-select: none`, `-webkit-touch-callout: none`, and `-webkit-appearance: none` to all interactive buttons. Prevents the long-press callout menu and the (vestigial) 300ms tap delay, and stops Safari from styling our buttons with its own appearance.

### Changed
- Pressed-state feedback (`:active`) now includes a brightness shift in addition to the 1px translate, so a tap is clearly registered even with `-webkit-tap-highlight-color: transparent`.
- Footer version label now reads from `/health` instead of being hard-coded in `game.js`, so it stops drifting between releases.

## [0.4.0] — 2026-05-23

### Added
- **Cloudflare Tunnel support.** Uvicorn now starts with `--proxy-headers --forwarded-allow-ips=*` so the app sees the correct scheme/host when sitting behind any reverse proxy.
- `docker-compose.cloudflared.yml` override file that attaches the `app` container to an existing external Docker network (default name `cloudflared`, override via `CLOUDFLARED_NETWORK`). The tunnel container then reaches the app at `http://dailydefense:8014`.
- README section documenting both same-Docker-network and host-cloudflared setups.

## [0.3.1] — 2026-05-23

### Changed
- `.env.example` expanded into a fully-commented sample environment file with grouped sections (Application, Sessions, Storage, Authentication) and inline guidance.
- Documented the `DATA_DIR` variable (used by the score store) — previously read by code but not surfaced in the template.

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
