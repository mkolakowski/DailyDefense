# Changelog — v1

All notable changes to the `1.x` series of DailyDefense are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.28.0] — 2026-06-20

### Added — Biomes ("Operation Biome Lab")
- **Every procgen map now rolls a biome** from the same PRNG that
  picks terrain + unit positions. Three biomes ship in this release:
  | Biome    | Vibe                       | Heavier in        |
  |----------|----------------------------|-------------------|
  | Forest   | Lush greens, leafy canopy  | Forest (25%)      |
  | Cave     | Slate + cool dim palette   | Ruins (10%), Mountain (8%) |
  | Volcano  | Ash, rust, glowing lava    | Hill (10%), lava-coloured Water |
- **Terrain weights are biome-specific** — Cave maps feel rockier
  and ruined; Volcano maps push more hills and replace pools with
  bright orange "lava" tiles (still impassable, just hot). Forest
  is the baseline.
- **Per-biome palette overrides via a `.biome-*` class on the
  board.** Same `terrain-grass` / `terrain-forest` etc. classes,
  but the cascaded `.tactics-board.biome-cave .tile.terrain-grass`
  rule recolors them. No new sprites needed.
- **Daily seed locks biome too** — everyone playing the same date
  gets the same biome AND the same terrain AND the same unit
  placements.
- **Seed chip surfaces the biome name:** `Daily 2026-06-20 ·
  Forest` or `Custom · Volcano`.

### Notes
- `BIOMES` table lives at the top of tactics.js next to `TERRAIN`;
  adding a new biome is one entry + matching CSS palette block.
- Weights for each biome's six-terrain distribution sum to 1.0;
  `rollTerrain()` walks the cumulative distribution.
- Tile cover bonuses (forest +Def, hill +Str, ruins +SpDef) work
  the same regardless of biome — the biome only changes color and
  frequency.

## [1.27.0] — 2026-06-20

### Changed — Portrait map + randomized opposing-side placement ("Operation Tall Order")
- **Map dimensions flipped to 7×12** (was 10×8). Skinnier + taller so
  the battlefield fits better on a portrait phone screen, and the
  vertical-confrontation framing (your party at the south border vs
  goblins at the north border) reads more naturally as "two armies
  closing across no-man's land."
- **Unit positions are now randomized per map**, sharing the same
  PRNG seed as the terrain. The bands are guaranteed-opposing:
  - **Player party (Warrior + Archer + Mage)** rolls into the bottom
    two rows (rows 11 + 10 — the southern border).
  - **Enemy force (3 Goblins + 1 Goblin Archer)** rolls into the top
    two rows (rows 0 + 1 — the northern border).
  - Order within the band is shuffled too, so the Mage is sometimes
    on the left flank, sometimes the right, etc.
- **Forced-passable bands** cover both spawn zones (rows 0-1 and
  10-11). Procgen terrain only rolls for the eight middle rows
  (rows 2-9), so the spawn picks are always on plain grass.
- **Connectivity retry** now checks both: BFS from the first enemy
  must reach every other enemy *and* every rolled ally position.
- **Daily seed locks both map and positions**: anyone playing
  today's `Daily 2026-06-20` field gets identical terrain AND
  identical unit placements, so par-turn / win-rate comparisons are
  apples-to-apples.

### Notes
- `ALLY_COMP` + `ENEMY_COMP` define the rosters in one place;
  `makeMap()` rolls positions and packs them into the returned
  `allyLoadout` / `enemyStarts` arrays.
- New `applyMapData(seedOverride, isDaily)` helper does the
  module-state update so callers don't have to remember to bump
  `DEFAULT_ALLY_LOADOUT` and `ENEMY_STARTS` by hand.
- Total tile count is similar (7×12 = 84 vs 10×8 = 80), so battle
  pacing should feel comparable — units just close along the
  vertical axis instead of the horizontal.

## [1.26.0] — 2026-06-20

### Added — Daily-seed maps ("Operation Sunrise Field")
- **Page-load map is now seeded from today's date** (YYYYMMDD as a
  mulberry32 seed). Any player visiting `/tactics` on the same date
  gets the same procgen field — a shared "daily challenge"
  battlefield. The seed rolls over at local midnight.
