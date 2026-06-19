# TODO

Running list of work items for DailyDefense. Move items into the changelog
(`docs/CHANGELOG-vN.md`) as they ship.

## Open — idle RPG (post-1.0.0)

- [ ] **Offline progress** — when the player returns after the tab was
      closed or backgrounded, simulate up to N hours of combat at the
      current zone and award accumulated XP / gold (capped to prevent
      day-long jumps).
- [ ] **Inventory + equipment** — drop weapons/armor on enemy kills with
      tiers (common / rare / epic). Equipped items modify stats.
- [ ] **Skills** — active abilities on cooldown (e.g. Heal, Power Strike).
- [ ] **Prestige** — reset progress for a permanent multiplier ("rebirth").
- [ ] **More zones + enemy variety** — boss enemies per zone with their
      own drops.
- [ ] **Cloud save** — optional server-side save tied to a Google account
      (`AUTH_ENABLED=true`).
- [ ] **Tactics mode — turn-based army battler** — Fire Emblem-style
      top-down grid combat. No story / no campaign. Each map is procedurally
      generated (terrain, choke points, spawn zones), and the player picks
      their army (unit roster + composition) before deploying. Win = wipe
      enemy army; lose = lose your commander. Could share the existing
      idle-RPG unit/stat pool or run as a separate mode.
  - [x] v1.3.0 "Operation First Footprint" — `/tactics` route, static
        10×8 map, click-to-move commander.
  - [x] v1.4.0 "Operation Skirmish Line" — enemy units, turn structure,
        basic melee combat, win/loss detection, reward back into idle save.
  - [x] v1.5.0 "Operation Muster Roll" — pre-battle deploy screen, 2–3
        unit classes with different move + attack ranges.
  - [x] v1.6.0 "Operation Roll for Initiative" — D&D-style per-unit
        initiative order (1d20+mod), squad capped at 3 controllable
        characters (commander + 2), five enemies, touch-input pass.
  - [x] v1.7.0 "Operation Long Shot" — ranged classes bumped to
        range 3, projectile animations (arrows + magic bolts),
        in-range preview for ranged units' turns.
  - [x] v1.8.0 "Operation Standing Roster" — all three player
        classes deploy by default alongside the commander; deploy
        panel becomes a swap-in roster review.
  - [x] v1.9.0 "Operation Strike Zone" — pink dashed perimeter
        showing the current unit's attack range during the move
        step; in-range enemy outline extended to melee classes.
  - [ ] v1.10.0 "Operation Cartographer" — procedural map generation
        with biomes, choke points, and terrain cover bonuses.
  - [ ] v1.11.0 "Operation War Drum" — animations, AI improvements,
        commander reads idle-save equipment.

## Material Design migration (carried over from 0.9.0)

The MD3 foundation (colour tokens, elevation, Roboto, segmented buttons)
shipped in v0.9.0. Phases 2–4 still pending — they now apply to the idle
RPG UI rather than the old tower-defense UI:

- [ ] **Phase 2 — Buttons & dialogs** — MD3 filled / tonal / outlined /
      text variants with ripple state layer; "Reset save" confirmation as
      an MD3 dialog.
- [ ] **Phase 3 — Surfaces & layout** — sidebar panels already use rounded
      MD3 surface containers; convert HUD stats to MD3 chips; snackbar for
      level-ups and big drops.
- [ ] **Phase 4 — Motion & icons** — Material Symbols (replace emoji);
      MD3 motion easing/duration on bar transitions; optional light theme.

## Done

- [x] Idle RPG MVP — v1.0.0
- [x] Tower-defense run (deprecated) — v0.3.0 → v0.11.0
- [x] MD3 foundations — v0.9.0
- [x] Cloudflare Tunnel support — v0.4.0
- [x] Cache-busting on version change — v0.5.0
- [x] Favicon + apple-touch-icon — v0.5.4
