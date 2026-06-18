(() => {
  "use strict";

  // --- Map ------------------------------------------------------------------
  // Hand-built 10x8 battlefield for v1.3.0. Procedural generation comes in
  // a later release; for now this gives us terrain variety + a few choke
  // points to test movement against.
  //
  // Legend: . grass · T forest · M mountain (impassable) · W water (impassable)
  const MAP = [
    "..T.......",
    ".....M....",
    "...T....T.",
    "..M...WW..",
    ".....WWW..",
    "..T.......",
    "....T..M..",
    "..........",
  ];
  const COLS = MAP[0].length;
  const ROWS = MAP.length;
  const TERRAIN = { ".": "grass", "T": "forest", "M": "mountain", "W": "water" };
  const IMPASSABLE = new Set(["mountain", "water"]);

  const MOVE_RANGE = 4;
  const COMMANDER_START = { x: 1, y: 7 };

  // --- State ----------------------------------------------------------------
  const state = {
    commander: { x: COMMANDER_START.x, y: COMMANDER_START.y },
    selected: false,
    reachable: new Map(), // "x,y" -> cost
    moving: false,
  };
  let log = [];
  const MAX_LOG = 20;

  // --- DOM ------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const elBoard = $("tactics-board");
  const elStatus = $("tactics-status");
  const elVersion = $("app-version");
  const elLog = $("tactics-log");
  const elCmdrPortrait = $("cmdr-portrait");
  const elCmdrPos = $("cmdr-pos");
  const elCmdrMoveRange = $("cmdr-move-range");

  // --- Helpers --------------------------------------------------------------
  const key = (x, y) => `${x},${y}`;
  const terrainAt = (x, y) => TERRAIN[MAP[y][x]] || "grass";
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
  const passable = (x, y) => inBounds(x, y) && !IMPASSABLE.has(terrainAt(x, y));

  function pushLog(text, kind) {
    log.unshift({ text, kind: kind || "" });
    if (log.length > MAX_LOG) log.length = MAX_LOG;
    renderLog();
  }

  // --- BFS reachability -----------------------------------------------------
  function reachableFrom(start, range) {
    const visited = new Map();
    visited.set(key(start.x, start.y), 0);
    const queue = [{ x: start.x, y: start.y, cost: 0 }];
    while (queue.length) {
      const cur = queue.shift();
      if (cur.cost >= range) continue;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (!passable(nx, ny)) continue;
        const next = cur.cost + 1;
        const k = key(nx, ny);
        if (visited.has(k) && visited.get(k) <= next) continue;
        visited.set(k, next);
        queue.push({ x: nx, y: ny, cost: next });
      }
    }
    // The starting tile is in `visited` for traversal correctness, but we don't
    // want it highlighted as a "move destination".
    visited.delete(key(start.x, start.y));
    return visited;
  }

  // --- Rendering ------------------------------------------------------------
  function buildBoard() {
    elBoard.style.gridTemplateColumns = `repeat(${COLS}, var(--tile-size))`;
    const frag = document.createDocumentFragment();
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const tile = document.createElement("div");
        tile.className = `tile terrain-${terrainAt(x, y)}`;
        tile.dataset.x = String(x);
        tile.dataset.y = String(y);
        tile.addEventListener("click", () => onTileClick(x, y));
        frag.appendChild(tile);
      }
    }
    elBoard.appendChild(frag);

    const unit = document.createElement("div");
    unit.className = "unit commander";
    unit.id = "unit-commander";
    unit.innerHTML = commanderSvg();
    elBoard.appendChild(unit);
    positionCommander();
  }

  function tileAt(x, y) {
    return elBoard.querySelector(`.tile[data-x="${x}"][data-y="${y}"]`);
  }

  function positionCommander() {
    // tile size + 2px gap; account for the 2px outer padding on the board.
    const tile = tileAt(state.commander.x, state.commander.y);
    if (!tile) return;
    const unit = $("unit-commander");
    unit.style.transform = `translate(${tile.offsetLeft}px, ${tile.offsetTop}px)`;
  }

  function renderSelection() {
    for (const t of elBoard.querySelectorAll(".tile.reachable, .tile.selected, .tile.commander-tile")) {
      t.classList.remove("reachable", "selected", "commander-tile");
    }
    const cmdrTile = tileAt(state.commander.x, state.commander.y);
    if (cmdrTile) cmdrTile.classList.add("commander-tile");
    if (!state.selected) {
      $("unit-commander").classList.remove("selected");
      return;
    }
    if (cmdrTile) cmdrTile.classList.add("selected");
    for (const k of state.reachable.keys()) {
      const [x, y] = k.split(",").map(Number);
      const t = tileAt(x, y);
      if (t) t.classList.add("reachable");
    }
    $("unit-commander").classList.add("selected");
  }

  function renderHud() {
    elCmdrPos.textContent = `(${state.commander.x}, ${state.commander.y})`;
    elCmdrMoveRange.textContent = String(MOVE_RANGE);
    if (state.moving) {
      elStatus.textContent = "Marching to position…";
    } else if (state.selected) {
      const n = state.reachable.size;
      elStatus.textContent = `${n} tile${n === 1 ? "" : "s"} in range. Click a highlighted tile to move.`;
    } else {
      elStatus.textContent = "Click your commander to scout the field.";
    }
  }

  function renderLog() {
    elLog.innerHTML = log
      .map(e => `<li class="${e.kind}">${escapeHtml(e.text)}</li>`)
      .join("");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  }

  // --- Interaction ----------------------------------------------------------
  function onTileClick(x, y) {
    if (state.moving) return;
    // Click the commander tile → toggle selection.
    if (x === state.commander.x && y === state.commander.y) {
      state.selected = !state.selected;
      if (state.selected) {
        state.reachable = reachableFrom(state.commander, MOVE_RANGE);
        pushLog(`Commander selected at (${x}, ${y}).`, "select");
      } else {
        state.reachable = new Map();
      }
      renderSelection();
      renderHud();
      return;
    }
    // If selected and the target is in range, move there.
    if (state.selected && state.reachable.has(key(x, y))) {
      const cost = state.reachable.get(key(x, y));
      moveCommanderTo(x, y, cost);
      return;
    }
    // Otherwise: deselect on a stray click.
    if (state.selected) {
      state.selected = false;
      state.reachable = new Map();
      renderSelection();
      renderHud();
    }
  }

  function moveCommanderTo(x, y, cost) {
    state.moving = true;
    state.commander = { x, y };
    state.selected = false;
    state.reachable = new Map();
    positionCommander();
    renderSelection();
    pushLog(`Commander moves to (${x}, ${y}) — ${cost} tile${cost === 1 ? "" : "s"}.`, "move");
    renderHud();
    setTimeout(() => {
      state.moving = false;
      renderHud();
    }, 240);
  }

  // --- Commander sprite -----------------------------------------------------
  // Simplified version of the idle-RPG warrior — equipment integration with
  // the player's idle save lands in a later release.
  function commanderSvg() {
    const body = "#7a8090";    // chainmail-ish
    const skin = "#f4c592";
    const leg  = "#2c2240";
    const blade = "#c0c4cc";
    return `
<svg viewBox="0 0 90 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="45" cy="115" rx="22" ry="3" fill="#000" opacity="0.35"/>
  <rect x="33" y="88" width="9" height="22" rx="3" fill="${leg}"/>
  <rect x="48" y="88" width="9" height="22" rx="3" fill="${leg}"/>
  <rect x="28" y="48" width="34" height="44" rx="6" fill="${body}" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"/>
  <rect x="28" y="78" width="34" height="5" fill="rgba(0,0,0,0.35)"/>
  <rect x="23" y="52" width="8" height="26" rx="3" fill="${body}" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>
  <circle cx="45" cy="32" r="13" fill="${skin}" stroke="rgba(0,0,0,0.25)" stroke-width="1"/>
  <circle cx="50" cy="32" r="1.7" fill="#222"/>
  <g>
    <rect x="60" y="50" width="8" height="26" rx="3" fill="${body}" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>
    <rect x="63" y="20" width="3" height="44" fill="${blade}" stroke="rgba(0,0,0,0.4)" stroke-width="0.8"/>
    <rect x="58" y="62" width="13" height="3" fill="#5a3a1a"/>
    <rect x="62" y="64" width="5" height="7" fill="#3a2c00"/>
  </g>
</svg>`;
  }

  // --- Lifecycle ------------------------------------------------------------
  async function fetchVersion() {
    try {
      const r = await fetch("/health");
      const data = await r.json();
      return data.version || "?";
    } catch { return "?"; }
  }

  window.addEventListener("resize", positionCommander);

  buildBoard();
  elCmdrPortrait.innerHTML = commanderSvg();
  renderSelection();
  renderHud();
  pushLog("Welcome, commander. The field is yours to scout.", "select");
  fetchVersion().then(v => { elVersion.textContent = `v${v}`; });
})();