- **New seed chip in the HUD** between TEST and the round chip:
  - `Daily 2026-06-20` in OK-green when on the daily field.
  - `Custom map` in muted grey after a re-roll or after Skirmish-
    again.
- **Re-roll Map** in the deploy panel now switches to a *random*
  seed — useful when today's daily layout is rough and the player
  wants a do-over, with the chip flipping to "Custom" to signal
  they've gone off-script.
- **Skirmish-again** (from the outcome modal) also moves off the
  daily seed onto a fresh random one, so back-to-back battles
  aren't on identical terrain.
- `makeMap(seedOverride?)` takes an optional seed; calling with no
  arg keeps the existing random behavior.

### Why it's on-theme
This is the first step toward making the "Daily" in DailyDefense
mean something concrete — same field everywhere on the same day.
Future versions can layer leaderboards, par-turn counts, or
shared replays on top.

## [1.25.0] — 2026-06-20

### Changed — Enemy AI reads terrain ("Operation Field Smarts")
- **Enemy tile-scoring now factors terrain bonuses.** The old
  reach-distance-then-cost picker is replaced by a weighted formula:
  ```
  score = reachScore * 1000 + cost * 5 + terrainMod
  ```
  with terrain modifiers:
  | Terrain                                 | Mod  |
  |-----------------------------------------|------|
  | Forest (+1 Def, +1 SpDef cover)         | −6   |
  | Ruins (+1 SpDef cover)                  | −4   |
  | Hill (+1 Str melee, only if swinging)   | −12  |
  Lowest score wins. Reach-distance still dominates — the AI gets
  into attack range first — and cost tiebreaks before terrain. But
  when two reachable tiles have the same reach, terrain decides:
  enemies prefer forest/ruins for cover, and melee enemies will
  detour onto a hill when they can swing from it.
- **Behavioural effects:**
  - Goblins about to engage will pick a hill destination over a
    grass one if the hill puts them adjacent to the target —
    trading a turn's worth of move cost for the +1 Str high-ground.
  - Goblin Archers prefer parking on forest or ruins tiles when
    they can shoot from range; sitting on a covered tile cuts
    incoming counter-shots.
  - The cost coefficient (5) keeps the AI from wandering far for
    minor terrain gains: a forest tile 2 moves out (cost 10 − 6 =
    4) loses to a grass tile in current range (cost 0).
- Pure scoring change — no log changes, no new sprites.

## [1.24.0] — 2026-06-19

### Added — Tile inspector ("Operation Recon Tap")
- **New `#tile-info` line** sits below the status line. Shows the
  hovered (desktop) or tapped (mobile) tile's full info at a glance:
  - **Grid label** (`A1`, `F3`, etc.) in secondary gold.
  - **Terrain name** (Grass / Forest / Hill / Ruins / Mountain /
    Water) in primary text.
  - **Bonus summary** in primary blue when the tile grants one
    (e.g. `+1 Def, +1 SpDef cover`, `+1 Str (melee attacks)`,
    `impassable`).
  - **Occupant** suffix (`· Goblin 14/20`) when a unit is on the
    tile, so you can see HP at a glance without checking the
    roster.
- Updates on **`mouseenter`** for every tile + on **`click`** so
  desktop hover and mobile tap both feel immediate.
- Clears back to "Hover or tap a tile to inspect it." when the
  cursor leaves the board.

### Why
Teaches the new cover system (v1.21 + v1.23) without forcing the
player to memorise the legend. Hover a hill, see `+1 Str (melee
attacks)`; hover a ruin, see `+1 SpDef cover`. Surfaces enemy HP
inline too — useful for "can I finish this Goblin in one hit?"
calls.

## [1.23.0] — 2026-06-19

### Added — Two new cover terrains ("Operation Higher Ground")
- **Hill** (`H` in the map grid). Passable, brown tile with a domed
  mound underlay. A unit standing on a hill gets **+1 Strength on
  melee swings** (high-ground bonus). Ranged shots from a hill are
  unaffected — the dial is melee-only so it complements ruins
  rather than overlapping with cover.
