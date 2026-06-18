# Changelog — v1

All notable changes to the `1.x` series of DailyDefense are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.0] — 2026-06-18

### Added — Deploy phase + unit classes ("Operation Muster Roll")
- **Deploy phase before every skirmish.** The battle now opens on a
  new `phase: "deploy"` step: the commander auto-deploys at the back,
  and the player picks classes from a sidebar roster + clicks cyan
  spawn tiles to place up to **3 additional allies**. Spawn zone is
  the bottom two rows of the map (any passable tile). Clicking a
  placed ally removes it; pressing **Begin Battle** transitions to
  Player phase Turn 1.
- **Three ally classes** alongside the commander:
  | Class    | HP | ⚔ | 🛡 | Move | Range |
  |----------|----|---|---|------|-------|
  | Warrior  | 30 | 6 | 2 | 3    | 1     |
  | Archer   | 18 | 5 | 0 | 3    | 2     |
  | Mage     | 16 | 8 | 0 | 2    | 2     |
  Each class has a fresh SVG sprite — Warrior with shield + axe,
  Archer with a hood + drawn bow, Mage with pointed hood + glowing
  staff. The class buttons in the sidebar preview the sprite + full
  stat line.
- **Attack range generalised.** Combat now uses each unit's
  `attackRange` (Manhattan distance). Melee = 1, bows / spells = 2.
  Post-move attack targeting highlights every enemy within range,
  not just adjacent ones, so Archers and Mages can shoot over a
  forest tile.
- **Goblin Archer enemy variant.** A new enemy type (HP 14 · ⚔ 5 ·
  Range 2 · Move 3) replaces one of the three goblins on the starting
  map. Its sprite carries a bow and quiver.
- **Smarter enemy targeting.** Each enemy now picks the closest living
  ally as its target (tie-breaking toward the commander), rather than
  always pathing to the commander. Pathing scores reachable tiles by
  how much further they need to close to get into attack range —
  ranged enemies stop and shoot from range 2 instead of bumping into
  melee.

### Changed
- Top HUD phase chip shows `Deploy · Muster your army` during the
  new phase (gold), then flips to `Turn N · Player phase` once the
  battle starts.
- "Skirmish again" now returns you to the deploy screen rather than
  re-running the previous loadout.
- Roster rows show each unit's attack range (`Rng N`) and tag the
  commander with `· cmdr` so the win-condition unit is obvious.

## [1.4.0] — 2026-06-18

### Added — Tactics combat loop ("Operation Skirmish Line")
- **Enemy units.** Three Goblins spawn on the far side of the
  battlefield (HP 20 · ⚔ 4 · 🛡 1 · move 3). New goblin sprite, mirrored
  to face the commander.
- **Turn-based phase machine.** The skirmish alternates **Player phase
  → Enemy phase** until one side is wiped:
  - Each ally gets one **move + (optional) attack** per turn. After
    moving, adjacent enemies are highlighted in red; click one to
    attack, or click anywhere else (or the new **Skip Attack** button)
    to end the unit's turn without striking.
  - The phase auto-ends once every living ally has acted, or the
    player can press **End Turn** to forfeit remaining acts.
- **Melee combat.** Damage = `max(1, attacker.atk - defender.def)`,
  matching the idle-RPG formula. Hits play an attack-lunge, a target
  shake + flash, and a floating `-N` damage popup. Deaths fade out and
  the fallen unit is removed from the board.
- **Enemy AI.** Each enemy BFS-finds its reachable tiles, picks the one
  with the smallest Manhattan distance to the commander (tie-breaking
  by lower path cost), animates the move, then attacks if it ends
  adjacent. Other units block movement.
- **Win / loss detection.** Wipe every enemy = **Victory** modal;
  commander HP ≤ 0 = **Defeated** modal. Both offer "Return to RPG"
  and "Skirmish again" (resets the board to a fresh battle).
- **Rewards back into the idle save.** A win reads
  `dailydefense.idle.v1` from localStorage, adds **+50 XP** and **+30
  gold**, and cascades the same level-up loop the idle game uses
  (XP curve `floor(40·level^1.65)`, +1 ATK / +5 max HP per level, full
  heal). The Victory modal calls out the level-up if one happened.
- **Sidebar refresh.** New **Battle** panel (turn + phase chip + End
  Turn / Skip Attack), **Roster** panel with each unit's HP bar +
  status (ready / acted / fallen), and the renamed **Combat log**
  carrying move / attack / kill / phase events.
- **Per-unit HP bars on the board** so threatened units read at a
  glance — and switch to amber when below 33% HP.

### Changed
- Top HUD now shows a `Turn N` + `Player / Enemy phase` chip on the
  right side instead of free-text status.
- `tactics.css` extended with attack-target tile highlights, attack
  lunge / hit-shake / death animations, and the outcome modal styling.

## [1.3.0] — 2026-06-18

### Added — Tactics mode foundation ("Operation First Footprint")
- **New `/tactics` route.** A standalone page (`app/routes/tactics.py` +
  `app/static/tactics.html` / `.css` / `.js`) for the upcoming
  Fire-Emblem-style grid combat mode. The idle RPG and tactics mode run
  as separate pages — no shared tick loop — so the idle auto-combat
  pauses cleanly when the player crosses over.
- **Hand-built 10×8 battlefield.** Four terrain types laid out by hand
  for v1.3.0 (procedural generation arrives in a later release):
  | Glyph | Terrain  | Passable? |
  |-------|----------|-----------|
  | `.`   | Grass    | yes       |
  | `T`   | Forest   | yes       |
  | `M`   | Mountain | no        |
  | `W`   | Water    | no        |
  Forests, mountains, and water each render with a small CSS pseudo-
  element accent so the terrain reads at a glance.
- **Click-to-move commander.** BFS computes every tile reachable within
  the commander's move range (4); reachable tiles get an MD3-primary
  inset highlight. Clicking a highlighted tile slides the commander to
  it with a `cubic-bezier(.4, 1.4, .4, 1)` CSS transition. Clicking the
  commander a second time, or clicking outside the highlight,
  deselects. Impassable tiles are filtered out of the BFS frontier so
  mountains and water genuinely block movement.
- **Commander sprite.** A simplified pull from the existing idle-RPG
  warrior SVG (`game.js`'s `playerSvg()`), rendered both on the board
  and as a sidebar portrait. Equipment-aware rendering (so the
  commander reflects the idle save's worn gear) lands with v1.4.0.
- **Tactics sidebar.** "Commander" panel showing move range + current
  `(x, y)`; "Recon log" panel for selection / move events, mirroring
  the idle-RPG combat log.
- **Entry point on the main page.** A new "Battle" sidebar panel on
  `/` with an "Enter Tactics" button linking to `/tactics`.

### Changed
- Cache-control middleware now treats `/tactics` the same as `/` —
  `Cache-Control: no-cache` so version bumps propagate immediately.

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
