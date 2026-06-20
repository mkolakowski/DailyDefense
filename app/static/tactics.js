(() => {
  "use strict";

  // === Map ==================================================================
  // Hand-built 10x8 battlefield. Procedural generation lands in a later
  // release; for now this gives terrain variety + a couple of choke points.
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

  // === Unit templates =======================================================
  // Pokemon-style 7-stat block per unit. Melee damage = Str - Def;
  // ranged/magic damage = SpAtk - SpDef. Speed drives initiative + tiebreaks.
  // Atk is reserved for future to-hit / accuracy rolls.
  const UNIT_CLASSES = {
    warrior: {
      name: "Warrior", sprite: "warrior", moveRange: 3, attackRange: 1,
      stats: { hp: 40, spd: 8,  str: 10, atk: 8, def: 4, spAtk: 2,  spDef: 2 },
    },
    archer:  {
      name: "Archer",  sprite: "archer",  moveRange: 3, attackRange: 3,
      stats: { hp: 26, spd: 12, str: 6,  atk: 5, def: 2, spAtk: 8,  spDef: 2 },
    },
    mage:    {
      name: "Mage",    sprite: "mage",    moveRange: 2, attackRange: 3,
      stats: { hp: 22, spd: 6,  str: 3,  atk: 4, def: 1, spAtk: 12, spDef: 4 },
    },
  };
  const CLASS_ORDER = ["warrior", "archer", "mage"];
  const ENEMY_TYPES = {
    goblin: {
      name: "Goblin", sprite: "goblin", moveRange: 3, attackRange: 1,
      stats: { hp: 20, spd: 8,  str: 6, atk: 4, def: 1, spAtk: 2, spDef: 1 },
    },
    goblinArcher: {
      name: "Goblin Archer", sprite: "goblinArcher", moveRange: 3, attackRange: 3,
      stats: { hp: 14, spd: 10, str: 4, atk: 3, def: 0, spAtk: 7, spDef: 1 },
    },
  };
  // Default loadout: one of every class. Warrior pushed forward so the melee
  // fighter closes faster; Archer + Mage sit on the back row to shoot.
  const DEFAULT_ALLY_LOADOUT = [
    { classId: "warrior", x: 2, y: 7 },
    { classId: "archer",  x: 5, y: 7 },
    { classId: "mage",    x: 8, y: 7 },
  ];
  const ENEMY_STARTS = [
    { type: "goblin",       x: 7, y: 0 },
    { type: "goblinArcher", x: 9, y: 0 },
    { type: "goblin",       x: 8, y: 2 },
    { type: "goblin",       x: 8, y: 4 },
  ];
  // Deploy zone: bottom two rows of the map.
  const SPAWN_ROWS = new Set([6, 7]);
  const DEPLOY_BUDGET = 3; // full party of three (Warrior + Archer + Mage)

  // === Initiative ===========================================================
  // Initiative = 1d20 + floor(Speed / 4). Ties resolve in this order:
  // higher raw Speed > ally over enemy > creation order. The Speed
  // tiebreak makes the new stat matter even when rolls collide.
  function rollInitiative(unit, seq) {
    const roll = Math.floor(Math.random() * 20) + 1;
    const mod = Math.floor((unit.spd ?? 0) / 4);
    unit.initiative = { roll, mod, total: roll + mod, seq };
  }
  function compareInitiative(a, b) {
    if (a.initiative.total !== b.initiative.total) return b.initiative.total - a.initiative.total;
    if (a.spd !== b.spd) return b.spd - a.spd;
    if (a.kind === "ally" && b.kind !== "ally") return -1;
    if (b.kind === "ally" && a.kind !== "ally") return 1;
    return a.initiative.seq - b.initiative.seq;
  }

  // === Rewards / persistence ================================================
  const REWARD = { xp: 50, gold: 30 };
  const IDLE_SAVE_KEY = "dailydefense.idle.v1";
  const xpForLevel = (level) => Math.floor(40 * Math.pow(level, 1.65));

  // === Test mode ============================================================
  // Enabled via ?test=1 in the URL; persisted in localStorage so refresh
  // keeps it on. Click "Exit Test Mode" in the sidebar (or clear
  // localStorage) to leave. Insta-Win bypasses the idle-save reward so
  // testing doesn't pollute the player's XP/gold.
  const TEST_KEY = "dailydefense.tactics.testMode";
  function loadTestMode() {
    try {
      if (new URLSearchParams(window.location.search).has("test")) {
        localStorage.setItem(TEST_KEY, "1");
        return true;
      }
      return localStorage.getItem(TEST_KEY) === "1";
    } catch { return false; }
  }
  const testModeOn = loadTestMode();
  const testFlags = {
    godMode: false,
    oneShot: false,
    fastMode: false,
    showCoords: false,
  };

  // === State ================================================================
  let nextUnitId = 1;
  function makeUnit(tmpl, kind, x, y) {
    const s = tmpl.stats;
    return {
      id: `u${nextUnitId++}`,
      kind, // "ally" | "enemy"
      name: tmpl.name,
      sprite: tmpl.sprite,
      x, y,
      hp: s.hp,
      maxHp: s.hp,
      spd: s.spd,
      str: s.str,
      atk: s.atk,
      def: s.def,
      spAtk: s.spAtk,
      spDef: s.spDef,
      moveRange: tmpl.moveRange,
      attackRange: tmpl.attackRange,
      hasActed: false,
      initiative: { roll: 0, mod: 0, total: 0, seq: 0 },
    };
  }

  function freshBattle() {
    nextUnitId = 1;
    return {
      units: [
        ...DEFAULT_ALLY_LOADOUT.map((d) =>
          makeUnit(UNIT_CLASSES[d.classId], "ally", d.x, d.y)),
        ...ENEMY_STARTS.map((p) => makeUnit(ENEMY_TYPES[p.type], "enemy", p.x, p.y)),
      ],
      phase: "deploy", // "deploy" | "battle" | "done"
      round: 1,
      initiativeOrder: [], // unit ids in turn order
      currentTurnIndex: 0,
      selectedClass: null,
      reachable: new Map(),
      attackTargets: new Set(),
      awaitingAttack: false,
      busy: false,
      outcome: null,
    };
  }

  let state = freshBattle();
  let log = [];
  const MAX_LOG = 24;

  // === DOM ==================================================================
  const $ = (id) => document.getElementById(id);
  const elBoard = $("tactics-board");
  const elStatus = $("tactics-status");
  const elVersion = $("app-version");
  const elLog = $("tactics-log");
  const elTurn = $("battle-turn");
  const elPhase = $("battle-phase");
  const elSkip = $("battle-skip");
  const elDeployPanel = $("deploy-panel");
  const elBattlePanel = $("battle-panel");
  const elInitiativePanel = $("initiative-panel");
  const elRosterPanel = $("roster-panel");
  const elDeployRemaining = $("deploy-remaining");
  const elDeployClasses = $("deploy-classes");
  const elDeployStart = $("deploy-start");
  const elInitiativeList = $("initiative-list");
  const elRoster = $("unit-roster");
  const elOutcomeBackdrop = $("outcome-backdrop");
  const elOutcomeModal = $("outcome-modal");
  const elOutcomeTitle = $("outcome-title");
  const elOutcomeBody = $("outcome-body");
  const elOutcomeAgain = $("outcome-again");

  // === Map / unit helpers ===================================================
  const key = (x, y) => `${x},${y}`;
  const terrainAt = (x, y) => TERRAIN[MAP[y][x]] || "grass";
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
  const passableTerrain = (x, y) => inBounds(x, y) && !IMPASSABLE.has(terrainAt(x, y));
  const unitAt = (x, y) => state.units.find((u) => u.hp > 0 && u.x === x && u.y === y);
  const livingEnemies = () => state.units.filter((u) => u.kind === "enemy" && u.hp > 0);
  const livingAllies  = () => state.units.filter((u) => u.kind === "ally"  && u.hp > 0);
  const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const currentUnit = () => state.units.find((u) => u.id === state.initiativeOrder[state.currentTurnIndex]);
  const isMyTurn = (u) => state.phase === "battle" && currentUnit()?.id === u.id;

  function pushLog(text, kind) {
    log.unshift({ text, kind: kind || "" });
    if (log.length > MAX_LOG) log.length = MAX_LOG;
    renderLog();
  }
  function sleep(ms) {
    if (testModeOn && testFlags.fastMode) ms = Math.min(ms, 60);
    return new Promise((r) => setTimeout(r, ms));
  }

  // === BFS reachability =====================================================
  function reachableFrom(unit, range) {
    const visited = new Map();
    visited.set(key(unit.x, unit.y), 0);
    const queue = [{ x: unit.x, y: unit.y, cost: 0 }];
    while (queue.length) {
      const cur = queue.shift();
      if (cur.cost >= range) continue;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (!passableTerrain(nx, ny)) continue;
        // Same-kind units (ally/ally or enemy/enemy) can be path-walked
        // through; opposite-kind blocks the lane. The destination tile
        // is still required to be empty — that check sits in
        // renderSelection and onTileClick.
        const occ = unitAt(nx, ny);
        if (occ && occ.id !== unit.id && occ.kind !== unit.kind) continue;
        const next = cur.cost + 1;
        const k = key(nx, ny);
        if (visited.has(k) && visited.get(k) <= next) continue;
        visited.set(k, next);
        queue.push({ x: nx, y: ny, cost: next });
      }
    }
    return visited; // includes the start tile (cost 0)
  }

  function enemiesInRange(unit) {
    const targets = new Set();
    for (const other of state.units) {
      if (other.hp <= 0) continue;
      if (other.kind === unit.kind) continue;
      if (manhattan(unit, other) <= unit.attackRange) targets.add(other.id);
    }
    return targets;
  }

  // === Deploy phase =========================================================
  function isSpawnTile(x, y) {
    return SPAWN_ROWS.has(y) && passableTerrain(x, y) && !unitAt(x, y);
  }
  function placedAllyCount() {
    return state.units.filter((u) => u.kind === "ally").length;
  }
  function remainingDeploy() {
    return DEPLOY_BUDGET - placedAllyCount();
  }
  function selectDeployClass(id) {
    if (state.phase !== "deploy") return;
    state.selectedClass = state.selectedClass === id ? null : id;
    renderAll();
  }
  function placeAlly(classId, x, y) {
    const tmpl = UNIT_CLASSES[classId];
    if (!tmpl) return;
    if (remainingDeploy() <= 0) return;
    if (!isSpawnTile(x, y)) return;
    state.units.push(makeUnit(tmpl, "ally", x, y));
    pushLog(`${tmpl.name} deployed at (${x}, ${y}).`, "phase");
    if (remainingDeploy() <= 0) state.selectedClass = null;
    renderAll();
  }
  function removeAlly(unitId) {
    const idx = state.units.findIndex((u) => u.id === unitId);
    if (idx < 0) return;
    const u = state.units[idx];
    state.units.splice(idx, 1);
    pushLog(`${u.name} stood down.`, "");
    renderAll();
  }
  function beginBattle() {
    if (state.phase !== "deploy") return;
    // Roll initiative for every unit, assign creation-order seq for tiebreak.
    state.units.forEach((u, i) => rollInitiative(u, i));
    const sorted = [...state.units].sort(compareInitiative);
    state.initiativeOrder = sorted.map((u) => u.id);
    state.currentTurnIndex = 0;
    state.round = 1;
    state.phase = "battle";
    state.selectedClass = null;
    pushLog(`— Round 1 — Initiative rolled.`, "phase");
    for (const u of sorted) {
      pushLog(`  ${u.name}: ${u.initiative.total} (d20=${u.initiative.roll}${u.initiative.mod >= 0 ? "+" : ""}${u.initiative.mod}, Spd ${u.spd})`, "init");
    }
    renderAll();
    void beginTurn();
  }

  // === Battle turn loop =====================================================
  async function beginTurn() {
    if (state.outcome) return;
    // Skip dead or non-existent units.
    while (state.currentTurnIndex < state.initiativeOrder.length) {
      const u = currentUnit();
      if (u && u.hp > 0) break;
      state.currentTurnIndex += 1;
    }
    if (state.currentTurnIndex >= state.initiativeOrder.length) {
      // End of round → new round, reset hasActed.
      state.round += 1;
      state.currentTurnIndex = 0;
      for (const u of state.units) u.hasActed = false;
      pushLog(`— Round ${state.round} —`, "phase");
      // Re-skip dead units at the top of the new round.
      return beginTurn();
    }
    const u = currentUnit();
    if (!u) return;

    state.attackTargets = new Set();
    state.awaitingAttack = false;

    if (u.kind === "ally") {
      state.reachable = reachableFrom(u, u.moveRange);
      renderAll();
    } else {
      state.reachable = new Map();
      renderAll();
      await sleep(500);
      await enemyTakeTurn(u);
      if (checkOutcome()) return;
      await endCurrentTurn();
    }
  }

  async function endCurrentTurn() {
    if (state.outcome) return;
    const u = currentUnit();
    if (u) u.hasActed = true;
    state.currentTurnIndex += 1;
    state.reachable = new Map();
    state.attackTargets = new Set();
    state.awaitingAttack = false;
    renderAll();
    await sleep(120);
    await beginTurn();
  }

  function skipCurrentTurn() {
    if (state.phase !== "battle" || state.busy || state.outcome) return;
    const u = currentUnit();
    if (!u || u.kind !== "ally") return;
    if (state.awaitingAttack) pushLog(`${u.name} holds the line.`, "");
    else pushLog(`${u.name} waits.`, "");
    void endCurrentTurn();
  }

  // === Rendering ============================================================
  function buildBoard() {
    elBoard.style.gridTemplateColumns = `repeat(${COLS}, var(--tile-size))`;
    const frag = document.createDocumentFragment();
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const tile = document.createElement("div");
        tile.className = `tile terrain-${terrainAt(x, y)}`;
        tile.dataset.x = String(x);
        tile.dataset.y = String(y);
        const coords = document.createElement("span");
        coords.className = "tile-coords";
        coords.textContent = `${x},${y}`;
        tile.appendChild(coords);
        tile.addEventListener("click", () => onTileClick(x, y));
        frag.appendChild(tile);
      }
    }
    elBoard.appendChild(frag);
    renderUnits();
  }

  function tileAt(x, y) {
    return elBoard.querySelector(`.tile[data-x="${x}"][data-y="${y}"]`);
  }
  function unitEl(id) { return elBoard.querySelector(`.unit[data-id="${id}"]`); }

  function renderUnits() {
    for (const node of elBoard.querySelectorAll(".unit")) {
      const id = node.dataset.id;
      if (!state.units.find((u) => u.id === id)) node.remove();
    }
    for (const u of state.units) {
      let node = unitEl(u.id);
      if (!node) {
        node = document.createElement("div");
        node.className = `unit ${u.kind}`;
        node.dataset.id = u.id;
        node.innerHTML = `
          <div class="unit-sprite">${spriteSvg(u.sprite)}</div>
          <div class="unit-hp"><div class="unit-hp-fill"></div></div>
        `;
        elBoard.appendChild(node);
      }
      positionUnit(u);
      const dimmed = u.hp > 0 && u.hasActed && state.phase === "battle";
      node.classList.toggle("acted", dimmed);
      node.classList.toggle("dead", u.hp <= 0);
      node.classList.toggle("active-turn", isMyTurn(u) && u.hp > 0);
      const fill = node.querySelector(".unit-hp-fill");
      const pct = Math.max(0, u.hp / u.maxHp);
      fill.style.width = `${pct * 100}%`;
      fill.classList.toggle("low", pct > 0 && pct <= 0.33);
    }
  }

  function positionUnit(u) {
    const tile = tileAt(u.x, u.y);
    const node = unitEl(u.id);
    if (!tile || !node) return;
    node.style.transform = `translate(${tile.offsetLeft}px, ${tile.offsetTop}px)`;
  }

  function clearTileHighlights() {
    for (const t of elBoard.querySelectorAll(".tile.reachable, .tile.selected, .tile.attack-target, .tile.spawnable, .tile.attack-range-preview, .tile.attack-range")) {
      t.classList.remove("reachable", "selected", "attack-target", "spawnable", "attack-range-preview", "attack-range");
    }
    for (const n of elBoard.querySelectorAll(".unit.attackable, .unit.removable, .unit.in-range-preview")) {
      n.classList.remove("attackable", "removable", "in-range-preview");
    }
  }

  function renderSelection() {
    clearTileHighlights();
    if (state.phase === "deploy") {
      if (state.selectedClass && remainingDeploy() > 0) {
        for (const y of SPAWN_ROWS) {
          for (let x = 0; x < COLS; x++) {
            if (isSpawnTile(x, y)) tileAt(x, y)?.classList.add("spawnable");
          }
        }
      }
      for (const u of state.units) {
        if (u.kind === "ally") unitEl(u.id)?.classList.add("removable");
      }
      return;
    }
    const cur = currentUnit();
    if (!cur || cur.kind !== "ally" || state.outcome) return;
    tileAt(cur.x, cur.y)?.classList.add("selected");
    if (!state.awaitingAttack) {
      for (const k of state.reachable.keys()) {
        if (k === key(cur.x, cur.y)) continue;
        const [x, y] = k.split(",").map(Number);
        if (unitAt(x, y)) continue;
        tileAt(x, y)?.classList.add("reachable");
      }
      // Outline the *max* attack-range zone: every tile that could be
      // attacked from any reachable move destination. This shows the
      // player their full threat coverage for the turn, not just their
      // reach from the current tile.
      const threat = new Set();
      for (const moveKey of state.reachable.keys()) {
        const [rx, ry] = moveKey.split(",").map(Number);
        for (let dy = -cur.attackRange; dy <= cur.attackRange; dy++) {
          for (let dx = -cur.attackRange; dx <= cur.attackRange; dx++) {
            const d = Math.abs(dx) + Math.abs(dy);
            if (d === 0 || d > cur.attackRange) continue;
            const nx = rx + dx, ny = ry + dy;
            if (!inBounds(nx, ny)) continue;
            threat.add(key(nx, ny));
          }
        }
      }
      for (const tk of threat) {
        if (tk === key(cur.x, cur.y)) continue;
        const [x, y] = tk.split(",").map(Number);
        tileAt(x, y)?.classList.add("attack-range");
      }
      // Outline every enemy that lands in the threat zone — these are the
      // ones the player can engage via auto-path.
      for (const other of state.units) {
        if (other.hp <= 0 || other.kind === cur.kind) continue;
        if (threat.has(key(other.x, other.y))) {
          tileAt(other.x, other.y)?.classList.add("attack-range-preview");
          unitEl(other.id)?.classList.add("in-range-preview");
        }
      }
    }
    for (const id of state.attackTargets) {
      const target = state.units.find((u) => u.id === id);
      if (!target) continue;
      tileAt(target.x, target.y)?.classList.add("attack-target");
      unitEl(id)?.classList.add("attackable");
    }
  }

  function renderHud() {
    elDeployPanel.classList.toggle("hidden", state.phase !== "deploy");
    elBattlePanel.classList.toggle("hidden", state.phase === "deploy");
    elInitiativePanel.classList.toggle("hidden", state.phase === "deploy");
    elRosterPanel.classList.toggle("hidden", state.phase === "deploy");

    if (state.phase === "deploy") {
      elTurn.textContent = "Deploy";
      elPhase.textContent = "Muster your army";
      elPhase.dataset.phase = "deploy";
    } else {
      const u = currentUnit();
      elTurn.textContent = `Round ${state.round}`;
      if (state.outcome) {
        elPhase.textContent = state.outcome === "win" ? "Victory" : "Defeated";
        elPhase.dataset.phase = "done";
      } else if (u) {
        elPhase.textContent = `${u.name}'s turn`;
        elPhase.dataset.phase = u.kind;
      } else {
        elPhase.textContent = "Battle";
        elPhase.dataset.phase = "battle";
      }
    }

    const cur = currentUnit();
    const myAllyTurn = state.phase === "battle" && cur && cur.kind === "ally" && !state.outcome;
    elSkip.classList.toggle("hidden", !myAllyTurn);
    elSkip.textContent = state.awaitingAttack ? "Skip Attack" : "Skip Turn";
    elSkip.disabled = state.busy;
    elDeployRemaining.textContent = String(remainingDeploy());
    elDeployStart.disabled = state.phase !== "deploy";

    if (state.phase === "deploy") {
      if (state.selectedClass) {
        elStatus.textContent = remainingDeploy() > 0
          ? `Tap a cyan spawn tile to place ${UNIT_CLASSES[state.selectedClass].name}, or tap a placed ally to remove.`
          : "Squad full — Begin Battle when ready.";
      } else if (remainingDeploy() === 0) {
        elStatus.textContent = "Default formation deployed — hit Begin Battle, or tap an ally to swap.";
      } else if (remainingDeploy() === DEPLOY_BUDGET) {
        elStatus.textContent = "Pick a class to deploy, or Begin Battle to fight solo.";
      } else {
        elStatus.textContent = "Pick another class to deploy, or Begin Battle when ready.";
      }
    } else if (state.outcome) {
      elStatus.textContent = state.outcome === "win" ? "Victory." : "Defeated.";
    } else if (state.busy) {
      elStatus.textContent = "Resolving…";
    } else if (cur && cur.kind === "enemy") {
      elStatus.textContent = `${cur.name} takes its turn…`;
    } else if (cur && state.awaitingAttack) {
      const n = state.attackTargets.size;
      elStatus.textContent = n > 0
        ? `${cur.name}: click a highlighted enemy to attack, or Skip Attack.`
        : `${cur.name}: no enemies in range. Skip Attack to end the turn.`;
    } else if (cur) {
      elStatus.textContent = `${cur.name}: click a highlighted tile to move (your own tile = stay).`;
    } else {
      elStatus.textContent = "";
    }
  }

  function renderDeployPanel() {
    if (state.phase !== "deploy") return;
    elDeployClasses.innerHTML = CLASS_ORDER.map((id) => {
      const c = UNIT_CLASSES[id];
      const s = c.stats;
      const isSelected = state.selectedClass === id;
      const disabled = remainingDeploy() <= 0 && !isSelected;
      return `
        <button type="button" class="deploy-class ${isSelected ? "selected" : ""}"
                data-class="${id}" ${disabled ? "disabled" : ""}>
          <span class="deploy-class-sprite">${spriteSvg(c.sprite, { small: true })}</span>
          <span class="deploy-class-meta">
            <strong>${c.name}</strong>
            <small>HP ${s.hp} · Move ${c.moveRange} · Rng ${c.attackRange}</small>
            <small>Str ${s.str} · Def ${s.def} · SpA ${s.spAtk} · SpD ${s.spDef}</small>
            <small>Spd ${s.spd} · Atk ${s.atk}</small>
          </span>
        </button>`;
    }).join("");
    for (const btn of elDeployClasses.querySelectorAll("button[data-class]")) {
      btn.addEventListener("click", () => selectDeployClass(btn.dataset.class));
    }
  }

  function renderInitiative() {
    if (state.phase !== "battle" && state.phase !== "done") {
      elInitiativeList.innerHTML = "";
      return;
    }
    const items = state.initiativeOrder.map((id, idx) => {
      const u = state.units.find((x) => x.id === id);
      if (!u) return "";
      const isCurrent = idx === state.currentTurnIndex && state.phase === "battle" && u.hp > 0;
      const acted = u.hasActed && u.hp > 0;
      const dead = u.hp <= 0;
      const flags = [];
      if (isCurrent) flags.push("current");
      if (acted)    flags.push("acted");
      if (dead)     flags.push("dead");
      return `
        <li class="init-row init-${u.kind} ${flags.join(" ")}">
          <span class="init-marker">${isCurrent ? "▶" : ""}</span>
          <span class="init-total">${u.initiative.total}</span>
          <span class="init-name">${escapeHtml(u.name)}</span>
          <span class="init-hp">${Math.max(0, u.hp)}/${u.maxHp}</span>
        </li>`;
    }).join("");
    elInitiativeList.innerHTML = items;
  }

  function renderRoster() {
    const items = state.units.map((u) => {
      const pct = Math.max(0, u.hp / u.maxHp) * 100;
      const status = u.hp <= 0 ? "fallen" : u.hasActed ? "acted" : "ready";
      const damageStat = u.attackRange > 1 ? `SpA ${u.spAtk}` : `Str ${u.str}`;
      return `
        <li class="roster-row roster-${u.kind} roster-${status}">
          <span class="roster-sprite">${spriteSvg(u.sprite, { small: true })}</span>
          <span class="roster-meta">
            <strong>${escapeHtml(u.name)}</strong>
            <small>Spd ${u.spd} · ${damageStat} · Rng ${u.attackRange}</small>
          </span>
          <span class="roster-bar">
            <span class="roster-bar-fill" style="width:${pct}%"></span>
            <span class="roster-bar-label">${Math.max(0, u.hp)}/${u.maxHp}</span>
          </span>
        </li>`;
    }).join("");
    elRoster.innerHTML = items;
  }

  function renderLog() {
    elLog.innerHTML = log
      .map((e) => `<li class="${e.kind}">${escapeHtml(e.text)}</li>`)
      .join("");
  }

  function renderAll() {
    renderUnits();
    renderSelection();
    renderHud();
    renderDeployPanel();
    renderInitiative();
    renderRoster();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  }

  // === Interaction ==========================================================
  function onTileClick(x, y) {
    if (state.busy || state.outcome) return;
    const clicked = unitAt(x, y);

    if (state.phase === "deploy") {
      if (clicked && clicked.kind === "ally") {
        removeAlly(clicked.id);
        return;
      }
      if (state.selectedClass && isSpawnTile(x, y)) {
        placeAlly(state.selectedClass, x, y);
        return;
      }
      return;
    }

    if (state.phase !== "battle") return;
    const cur = currentUnit();
    if (!cur || cur.kind !== "ally") return;

    if (state.awaitingAttack) {
      if (clicked && state.attackTargets.has(clicked.id)) {
        doAttack(cur.id, clicked.id);
      } else {
        skipAttack();
      }
      return;
    }

    // Click own tile → stay put (skip move, jump to attack-or-skip).
    if (clicked && clicked.id === cur.id) {
      doMove(cur.id, cur.x, cur.y);
      return;
    }

    // Click an enemy → auto-path to the closest reachable tile that puts
    // them in attack range, then strike.
    if (clicked && clicked.kind !== cur.kind && clicked.hp > 0) {
      const spot = bestAttackSpot(cur, clicked);
      if (spot) autoPathAndAttack(cur.id, spot.x, spot.y, clicked.id);
      return;
    }

    // Click an empty reachable tile → move there.
    if (!clicked && state.reachable.has(key(x, y))) {
      doMove(cur.id, x, y);
    }
  }

  // Find the cheapest reachable tile from which `unit` can attack `target`.
  // Returns { x, y } or null if no such tile exists in the current move set.
  function bestAttackSpot(unit, target) {
    let best = null;
    let bestCost = Infinity;
    for (const [k, cost] of state.reachable) {
      const [x, y] = k.split(",").map(Number);
      const occ = unitAt(x, y);
      // Can't end the move on someone else (own tile is fine — cost 0).
      if (occ && occ.id !== unit.id) continue;
      if (manhattan({ x, y }, target) > unit.attackRange) continue;
      if (cost < bestCost) {
        bestCost = cost;
        best = { x, y };
      }
    }
    return best;
  }

  async function autoPathAndAttack(unitId, mx, my, targetId) {
    const u = state.units.find((x) => x.id === unitId);
    if (!u) return;
    const dist = manhattan({ x: u.x, y: u.y }, { x: mx, y: my });
    if (dist > 0) {
      state.busy = true;
      renderHud();
      u.x = mx; u.y = my;
      positionUnit(u);
      pushLog(`${u.name} closes on the target — (${mx}, ${my}).`, "move");
      await sleep(240);
      state.busy = false;
    }
    state.reachable = new Map();
    await doAttack(unitId, targetId);
  }

  async function doMove(unitId, x, y) {
    const u = state.units.find((x) => x.id === unitId);
    if (!u) return;
    const dist = manhattan({ x: u.x, y: u.y }, { x, y });
    if (dist > 0) {
      state.busy = true;
      renderHud();
      u.x = x; u.y = y;
      positionUnit(u);
      pushLog(`${u.name} marches to (${x}, ${y}).`, "move");
      await sleep(240);
      state.busy = false;
    }
    state.attackTargets = enemiesInRange(u);
    state.reachable = new Map();
    if (state.attackTargets.size > 0) {
      state.awaitingAttack = true;
      renderAll();
      return;
    }
    await endCurrentTurn();
  }

  function skipAttack() {
    const u = currentUnit();
    if (!u) return;
    pushLog(`${u.name} holds position.`, "");
    void endCurrentTurn();
  }

  async function doAttack(attackerId, targetId) {
    const attacker = state.units.find((u) => u.id === attackerId);
    const target = state.units.find((u) => u.id === targetId);
    if (!attacker || !target) return;
    state.busy = true;
    renderHud();
    await resolveAttack(attacker, target);
    state.busy = false;
    if (checkOutcome()) return;
    await endCurrentTurn();
  }

  async function resolveAttack(attacker, target) {
    const ranged = manhattan(attacker, target) > 1;
    // Melee = Strength vs Defense; ranged/magic = SpAtk vs SpDef.
    let dmg = ranged
      ? Math.max(1, attacker.spAtk - target.spDef)
      : Math.max(1, attacker.str   - target.def);
    if (testModeOn) {
      if (testFlags.godMode && target.kind === "ally") dmg = 0;
      if (testFlags.oneShot && attacker.kind === "ally") dmg = target.maxHp;
    }
    target.hp = Math.max(0, target.hp - dmg);
    const verb = ranged ? "shoots" : "hits";
    pushLog(`${attacker.name} ${verb} ${target.name} for ${dmg}.`, attacker.kind === "ally" ? "hit-ally" : "hit-enemy");
    if (ranged) {
      animateRangedShot(attacker, target);
      await sleep(300);
      animateHit(target);
      popDamage(target, dmg);
    } else {
      animateMelee(attacker, target);
      popDamage(target, dmg);
    }
    await sleep(360);
    if (target.hp <= 0) {
      pushLog(`${target.name} falls!`, "kill");
      unitEl(target.id)?.classList.add("dying");
      await sleep(420);
    }
    renderUnits();
    renderRoster();
    renderInitiative();
  }

  // === Enemy AI =============================================================
  function pickEnemyTarget(enemy) {
    const allies = livingAllies();
    if (allies.length === 0) return null;
    allies.sort((a, b) => {
      const da = manhattan(enemy, a), db = manhattan(enemy, b);
      if (da !== db) return da - db;
      // Tie-break: pick the lower-HP ally so enemies finish off the wounded.
      return a.hp - b.hp;
    });
    return allies[0];
  }

  async function enemyTakeTurn(enemy) {
    if (enemy.hp <= 0) return;
    const target = pickEnemyTarget(enemy);
    if (!target) return;
    const reach = reachableFrom(enemy, enemy.moveRange);
    let best = { x: enemy.x, y: enemy.y, score: Math.max(0, manhattan(enemy, target) - enemy.attackRange), cost: 0 };
    for (const [k, cost] of reach) {
      const [x, y] = k.split(",").map(Number);
      const occ = unitAt(x, y);
      if (occ && occ.id !== enemy.id) continue;
      const d = manhattan({ x, y }, target);
      const score = Math.max(0, d - enemy.attackRange);
      if (score < best.score || (score === best.score && cost < best.cost)) {
        best = { x, y, score, cost };
      }
    }
    if (best.x !== enemy.x || best.y !== enemy.y) {
      state.busy = true;
      renderHud();
      enemy.x = best.x; enemy.y = best.y;
      positionUnit(enemy);
      pushLog(`${enemy.name} advances to (${best.x}, ${best.y}).`, "");
      await sleep(280);
      state.busy = false;
    }
    if (manhattan(enemy, target) <= enemy.attackRange && target.hp > 0) {
      state.busy = true;
      renderHud();
      await resolveAttack(enemy, target);
      state.busy = false;
    }
  }

  // === Outcome ==============================================================
  function checkOutcome() {
    if (state.outcome) return true;
    if (livingAllies().length === 0) {
      state.outcome = "loss";
      state.phase = "done";
      onLoss();
      return true;
    }
    if (livingEnemies().length === 0) {
      state.outcome = "win";
      state.phase = "done";
      onWin();
      return true;
    }
    return false;
  }

  function onWin() {
    pushLog(`Victory! Enemy army wiped.`, "kill");
    const reward = applyReward(REWARD.xp, REWARD.gold);
    const lvlText = reward.levelsGained > 0
      ? `<p class="outcome-lvl">Level up! ${reward.startLevel} → ${reward.endLevel}</p>`
      : "";
    elOutcomeTitle.textContent = "Victory";
    elOutcomeTitle.className = "outcome-title win";
    elOutcomeBody.innerHTML = `
      <p>The field is yours.</p>
      <p class="outcome-reward">+${REWARD.xp} XP · +${REWARD.gold} gold</p>
      ${lvlText}
      <p class="muted">Rewards added to your idle save.</p>
    `;
    elOutcomeAgain.disabled = false;
    showOutcomeModal();
    renderAll();
  }

  function onLoss() {
    pushLog(`Your party has been wiped. Defeat.`, "death");
    elOutcomeTitle.textContent = "Defeated";
    elOutcomeTitle.className = "outcome-title loss";
    elOutcomeBody.innerHTML = `
      <p>Your party has been wiped.</p>
      <p class="muted">No rewards earned. Regroup and try again.</p>
    `;
    elOutcomeAgain.disabled = false;
    showOutcomeModal();
    renderAll();
  }

  function showOutcomeModal() { elOutcomeBackdrop.classList.remove("hidden"); elOutcomeModal.classList.remove("hidden"); }
  function hideOutcomeModal() { elOutcomeBackdrop.classList.add("hidden"); elOutcomeModal.classList.add("hidden"); }

  function applyReward(xp, gold) {
    let save;
    try {
      const raw = localStorage.getItem(IDLE_SAVE_KEY);
      save = raw ? JSON.parse(raw) : null;
    } catch { save = null; }
    if (!save) return { startLevel: 0, endLevel: 0, levelsGained: 0 };
    const startLevel = save.level || 1;
    save.gold = (save.gold || 0) + gold;
    save.xp = (save.xp || 0) + xp;
    save.maxHp = save.maxHp || 50;
    save.atk = save.atk || 5;
    save.hp = typeof save.hp === "number" ? save.hp : save.maxHp;
    let levelsGained = 0;
    while (save.xp >= xpForLevel(save.level)) {
      save.xp -= xpForLevel(save.level);
      save.level += 1;
      save.maxHp += 5;
      save.atk += 1;
      save.hp = save.maxHp;
      levelsGained += 1;
    }
    save.savedAt = Date.now();
    try { localStorage.setItem(IDLE_SAVE_KEY, JSON.stringify(save)); } catch {}
    return { startLevel, endLevel: save.level, levelsGained };
  }

  // === Combat animations ====================================================
  function animateMelee(attacker, target) {
    const node = unitEl(attacker.id);
    if (node) {
      const dx = Math.sign(target.x - attacker.x) * 10;
      const dy = Math.sign(target.y - attacker.y) * 10;
      node.style.setProperty("--attack-dx", `${dx}px`);
      node.style.setProperty("--attack-dy", `${dy}px`);
      node.classList.remove("attacking");
      void node.offsetWidth;
      node.classList.add("attacking");
      setTimeout(() => node.classList.remove("attacking"), 360);
    }
    animateHit(target);
  }
  function animateHit(target) {
    const tNode = unitEl(target.id);
    if (!tNode) return;
    tNode.classList.remove("hit");
    void tNode.offsetWidth;
    tNode.classList.add("hit");
    setTimeout(() => tNode.classList.remove("hit"), 320);
  }
  function animateRangedShot(attacker, target) {
    const aTile = tileAt(attacker.x, attacker.y);
    const tTile = tileAt(target.x, target.y);
    if (!aTile || !tTile) return;
    const half = 28; // half of var(--tile-size) = 56
    const ax = aTile.offsetLeft + half;
    const ay = aTile.offsetTop + half;
    const tx = tTile.offsetLeft + half;
    const ty = tTile.offsetTop + half;
    const angle = Math.atan2(ty - ay, tx - ax) * 180 / Math.PI;
    const isBolt = attacker.sprite === "mage";
    const w = isBolt ? 14 : 20;
    const h = isBolt ? 14 : 3;
    const projectile = document.createElement("div");
    projectile.className = `projectile ${isBolt ? "projectile-bolt" : "projectile-arrow"}`;
    projectile.style.transform = `translate(${ax - w / 2}px, ${ay - h / 2}px) rotate(${angle}deg)`;
    elBoard.appendChild(projectile);
    requestAnimationFrame(() => {
      projectile.style.transform = `translate(${tx - w / 2}px, ${ty - h / 2}px) rotate(${angle}deg)`;
    });
    setTimeout(() => projectile.remove(), 380);
  }
  function popDamage(target, value) {
    const node = unitEl(target.id);
    if (!node) return;
    const span = document.createElement("span");
    span.className = "damage-popup";
    span.textContent = `−${value}`;
    node.appendChild(span);
    setTimeout(() => span.remove(), 850);
  }

  // === Sprites ==============================================================
  function spriteSvg(kind, _opts) {
    switch (kind) {
      case "warrior":      return warriorSvg();
      case "archer":       return archerSvg();
      case "mage":         return mageSvg();
      case "goblin":       return goblinSvg();
      case "goblinArcher": return goblinArcherSvg();
      default:             return "";
    }
  }

  function warriorSvg() {
    return `
<svg viewBox="0 0 90 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="45" cy="115" rx="22" ry="3" fill="#000" opacity="0.35"/>
  <rect x="33" y="88" width="9" height="22" rx="3" fill="#2c2240"/>
  <rect x="48" y="88" width="9" height="22" rx="3" fill="#2c2240"/>
  <rect x="28" y="48" width="34" height="44" rx="6" fill="#8a3a2a" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"/>
  <rect x="28" y="78" width="34" height="5" fill="rgba(0,0,0,0.35)"/>
  <rect x="20" y="54" width="11" height="22" rx="3" fill="#3a7aa0" stroke="rgba(0,0,0,0.4)" stroke-width="1"/>
  <circle cx="25.5" cy="64" r="2" fill="#ffd86b"/>
  <circle cx="45" cy="32" r="13" fill="#f4c592" stroke="rgba(0,0,0,0.25)" stroke-width="1"/>
  <circle cx="50" cy="32" r="1.7" fill="#222"/>
  <rect x="60" y="50" width="8" height="26" rx="3" fill="#8a3a2a"/>
  <rect x="63" y="30" width="3" height="34" fill="#5a3a1a"/>
  <path d="M58 28 L74 28 L70 38 L62 38 Z" fill="#c0c4cc" stroke="rgba(0,0,0,0.4)" stroke-width="0.8"/>
</svg>`;
  }

  function archerSvg() {
    return `
<svg viewBox="0 0 90 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="45" cy="115" rx="22" ry="3" fill="#000" opacity="0.35"/>
  <rect x="33" y="88" width="9" height="22" rx="3" fill="#2c2240"/>
  <rect x="48" y="88" width="9" height="22" rx="3" fill="#2c2240"/>
  <rect x="28" y="48" width="34" height="44" rx="6" fill="#4a6a2a" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"/>
  <rect x="28" y="78" width="34" height="5" fill="rgba(0,0,0,0.35)"/>
  <path d="M32 28 Q45 14 58 28 L58 38 L32 38 Z" fill="#2e4a18"/>
  <circle cx="45" cy="34" r="9" fill="#f4c592" stroke="rgba(0,0,0,0.25)" stroke-width="1"/>
  <circle cx="50" cy="34" r="1.5" fill="#222"/>
  <rect x="58" y="50" width="8" height="26" rx="3" fill="#4a6a2a"/>
  <path d="M70 28 Q86 56 70 84" stroke="#5a3a1a" stroke-width="3" fill="none"/>
  <line x1="70" y1="28" x2="70" y2="84" stroke="#dadada" stroke-width="1"/>
  <rect x="68" y="54" width="18" height="2" fill="#dadada"/>
  <path d="M86 55 L82 51 L82 59 Z" fill="#c0c4cc"/>
</svg>`;
  }

  function mageSvg() {
    return `
<svg viewBox="0 0 90 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="45" cy="115" rx="22" ry="3" fill="#000" opacity="0.35"/>
  <path d="M20 110 L28 50 L62 50 L70 110 Z" fill="#3a4aaa" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"/>
  <rect x="28" y="78" width="34" height="5" fill="rgba(0,0,0,0.4)"/>
  <path d="M30 38 Q45 6 60 38 L58 42 L32 42 Z" fill="#2a3478" stroke="rgba(0,0,0,0.4)" stroke-width="1"/>
  <circle cx="45" cy="40" r="6.5" fill="#f4c592"/>
  <circle cx="48" cy="40" r="1.4" fill="#222"/>
  <rect x="66" y="20" width="3" height="80" fill="#5a3a1a"/>
  <circle cx="67.5" cy="18" r="7" fill="#ff8af0" stroke="rgba(0,0,0,0.4)" stroke-width="1"/>
  <circle cx="65.5" cy="16" r="2" fill="#fff" opacity="0.6"/>
</svg>`;
  }

  function goblinSvg() {
    return `
<svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="50" cy="115" rx="22" ry="3" fill="#000" opacity="0.35"/>
  <rect x="36" y="86" width="9" height="22" rx="3" fill="#3a2c00"/>
  <rect x="55" y="86" width="9" height="22" rx="3" fill="#3a2c00"/>
  <rect x="30" y="52" width="40" height="40" rx="6" fill="#7fa84a" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"/>
  <circle cx="50" cy="36" r="14" fill="#9fc760" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"/>
  <path d="M36 32 L28 28 L36 40 Z" fill="#9fc760"/>
  <path d="M64 32 L72 28 L64 40 Z" fill="#9fc760"/>
  <circle cx="44" cy="36" r="2" fill="#ff3333"/>
  <circle cx="56" cy="36" r="2" fill="#ff3333"/>
  <path d="M42 44 L50 48 L58 44" stroke="#0b1020" stroke-width="2" fill="none" stroke-linecap="round"/>
  <rect x="22" y="60" width="2" height="18" fill="#c0c4cc"/>
  <rect x="20" y="78" width="6" height="2" fill="#3a2c00"/>
</svg>`;
  }

  function goblinArcherSvg() {
    return `
<svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="50" cy="115" rx="22" ry="3" fill="#000" opacity="0.35"/>
  <rect x="36" y="86" width="9" height="22" rx="3" fill="#3a2c00"/>
  <rect x="55" y="86" width="9" height="22" rx="3" fill="#3a2c00"/>
  <rect x="30" y="52" width="40" height="40" rx="6" fill="#6a8a3a" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"/>
  <circle cx="50" cy="36" r="14" fill="#8aaf50" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"/>
  <path d="M36 32 L28 28 L36 40 Z" fill="#8aaf50"/>
  <path d="M64 32 L72 28 L64 40 Z" fill="#8aaf50"/>
  <circle cx="44" cy="36" r="2" fill="#ff3333"/>
  <circle cx="56" cy="36" r="2" fill="#ff3333"/>
  <path d="M16 30 Q4 56 16 82" stroke="#5a3a1a" stroke-width="3" fill="none"/>
  <line x1="16" y1="30" x2="16" y2="82" stroke="#dadada" stroke-width="1"/>
  <rect x="14" y="55" width="20" height="2" fill="#dadada"/>
  <path d="M34 56 L30 52 L30 60 Z" fill="#c0c4cc"/>
</svg>`;
  }

  // === Test-mode actions ====================================================
  function testHealParty() {
    if (!testModeOn) return;
    for (const a of state.units.filter((u) => u.kind === "ally")) a.hp = a.maxHp;
    pushLog("Test: party healed to full.", "phase");
    renderAll();
  }
  function testInstaWin() {
    if (!testModeOn || state.outcome) return;
    for (const e of livingEnemies()) e.hp = 0;
    pushLog("Test: enemies wiped.", "kill");
    state.outcome = "win";
    state.phase = "done";
    elOutcomeTitle.textContent = "Victory (Test)";
    elOutcomeTitle.className = "outcome-title win";
    elOutcomeBody.innerHTML = `
      <p>Test-mode insta-win. Idle save not modified.</p>
      <p class="muted">Use Skirmish Again to reset the board.</p>
    `;
    elOutcomeAgain.disabled = false;
    showOutcomeModal();
    renderAll();
  }
  function testInstaLose() {
    if (!testModeOn || state.outcome) return;
    for (const a of livingAllies()) a.hp = 0;
    pushLog("Test: party wiped.", "death");
    state.outcome = "loss";
    state.phase = "done";
    elOutcomeTitle.textContent = "Defeated (Test)";
    elOutcomeTitle.className = "outcome-title loss";
    elOutcomeBody.innerHTML = `
      <p>Test-mode insta-loss.</p>
      <p class="muted">Use Skirmish Again to reset the board.</p>
    `;
    elOutcomeAgain.disabled = false;
    showOutcomeModal();
    renderAll();
  }
  async function testSkipRound() {
    if (!testModeOn || state.phase !== "battle" || state.outcome || state.busy) return;
    for (const u of state.units) u.hasActed = true;
    state.currentTurnIndex = state.initiativeOrder.length;
    pushLog("Test: skipping to next round.", "phase");
    await beginTurn();
  }
  function testExitMode() {
    try { localStorage.removeItem(TEST_KEY); } catch {}
    const url = new URL(window.location.href);
    url.searchParams.delete("test");
    window.location.replace(url.toString());
  }
  function wireTestPanel() {
    if (!testModeOn) return;
    $("test-panel")?.classList.remove("hidden");
    $("test-chip")?.classList.remove("hidden");
    $("test-god").addEventListener("change", (e) => { testFlags.godMode = e.target.checked; });
    $("test-oneshot").addEventListener("change", (e) => { testFlags.oneShot = e.target.checked; });
    $("test-fast").addEventListener("change", (e) => { testFlags.fastMode = e.target.checked; });
    $("test-coords").addEventListener("change", (e) => {
      testFlags.showCoords = e.target.checked;
      elBoard.classList.toggle("show-coords", e.target.checked);
    });
    $("test-heal").addEventListener("click", testHealParty);
    $("test-skip-round").addEventListener("click", testSkipRound);
    $("test-win").addEventListener("click", testInstaWin);
    $("test-lose").addEventListener("click", testInstaLose);
    $("test-exit").addEventListener("click", testExitMode);
  }

  // === Lifecycle ============================================================
  async function fetchVersion() {
    try {
      const r = await fetch("/health");
      const data = await r.json();
      return data.version || "?";
    } catch { return "?"; }
  }
  function reposAllUnits() { for (const u of state.units) positionUnit(u); }

  function startNewBattle() {
    state = freshBattle();
    log = [];
    for (const node of elBoard.querySelectorAll(".unit")) node.remove();
    pushLog("Muster your army. Pick classes and place them on the cyan spawn tiles.", "phase");
    renderAll();
    hideOutcomeModal();
  }

  window.addEventListener("resize", reposAllUnits);
  elSkip.addEventListener("click", skipCurrentTurn);
  elOutcomeAgain.addEventListener("click", startNewBattle);
  elDeployStart.addEventListener("click", beginBattle);

  buildBoard();
  wireTestPanel();
  pushLog("Muster your army. Pick classes and place them on the cyan spawn tiles.", "phase");
  if (testModeOn) pushLog("Test mode active. Bypass controls in the red sidebar panel.", "phase");
  renderAll();
  fetchVersion().then((v) => { elVersion.textContent = `v${v}`; });
})();