- **Ruins** (`R` in the map grid). Passable, slate-gray tile with
  broken-stone fragments. A unit standing in ruins gets **+1
  Special Defense** for incoming attacks (magic wards still humming
  in the old stones).
- Procgen terrain distribution updated:
  | Terrain  | Glyph | Prob. |
  |----------|-------|-------|
  | Grass    | `.`   | ~72%  |
  | Forest   | `T`   | ~16%  |
  | Hill     | `H`   |  ~3%  |
  | Ruins    | `R`   |  ~3%  |
  | Mountain | `M`   |  ~3%  |
  | Water    | `W`   |  ~3%  |

### Changed
- `resolveAttack` damage now consults both attacker and target tile
  terrains. Effective Str = Str + (on hill && melee ? 1 : 0).
  Effective Def = Def + (target on forest ? 1 : 0). Effective SpDef
  = SpDef + (forest ? 1 : 0) + (ruins ? 1 : 0).
- Combat log surfaces every active bonus:
  - `Atop the hill, Warrior hits Goblin for 4.`
  - `Goblin shoots Mage (ruins cover) for 1.`
  - `Goblin hits Warrior (forest cover) for 1.` (unchanged)
- Board legend now lists all six terrain types with their bonuses
  inline.

### Tactical math
- Warrior (Str 10) on hill swinging at Goblin (Def 1) → 10 dmg
  instead of 9.
- Mage (SpDef 4) in ruins taking Goblin Archer shot (SpA 7) → 2 dmg
  instead of 3. In ruins **AND** forest doesn't stack (only one
  tile at a time), so each tile has a clear role.

## [1.22.0] — 2026-06-19

### Added — Map re-roll during deploy ("Operation Mulligan")
- **New "Re-roll Map" button** sits next to "Begin Battle" in the
  deploy panel. Tapping it calls `makeMap()` for a fresh
  procedurally generated battlefield, rebuilds tile DOMs, and
  re-renders the existing party at their default positions.
- The button only fires during the deploy phase, so once the
  battle starts the field is locked in until the next skirmish.
- Lets the player reject an unfavorable map (e.g., a water strip
  pinning the Mage) before committing to a fight.

