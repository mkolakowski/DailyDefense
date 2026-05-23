# TODO

Running list of work items for DailyDefense. Move items into the changelog
(`docs/CHANGELOG-vN.md`) as they ship.

## Material Design migration

Converting the UI to Material Design 3. Done in phases so the game stays
playable between releases. The iOS-friendly touch behaviour from v0.4.1 /
v0.5.1 (touch-action, pointerup+click activation, 44 px hit targets) must
be preserved at every phase.

- [ ] **Phase 1 — Foundations** *(in progress, v0.9.0)*
  - Adopt Roboto / Roboto Mono as the typography stack (Google Fonts,
    preconnect + `display: swap`).
  - Define MD3 colour tokens as CSS custom properties on `:root`:
    `--md-sys-color-primary`, `--md-sys-color-on-primary`,
    `--md-sys-color-surface`, `--md-sys-color-surface-container`,
    `--md-sys-color-outline`, etc. Keep the in-canvas game palette
    (cyan / yellow / magenta turrets) — the design tokens are for the
    chrome, not the playfield.
  - Add elevation tokens (`--md-sys-elevation-0..5`) with the standard MD3
    two-layer shadow recipe.
  - Convert the mode picker to MD3 **segmented buttons** as a first proof
    of the system.
- [ ] **Phase 2 — Buttons & dialogs**
  - Replace `.primary` / `.ghost` with MD3 button variants
    (filled, tonal, outlined, text). Add the ripple state layer (state
    overlay) on press/hover/focus.
  - Convert the overlay into an MD3 dialog (top-bar title, supporting
    text region, actions row).
- [ ] **Phase 3 — Surfaces & layout**
  - Sidebar sections become MD3 cards (`elevation-1`) with proper
    `surface-container-low` background.
  - HUD stats become MD3 chips.
  - Snackbar for transient messages (e.g. "Submitted — rank #3").
- [ ] **Phase 4 — Motion & icons**
  - Switch hand-rolled emoji glyphs (❤, $, W, ⌬) for Material Symbols.
  - Apply MD3 motion easing/duration tokens to overlay show/hide and
    button state transitions.
  - Optional light-theme palette + `prefers-color-scheme` switch.

## Other open

- [ ] (none right now)

## Done

- [x] Tower defense gameplay — v0.3.0
- [x] Cloudflare Tunnel support — v0.4.0
- [x] Cache-busting on version change — v0.5.0
- [x] iOS-safe button activation — v0.5.1
- [x] Favicon + apple-touch-icon — v0.5.4
- [x] Turret XP / leveling — v0.6.0
- [x] Endless mode — v0.7.0
- [x] Endless difficulties (Easy / Normal / Hard) — v0.8.0
