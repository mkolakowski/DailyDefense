# Changelog — v1

All notable changes to the `1.x` series of DailyDefense are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] — 2026-05-25

### Added
- **Animated combat arena.** The combat card now opens with a stage
  where your character and the current zone's enemy face off as SVG
  figures. Each swing triggers a lunge animation; the target shakes
  and flashes; a floating `-N` damage number rises from the hit. Kills
  fade out + rotate; respawns scale back in. Player death dims the
  figure and the rest banner takes over.
- **Per-enemy sprites.** Slime (green blob), Goblin (snarling green
  humanoid with a dagger), Orc (tusked brute with a club), and Dragon
  (winged, horned, red) all have distinct silhouettes drawn from
  primitives so they recolour cheaply.
- **Equipment system.** Two slots — weapon and armor — with a five-tier
  ladder each:
  | Tier | Weapon         | ATK | Cost     | Armor           | DEF | Cost      |
  |------|----------------|-----|----------|-----------------|-----|-----------|
  | 1    | Wooden Club    | +0  | starter  | Cloth Tunic     | +0  | starter   |
  | 2    | Iron Sword     | +3  | 50 g     | Leather Armor   | +2  | 60 g      |
  | 3    | Steel Sword    | +8  | 250 g    | Chainmail       | +6  | 300 g     |
  | 4    | Flaming Blade  | +20 | 1,500 g  | Plate Armor     | +15 | 1,800 g   |
  | 5    | Dragonslayer   | +50 | 8,000 g  | Dragonscale     | +35 | 10,000 g  |
  Bonuses stack on top of base stats and the existing Attack / Defense
  upgrades. The equipped weapon changes the player's shape and colour
  (club → sword → flame-tipped sword → greatsword); the equipped armor
  changes the body fill.
- **Shop overlay.** A new "Open Shop" button in the Equipment sidebar
  panel opens a modal with both equipment tracks. Each item shows a
  colour swatch, name, bonus, and a Buy / Equip / Equipped action
  button. Closes on backdrop click, the `×` button, or Escape.
- **Auto-equip on upgrade.** Buying a strictly stronger item in either
  slot equips it immediately so the bonus is felt without a second
  click.
- **Save migration.** `state.equipment` and `state.inventory` join the
  save schema; existing saves get the starter Wooden Club + Cloth Tunic
  via the same merge pattern that handled upgrades in 1.0.0.

### Changed
- The HUD's player stats line now shows **effective** ATK / DEF
  (base + upgrades + equipment) instead of just base + upgrades.
- The combat card's old static "You vs Enemy" header is replaced by
  the new animated arena; the HP / XP / reward bars below it are
  unchanged.

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