### Notes
- Re-roll keeps the current ally loadout intact (default Warrior /
  Archer / Mage at I8 / F8 / C8 unless you've already swapped). It
  doesn't touch initiative — that's still rolled on Begin Battle.
- The deploy panel actions now use a `grid-template-columns: 1fr
  1fr` layout so the two buttons share width evenly.

## [1.21.0] — 2026-06-19

### Added — Forest cover bonus ("Operation Take Cover")
- **Units standing on a forest tile gain +1 Defense and +1 Special
  Defense** for incoming attacks. Physical Strength-Def calculations
  and ranged SpAtk-SpDef calculations both subtract the boosted
  number.
  - Warrior (Def 4) in forest → effective Def 5; goblin melee
    Str 6 - 5 = 1 dmg instead of 2.
  - Mage (SpDef 4) in forest → effective SpDef 5; Goblin Archer's
    SpAtk 7 - 5 = 2 dmg instead of 3.
- **Combat log calls cover out explicitly.** When the bonus applies
  the line reads `Goblin hits Warrior (forest cover) for 1.` so you
  can see why a hit dropped from the usual number.
- Forest tiles are already visibly darker green with the leafy
  pattern, so the cover indicator is built into the existing
  terrain art — no extra UI.

### Notes
- Mountains and water are still impassable, so cover stays a
  forest-only mechanic for now. Future versions could introduce
  passable "ruins" or "stone" terrain with bonus on the special
  side, or a "hill" terrain with +Atk for occupants.

## [1.20.0] — 2026-06-19

### Added — Procedural maps ("Operation Cartographer")
- **Every skirmish now spawns on a randomly generated battlefield.**
  The hand-built 10x8 map is gone; in its place is a `makeMap()`
  generator that seeds a `mulberry32` PRNG from `Math.random()` and
  rolls each tile against weighted probabilities:
  | Terrain  | Glyph | Probability |
  |----------|-------|-------------|
  | Grass    | `.`   | ~78%        |
  | Forest   | `T`   | ~16%        |
  | Mountain | `M`   |  ~3%        |
  | Water    | `W`   |  ~3%        |
- **Safety constraints baked in.**
  - All of row 7 + 8 (the ally spawn zone) is force-passable.
  - Every hard-coded enemy spawn tile (H1, J1, I3, I5) is
    force-passable.
  - Generation retries up to 30 times if a BFS connectivity check
    from the first enemy fails to reach every other enemy spawn
    and every back-row tile. So you'll never get a map that locks
    half the field behind a mountain wall.
- **Map regenerates on "Skirmish again"** so every battle truly is a
  fresh field. The page-load map is also random; refresh for a re-roll.
- `buildBoard()` is now idempotent — labels reuse the existing DOM,
  tiles get wiped and re-drawn from the new MAP.

### Up next
- v1.21 "Operation Biome Lab" — biome themes (forest / cave /
  volcano colour palettes) so each map has a *flavor* on top of its
  random layout.
- v1.22 onward — terrain cover bonuses (forests give +Def,
  mountain edges give +SpDef, etc.).

## [1.19.0] — 2026-06-19

### Changed — Warrior + Mage swap flanks ("Operation Flank Swap")
- **Default deploy positions swap on the back row.** Warrior moves
  from C8 to I8 — the right flank, closer to the enemy cluster at
  H1 / J1 / I3 / I5. Mage moves from I8 to C8 — the left flank, far
  from the action. Archer stays at F8 in the middle.
  - Tactical effect: melee tank closes ground in fewer turns; the
    fragile Mage gets an extra turn of stand-off distance before
    enemies reach the back row.

## [1.18.0] — 2026-06-19

### Added — Bordered board with grid references ("Operation Grid Reference")
- **Board now sits inside a framed container** with a thicker outline,
  rounded corners, and an inset shadow — chess-board chrome around the
  battlefield instead of a bare grid.
- **Column letters A–J** above the board; **row numbers 1–8** down the
  left side. Both rendered as monospace bold so they read at a glance.
- **All movement logs use the new notation.** `Warrior marches to D8`
  replaces `Warrior marches to (3, 7)`; ally / enemy advance logs and
  the auto-path "closes on target" line follow the same format.
- **Test-mode tile-coords overlay** uses the same letter-number scheme
  (`A1`, `J8`, etc.) so the in-tile labels match the board headers.

### Note
- BFS pass-through behavior is unchanged: both allies *and* enemies can
  path through same-kind units (introduced in v1.15). The end-of-move
  tile still has to be empty. If the visual behavior seems asymmetric
  between sides, default-loadout positioning (Warrior/Archer/Mage 3
  tiles apart on row 8 with `moveRange` 2–3) often means allies don't
  *need* pass-through to find a route, so the mechanic rarely fires
  visibly for the player even though enemies use it routinely from
  their tighter cluster. Worth re-testing now that the labels make
  movement paths easier to trace.

## [1.17.0] — 2026-06-19

### Added — Speed-first combat exchanges ("Operation First Blood")
- **Every "battle" between two units is now a full Fire-Emblem
  exchange.** When one unit attacks another:
  1. Higher-Speed combatant **strikes first**. (Attacker wins Speed
     ties — they initiated.)
  2. If the other is still alive AND has the target in their own
     `attackRange`, they **counter-strike** with their own damage.
  3. Either side dying during the exchange ends it; overkill is
     skipped.
- New `resolveCombat()` orchestrates the exchange. Both `doAttack()`
  (ally turns) and `enemyTakeTurn()` (AI turns) now go through it,
  so ally and enemy initiated attacks both trigger counters.
- **Speed actually matters now**: a fast Archer (Spd 12) who hits a
  slow Mage (Spd 6) at range 3 will land both their shot AND eat the
  Mage's bolt back — but if the Mage is faster than the Archer, the
  Mage's bolt strikes first. Counter-attacks only land if the
  defender has the attacker in their attackRange, so:
  - Range-3 Archer shooting a melee Goblin from distance 3 → no
    counter (Goblin's range 1 doesn't reach back).
  - Range-3 Archer vs Goblin Archer (both range 3) → full exchange.
  - Adjacent Warrior vs Goblin → full exchange (both range 1).

### Changed
- Combat log opens each engagement with `Battle: X (Spd N) vs Y
  (Spd N).` so the strike order is readable at a glance.
- If a counter can't land (defender out of range), the log says
  "X can't counter — Y is out of range." rather than silently
  dropping it.

## [1.16.0] — 2026-06-19

### Added — Pokemon-style stat block ("Operation Vital Signs")
- **Seven stats on every unit**: HP, Speed, Strength, Attack,
  Defense, Special Attack, Special Defense.
- New starting stats:
  | Unit          | HP | Spd | Str | Atk | Def | SpA | SpD |
  |---------------|----|-----|-----|-----|-----|-----|-----|
  | Warrior       | 40 | 8   | 10  | 8   | 4   | 2   | 2   |
  | Archer        | 26 | 12  | 6   | 5   | 2   | 8   | 2   |
  | Mage          | 22 | 6   | 3   | 4   | 1   | 12  | 4   |
  | Goblin        | 20 | 8   | 6   | 4   | 1   | 2   | 1   |
  | Goblin Archer | 14 | 10  | 4   | 3   | 0   | 7   | 1   |
- **Damage formula split by physical vs. magic / ranged**:
  - Melee (range 1) `dmg = max(1, attacker.Str - target.Def)`
  - Ranged or magic (range > 1) `dmg = max(1, attacker.SpAtk - target.SpDef)`
  Mage now hits like a truck at range (12 SpA - 1 SpD = 11 dmg on
  Goblins) but is fragile in melee (1 Def vs a Goblin's 6 Str = 5
  dmg per hit). Warrior's beefy 4 Def cuts goblin melee damage to
  just 2 per hit — Warrior tanks 20+ hits before going down.
  Goblin Archer's 7 SpA vs Mage's 4 SpD is only 3 dmg — the Mage's
  high SpD shrugs off arrows but melts to a melee swing.
- **Initiative roll now derives from Speed**: `1d20 + floor(Spd/4)`.
  Hard-coded per-sprite INITIATIVE_MOD table is gone — Speed alone
  drives the mod. Tie-break order: higher Speed → ally over enemy
  → creation order.
- **Attack stat retained for future use** (to-hit / accuracy rolls
  haven't landed yet; it's exposed on the deploy card but does
  nothing in 1.16).

### Changed
- **Deploy class card** now shows the full stat block: HP/Move/Rng,
  Str/Def/SpA/SpD, Spd/Atk on three lines.
- **Roster row** swaps the old `⚔ · 🛡 · Rng` line for `Spd · Str|SpA
  · Rng` — picks Str for melee classes and SpA for ranged so the
  relevant offense stat surfaces.
- **Initiative log line** now appends ` · Spd N` so you can see the
  speed each unit rolled from.

### Up next
- v1.17 "Operation First Blood" — speed-decides-first combat
  exchanges with Fire-Emblem-style counter-attacks. Wiring lands
  next; foundations are in place now that Speed exists.

## [1.15.0] — 2026-06-19

### Changed — Allies share lanes ("Operation Open Lanes")
- **BFS now lets same-kind units pass through each other.** An
  ally pathing the grid can walk through another ally's tile (and
  vice versa for enemies); only opposite-kind units block the lane.
- The destination tile must still be empty — the end-of-move
  occupancy check sits in `renderSelection` and `onTileClick` and
  was already correct, so no other change was needed.
- Fixes the Fire-Emblem-style frustration of a Warrior parked at
  (3, 7) walling off the Archer and Mage behind him.

## [1.14.0] — 2026-06-19

### Added — Test mode ("Operation Sandbox")
- **`?test=1` URL flag enables a sandbox panel** in the tactics
  sidebar. Persisted in `localStorage` so refreshes stay in test mode
  until "Exit Test Mode" is pressed or the key is cleared.
- A red **TEST** chip pins to the HUD whenever the mode is active.
- **Toggles:**
  - **God mode** — every attack on an ally deals 0 damage.
  - **One-shot kill** — every ally attack does `target.maxHp`
    damage (so anyone dies in one swing).
  - **Fast animations** — caps `sleep()` waits at 60ms (~one frame
    at 60fps) so combat resolution flies by.
  - **Show tile coords** — overlays each tile with its `x,y` so
    coordinate-driven debugging stops requiring counting.
- **One-tap actions:**
  - **Heal Party** — restores every living ally to `maxHp`.
  - **Skip Round** — marks every unit as "acted" and advances to a
    fresh round (good for testing round transitions / initiative
    re-ordering).
  - **Insta-Win** / **Insta-Lose** — drop all enemies / allies to 0
    HP and pop the appropriate outcome modal. Insta-Win **does NOT**
    apply XP/gold to the idle save (so testing doesn't pollute
    real progress).
- **Exit Test Mode** clears the localStorage flag, strips `?test=1`
  from the URL, and reloads — clean way out.

### Note
- All test hooks are no-ops when `testModeOn === false`, so the
  surface area for normal users is just the unused checkbox/button
  markup hidden behind `.hidden`.

## [1.13.0] — 2026-06-19

### Changed — Player buffs ("Operation Battle Hardened")
- Ally classes get more HP and a bit more punch across the board:
  | Class    | HP (was → now) | ⚔ (was → now) |
  |----------|----------------|----------------|
  | Warrior  | 30 → **40**    | 6 → **8**      |
  | Archer   | 18 → **26**    | 5 → **7**      |
  | Mage     | 16 → **22**    | 8 → **10**     |
- Total party HP: 64 → **88** (+38%). Each ally hits ~2 harder
  per swing.
- Mage now one-shots Goblin Archers (10 atk vs 0 def = 10 dmg vs 14
  HP → wait, 10 not enough, two shots). Two-shots them, anyway.
  Warrior + Archer kill base Goblins in 3 hits (vs the 4–5 it used
  to take Archer). Enemies still hit equally hard but allies last
  meaningfully longer — Archer survives ~7 Goblin hits (was ~4),
  Mage survives ~5 (was ~4).

## [1.12.0] — 2026-06-19

### Added — Max-range view + click-to-engage ("Operation Target Lock")
- **Max-range threat zone.** The pink dashed outline that used to
  mark only the current tile's attack range now shows the **union of
  attack range from every reachable tile** — i.e. every spot the
  player could hit after picking any of their move destinations. One
  glance tells you the full extent of your reach this turn.
- **In-range enemy outline matches the new zone.** The pink ring +
  sprite glow now lights up every enemy in the max-range zone (not
  just enemies you could hit without moving), so it's obvious who's
  a viable target for this turn.
- **Click an enemy → auto-path + attack.** Tapping any
  outlined-in-range enemy now finds the cheapest reachable tile that
  puts the target in attack range, walks the unit there, and
  triggers the attack — no need to manually click a move tile then
  the target. Clicking your own tile still works as "stay put → go
  to attack-or-skip." If no path puts the enemy in range, the click
  is a no-op (matches existing behavior).

### Changed
- The in-range preview pink dashes used to differentiate between
  "current tile reach" and "post-move reach" — now they're a single
  uniform max-range zone since the auto-path engages from anywhere
  in it.

### TODO additions (tactics roadmap)
- Pokemon-style stat block (Speed, Strength, Attack, Defense,
  Special Attack, Special Defense) on every unit.
- Wire existing mechanics — damage formula, initiative roll, deploy
  card display — to the new stats.
- Speed-decides-first combat exchanges (Fire-Emblem-style counter-
  attack on engage; higher Speed strikes first).

## [1.11.0] — 2026-06-19

### Changed — Difficulty nerf ("Operation Even Odds")
- **Enemy count dropped 5 → 4.** Removed the Goblin Archer that was
  parked at (9, 3) — the more aggressive of the two archers, since
  it sat closer to the action and could rapidly close on the back
  row. The (9, 0) Goblin Archer stays, so ranged enemy pressure is
  reduced but not eliminated.
- Composition is now **3 Goblins + 1 Goblin Archer = 4** vs the
  party's **Warrior + Archer + Mage = 3**. Tighter 4v3 instead of
  the 5v3 that v1.10's commander removal left.

### Note
- Total enemy HP drops to **74** (from 88) — closer to the party's
  64 HP pool, but enemies still have the numerical advantage.

## [1.10.0] — 2026-06-19

### Changed — Commander removed; squad of three ("Operation Stand Down")
- **Commander gone from the field.** The grey chainmail unit has been
  retired. The default loadout is now exactly three player units —
  **Warrior, Archer, Mage** — spread across the back row at (2, 7),
  (5, 7), and (8, 7) respectively.
- **Loss condition flipped.** Previously the skirmish ended when the
  commander fell. Now: the skirmish is lost only when the **entire
  party** is wiped. Any single ally going down isn't fatal — you can
  press on with the survivors.
- **Enemy AI re-tuned.** Without a designated commander, enemies no
  longer prefer the "leader." Tie-break now goes to the **lowest-HP
  ally** so enemies will close the kill on a wounded Mage instead of
  spreading damage.
- **UI swept of commander references.** Outcome modal reads "The
  field is yours" / "Your party has been wiped" instead of the
  commander-specific wording. Battle and Deploy panel descriptions
  updated. Roster rows drop the `· cmdr` tag; the initiative track
  drops the `★` marker.
- **Dead code removed.** The `commanderSvg()` sprite, the
  `INITIATIVE_MOD.commander` entry, the `isCommander` unit flag, and
  the `commander()` helper are gone.

### Note
- Total ally HP is now 30 + 18 + 16 = **64** (down from 114 with the
  commander). The fight got materially harder — five enemies vs.
  three smaller units. If it ends up too punishing in playtest,
  trimming enemy count or tuning class stats is the next dial.

## [1.9.0] — 2026-06-18

### Added — Attack-range outline on the move step ("Operation Strike Zone")
- **Pink dashed perimeter** on every tile within the current unit's
  attack range during the move step. Lets the player see — before
  picking a destination — exactly where their swings or shots reach
  from their current spot.
  - Melee (range 1): the 4 adjacent tiles.
  - Ranged (range 3): the full Manhattan-3 diamond, even across
    impassable terrain.
  - Drawn with a CSS `outline: 2px dashed` at `-4px` offset so it
    coexists with the cyan movement fill without fighting it.
- **In-range enemy outline extended to melee classes.** The pink
  ring + sprite glow that previously only fired for Archer / Mage /
  Goblin Archer now also lights up for the Commander, Warrior, and
  Goblin when an enemy is sitting in their melee range. The rule is
  now "any enemy within `attackRange` from your current tile gets
  outlined," uniformly.

## [1.8.0] — 2026-06-18

### Added — Default loadout ("Operation Standing Roster")
- **All three classes deploy by default.** Every skirmish now starts
  with the full party already on the field:
  | Unit       | Position | Why                                  |
  |------------|----------|--------------------------------------|
  | Commander  | (1, 7)   | back-left, the win-condition unit    |
  | Warrior    | (3, 6)   | one row forward — melee closes fast  |
  | Archer     | (6, 7)   | back row, shoots from range 3        |
  | Mage       | (8, 7)   | far-right back row, range 3 + atk 8  |
  Total controllable party = **4** (commander + Warrior + Archer +
  Mage). Initiative still rolls 1d20+mod for everyone, so the order
  is fresh every battle even with the same loadout.
- **Deploy panel becomes a roster review.** You can still tap a
  placed ally to stand them down and slot in a different class
  (DEPLOY_BUDGET bumped 2 → 3 to fit the trio), but the friction is
  gone: hit **Begin Battle** and the default formation marches.

### Changed
- Deploy panel header now reads "Deploy Allies (N slots open)"
  rather than "(N slots)" — clearer that 0 = full squad.
- Default-formation status text: "Default formation deployed — hit
  Begin Battle, or tap an ally to swap."

## [1.7.0] — 2026-06-18

### Added — Ranged attacks read clearly ("Operation Long Shot")
- **Ranged classes bumped to range 3.**
  | Class         | Range (was) | Range (now) |
  |---------------|-------------|-------------|
  | Archer        | 2           | **3**       |
  | Mage          | 2           | **3**       |
  | Goblin Archer | 2           | **3**       |
  Range 2 was barely felt at deploy distances; range 3 means an
  Archer or Mage who clicks their own tile (no move) on turn 1 can
  reach most enemies on the far side of the map.
- **Projectile animations.** Ranged attacks now visually launch a
  projectile from the attacker's tile to the target's tile:
  - Archer / Goblin Archer fire a **fletched arrow** (silver tip,
    wooden shaft, yellow nock) that rotates to match the firing
    angle and flies in a 300ms linear travel.
  - Mage hurls a **glowing magenta bolt** with a soft pink halo and a
    220ms brightness pulse.
  Melee hits keep the existing lunge-then-shake; ranged hits skip the
  lunge (the unit didn't move) and play the shake + damage popup
  when the projectile lands.
- **In-range preview for ranged units.** When it's a ranged ally's
  turn, every enemy already shootable from the current tile gets a
  pink ring on the floor + a glow on the sprite — so the player
  knows they can stay put and shoot. Melee units skip the preview
  (adjacency is obvious).
- **Combat log now reads "shoots" instead of "hits"** when the
  attacker is more than one tile away, so log scanning makes the
  range/melee split obvious.

## [1.6.0] — 2026-06-18

### Added — D&D initiative + touch support ("Operation Roll for Initiative")
- **D&D-style initiative.** When you press **Begin Battle**, every
  unit on the field rolls **1d20 + modifier** and acts in descending
  order — no more "all allies, then all enemies." Ties break ally over
  enemy, then by creation order. Initiative modifiers:
  | Sprite          | Init mod |
  |-----------------|----------|
  | Commander       | +2       |
  | Warrior         | +1       |
  | Archer          | +3       |
  | Mage            | +0       |
  | Goblin          | +1       |
  | Goblin Archer   | +2       |
  Every roll is dumped into the combat log so you can sanity-check
  the order.
- **Initiative-track sidebar panel.** Shows the round number plus the
  full turn order, with the current unit's row highlighted gold, acted
  units dimmed, and fallen units struck through. Ally rows are blue,
  enemy rows red.
- **Active-turn glow on the board.** The unit whose turn it is gets a
  pulsing ring (primary blue for allies, error red for enemies) so the
  board telegraphs whose action you're watching.
- **Single context-sensitive Skip button** replaces the old End-Turn /
  Skip-Attack pair. Label flips to "Skip Attack" once you've moved
  into the attack-or-skip step.
- **Squad of three.** Deploy budget cut from 3 to **2** — Commander +
  2 allies = exactly three player-controlled characters. The deploy
  panel now shows "2 slots" by default and each class button surfaces
  its initiative modifier (`Init +N`).
- **Five enemies** instead of three: 3 Goblins + 2 Goblin Archers
  spread across the top half of the map so they pressure multiple
  lanes instead of all bunching in one corner.

### Added — Touch UX pass
- `touch-action: manipulation` on every interactive element (tiles,
  unit-class buttons, action buttons) — kills the 300ms tap delay on
  iOS Safari.
- `-webkit-tap-highlight-color: transparent` so taps no longer flash
  the grey overlay over tiles or buttons.
- `:active` filter feedback on every interactive tile state
  (reachable / spawnable / attack-target) so touch users see their
  taps register without a hover cue.
- Deploy class buttons gained a `min-height: 60px` floor so tap
  targets stay comfortably above the 44pt mobile minimum.
- All button text marked `user-select: none` so a long-press doesn't
  pop the selection magnifier.

### Changed
- **Turn loop restructured.** `phase` is now `deploy → battle → done`;
  whose turn it is comes from `initiativeOrder[currentTurnIndex]`
  instead of a side-based player/enemy phase. Each ally turn auto-
  selects the active unit and shows its reachable tiles immediately —
  no more "click unit to select."
- **Click your own tile to stay put.** Skipping the move step is now
  just tapping your current tile; the attack-or-skip step kicks in
  afterwards if any enemy is in range.
- **Each enemy turn runs in its initiative slot**, not as part of a
  bulk enemy phase. Ranged enemies that roll high can shoot first;
  the commander can land an opening blow if their roll wins.
- HUD chip now reads `Round N · UnitName's turn`, coloured by side.

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
