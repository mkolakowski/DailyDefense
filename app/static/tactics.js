(() => {
  "use strict";

  // --- Map ------------------------------------------------------------------
  // Hand-built 10x8 battlefield. Procedural generation lands in a later
  // release; for now this gives terrain variety + a couple of choke points
  // for the AI to navigate around.
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

  // --- Unit templates -------------------------------------------------------
  const COMMANDER = { name: "Commander", maxHp: 50, atk: 8, def: 2, moveRange: 4, sprite: "commander" };
  const GOBLIN    = { name: "Goblin",    maxHp: 20, atk: 4, def: 1, moveRange: 3, sprite: "goblin" };

  const COMMANDER_START = { x: 1, y: 7 };
  const ENEMY_STARTS = [
    { x: 7, y: 0 },
    { x: 8, y: 2 },
    { x: 6, y: 4 },
  ];

  // --- Rewards / persistence ------------------------------------------------
  const REWARD = { xp: 50, gold: 30 };
  const IDLE_SAVE_KEY = "dailydefense.idle.v1";
  // Mirrors xpForLevel() in game.js so level-ups awarded from tactics use the
  // same curve as XP earned from idle combat.
  const xpForLevel = (level) => Math.floor(40 * Math.pow(level, 1.65));

  // --- State ----------------------------------------------------------------
  let nextUnitId = 1;
  function makeUnit(tmpl, kind, x, y) {
    return {
      id: `u${nextUnitId++}`,
      kind,
      name: tmpl.name,
      sprite: tmpl.sprite,
      x, y,
      hp: tmpl.maxHp,
      maxHp: tmpl.maxHp,
      atk: tmpl.atk,
      def: tmpl.def,
      moveRange: tmpl.moveRange,
      hasActed: false,
    };
  }

  function freshBattle() {
    nextUnitId = 1;
    return {
      units: [
        makeUnit(COMMANDER, "ally", COMMANDER_START.x, COMMANDER_START.y),
        ...ENEMY_STARTS.map((p) => makeUnit(GOBLIN, "enemy", p.x, p.y)),
      ],
      phase: "player",        // "player" | "enemy" | "done"
      turn: 1,
      selectedId: null,
      reachable: new Map(),    // tile-key -> cost (only set while a unit is selected pre-move)
      attackTargets: new Set(),// unit ids attackable from current position
      awaitingAttack: false,   // selected unit has moved, awaiting attack-or-skip
      busy: false,             // animation in progress, ignore input
      outcome: null,           // null | "win" | "loss"
    };
  }

  let state = freshBattle();
  let log = [];
  const MAX_LOG = 24;

  // --- DOM ------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const elBoard = $("tactics-board");
  const elStatus = $("tactics-status");
  const elVersion = $("app-version");
  const elLog = $("tactics-log");
  const elTurn = $("battle-turn");
  const elPhase = $("battle-phase");
  const elEndTurn = $("battle-end-turn");
  const elSkipAttack = $("battle-skip-attack");
  const elRoster = $("unit-roster");
  const elOutcomeBackdrop = $("outcome-backdrop");
  const elOutcomeModal = $("outcome-modal");
  const elOutcomeTitle = $("outcome-title");
  const elOutcomeBody = $("outcome-body");
  const elOutcomeAgain = $("outcome-again");

  // --- Helpers --------------------------------------------------------------
  const key = (x, y) => `${x},${y}`;
  const terrainAt = (x, y) => TERRAIN[MAP[y][x]] || "grass";
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
  const passableTerrain = (x, y) => inBounds(x, y) && !IMPASSABLE.has(terrainAt(x, y));
  const unitAt = (x, y) => state.units.find((u) => u.hp > 0 && u.x === x && u.y === y);
  const commander = () => state.units.find((u) => u.sprite === "commander");
  const livingEnemies = () => state.units.filter((u) => u.kind === "enemy" && u.hp > 0);
  const livingAllies = () => state.units.filter((u) => u.kind === "ally" && u.hp > 0);
  const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  function pushLog(text, kind) {
    log.unshift({ text, kind: kind || "" });
    if (log.length > MAX_LOG) log.length = MAX_LOG;
    renderLog();
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // --- BFS reachability -----------------------------------------------------
  // `blockerIds` are unit ids whose tiles count as impassable for this BFS.
  // Always block other living units; the moving unit's own start is allowed.
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
        const occupant = unitAt(nx, ny);
        if (occupant && occupant.id !== unit.id) continue;
        const next = cur.cost + 1;
        const k = key(nx, ny);
        if (visited.has(k) && visited.get(k) <= next) continue;
        visited.set(k, next);
        queue.push({ x: nx, y: ny, cost: next });
      }
    }
    return visited; // includes the start tile (cost 0)
  }

  function adjacentEnemiesOf(unit) {
    const targets = new Set();
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const occ = unitAt(unit.x + dx, unit.y + dy);
      if (occ && occ.kind !== unit.kind && occ.hp > 0) targets.add(occ.id);
    }
    return targets;
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
    renderUnits();
  }

  function tileAt(x, y) {
    return elBoard.querySelector(`.tile[data-x="${x}"][data-y="${y}"]`);
  }

  function unitEl(id) { return elBoard.querySelector(`.unit[data-id="${id}"]`); }

  function renderUnits() {
    // Remove any unit divs that no longer correspond to a unit in state.
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
      node.classList.toggle("acted", u.hasActed && u.hp > 0);
      node.classList.toggle("dead", u.hp <= 0);
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

  function renderSelection() {
    for (const t of elBoard.querySelectorAll(".tile.reachable, .tile.selected, .tile.attack-target")) {
      t.classList.remove("reachable", "selected", "attack-target");
    }
    for (const n of elBoard.querySelectorAll(".unit.selected, .unit.attackable")) {
      n.classList.remove("selected", "attackable");
    }
    const sel = state.units.find((u) => u.id === state.selectedId);
    if (!sel) return;
    const selTile = tileAt(sel.x, sel.y);
    if (selTile) selTile.classList.add("selected");
    unitEl(sel.id)?.classList.add("selected");
    if (!state.awaitingAttack) {
      for (const k of state.reachable.keys()) {
        // Skip the start tile in the highlight (still reachable, just don't paint it).
        if (k === key(sel.x, sel.y)) continue;
        const [x, y] = k.split(",").map(Number);
        const occ = unitAt(x, y);
        if (occ) continue; // can't end move on an occupied tile
        const t = tileAt(x, y);
        if (t) t.classList.add("reachable");
      }
    }
    for (const id of state.attackTargets) {
      const target = state.units.find((u) => u.id === id);
      if (!target) continue;
      const t = tileAt(target.x, target.y);
      if (t) t.classList.add("attack-target");
      unitEl(id)?.classList.add("attackable");
    }
  }

  function renderHud() {
    elTurn.textContent = `Turn ${state.turn}`;
    elPhase.textContent = state.phase === "player" ? "Player phase" :
                          state.phase === "enemy"  ? "Enemy phase"  :
                          "Battle over";
    elPhase.dataset.phase = state.phase;

    const sel = state.units.find((u) => u.id === state.selectedId);
    const canEnd = state.phase === "player" && !state.busy && !state.outcome;
    elEndTurn.disabled = !canEnd;
    const showSkip = state.awaitingAttack && sel && sel.kind === "ally";
    elSkipAttack.classList.toggle("hidden", !showSkip);

    if (state.outcome) {
      elStatus.textContent = state.outcome === "win" ? "Victory." : "Defeated.";
    } else if (state.busy) {
      elStatus.textContent = "Resolving…";
    } else if (state.phase === "enemy") {
      elStatus.textContent = "Enemy phase — hold the line.";
    } else if (state.awaitingAttack) {
      const n = state.attackTargets.size;
      elStatus.textContent = n > 0
        ? `Click a highlighted enemy to attack, or Skip.`
        : "No enemies in range. Click Skip to end this unit's turn.";
    } else if (sel) {
      elStatus.textContent = `Click a highlighted tile to move ${sel.name}.`;
    } else {
      elStatus.textContent = "Click a unit to act.";
    }
  }

  function renderRoster() {
    const items = state.units.map((u) => {
      const pct = Math.max(0, u.hp / u.maxHp) * 100;
      const status = u.hp <= 0 ? "fallen" : u.hasActed ? "acted" : "ready";
      return `
        <li class="roster-row roster-${u.kind} roster-${status}">
          <span class="roster-sprite">${spriteSvg(u.sprite, { small: true })}</span>
          <span class="roster-meta">
            <strong>${u.name}</strong>
            <small>⚔ ${u.atk} · 🛡 ${u.def}${u.hp <= 0 ? " · fallen" : u.hasActed ? " · acted" : ""}</small>
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
    renderRoster();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  }

  // --- Interaction ----------------------------------------------------------
  function onTileClick(x, y) {
    if (state.busy || state.outcome || state.phase !== "player") return;
    const clicked = unitAt(x, y);

    // Awaiting attack: clicking an attackable enemy commits the attack;
    // clicking anything else cancels (the unit ends its turn without attacking).
    if (state.awaitingAttack) {
      if (clicked && state.attackTargets.has(clicked.id)) {
        doAttack(state.selectedId, clicked.id);
      } else {
        skipAttack();
      }
      return;
    }

    // Click on a fresh ally → select it.
    if (clicked && clicked.kind === "ally" && !clicked.hasActed) {
      selectUnit(clicked.id);
      return;
    }
    // Click on a reachable empty tile while a unit is selected → move there.
    if (state.selectedId && state.reachable.has(key(x, y))) {
      const dest = unitAt(x, y);
      if (dest) {
        // Selecting another ally just changes selection.
        if (dest.kind === "ally" && !dest.hasActed && dest.id !== state.selectedId) {
          selectUnit(dest.id);
        }
        return;
      }
      doMove(state.selectedId, x, y);
      return;
    }
    // Otherwise: clear selection.
    clearSelection();
  }

  function selectUnit(id) {
    const u = state.units.find((x) => x.id === id);
    if (!u || u.hasActed) return;
    state.selectedId = id;
    state.reachable = reachableFrom(u, u.moveRange);
    state.awaitingAttack = false;
    state.attackTargets = new Set();
    renderAll();
  }

  function clearSelection() {
    state.selectedId = null;
    state.reachable = new Map();
    state.awaitingAttack = false;
    state.attackTargets = new Set();
    renderAll();
  }

  async function doMove(unitId, x, y) {
    const u = state.units.find((x) => x.id === unitId);
    if (!u) return;
    const cost = state.reachable.get(key(x, y)) ?? 0;
    state.busy = true;
    renderHud();
    u.x = x; u.y = y;
    positionUnit(u);
    pushLog(`${u.name} marches to (${x}, ${y}).`, "move");
    await sleep(240);
    state.busy = false;

    // After move: check for adjacent enemies. If any, await attack-or-skip.
    state.attackTargets = adjacentEnemiesOf(u);
    state.reachable = new Map();
    if (state.attackTargets.size > 0) {
      state.awaitingAttack = true;
      renderAll();
      return;
    }
    finalizeAct(u);
  }

  function skipAttack() {
    const u = state.units.find((x) => x.id === state.selectedId);
    if (!u) return;
    pushLog(`${u.name} holds position.`, "");
    finalizeAct(u);
  }

  async function doAttack(attackerId, targetId) {
    const attacker = state.units.find((u) => u.id === attackerId);
    const target = state.units.find((u) => u.id === targetId);
    if (!attacker || !target) return;
    state.busy = true;
    renderHud();
    await resolveAttack(attacker, target);
    finalizeAct(attacker);
  }

  async function resolveAttack(attacker, target) {
    const dmg = Math.max(1, attacker.atk - target.def);
    target.hp = Math.max(0, target.hp - dmg);
    pushLog(`${attacker.name} hits ${target.name} for ${dmg}.`, attacker.kind === "ally" ? "hit-ally" : "hit-enemy");
    animateAttack(attacker, target);
    popDamage(target, dmg);
    await sleep(360);
    if (target.hp <= 0) {
      pushLog(`${target.name} falls!`, "kill");
      const tNode = unitEl(target.id);
      if (tNode) tNode.classList.add("dying");
      await sleep(420);
    }
    renderUnits();
    renderRoster();
    state.busy = false;
  }

  function finalizeAct(u) {
    u.hasActed = true;
    state.selectedId = null;
    state.reachable = new Map();
    state.attackTargets = new Set();
    state.awaitingAttack = false;
    if (checkOutcome()) return;
    renderAll();
    if (livingAllies().every((a) => a.hasActed)) {
      void endPlayerPhase();
    }
  }

  function endTurnNow() {
    if (state.phase !== "player" || state.busy || state.outcome) return;
    for (const a of livingAllies()) a.hasActed = true;
    clearSelection();
    void endPlayerPhase();
  }

  // --- Phase transitions ----------------------------------------------------
  async function endPlayerPhase() {
    if (checkOutcome()) return;
    state.phase = "enemy";
    pushLog(`— Enemy phase begins —`, "phase");
    renderHud();
    await sleep(420);
    await runEnemyPhase();
    if (checkOutcome()) return;
    startPlayerPhase();
  }

  function startPlayerPhase() {
    state.turn += 1;
    for (const u of state.units) u.hasActed = false;
    state.phase = "player";
    pushLog(`— Turn ${state.turn} —`, "phase");
    renderAll();
  }

  async function runEnemyPhase() {
    const cmdr = commander();
    if (!cmdr) return;
    for (const e of livingEnemies()) {
      if (state.outcome) return;
      await enemyTakeTurn(e);
    }
  }

  async function enemyTakeTurn(enemy) {
    const cmdr = commander();
    if (!cmdr || enemy.hp <= 0) return;
    const reach = reachableFrom(enemy, enemy.moveRange);
    // Score each reachable tile by Manhattan distance to the commander.
    // Tie-break by preferring lower cost (closer to the start = safer).
    let best = { x: enemy.x, y: enemy.y, dist: manhattan(enemy, cmdr), cost: 0 };
    for (const [k, cost] of reach) {
      const [x, y] = k.split(",").map(Number);
      const occ = unitAt(x, y);
      if (occ && occ.id !== enemy.id) continue;
      const d = manhattan({ x, y }, cmdr);
      if (d < best.dist || (d === best.dist && cost < best.cost)) {
        best = { x, y, dist: d, cost };
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
    if (manhattan(enemy, cmdr) === 1 && cmdr.hp > 0) {
      state.busy = true;
      renderHud();
      await resolveAttack(enemy, cmdr);
    }
    enemy.hasActed = true;
  }

  // --- Outcome --------------------------------------------------------------
  function checkOutcome() {
    if (state.outcome) return true;
    const cmdr = commander();
    const enemies = livingEnemies();
    if (!cmdr || cmdr.hp <= 0) {
      state.outcome = "loss";
      state.phase = "done";
      onLoss();
      return true;
    }
    if (enemies.length === 0) {
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
      <p>The field is yours, commander.</p>
      <p class="outcome-reward">+${REWARD.xp} XP · +${REWARD.gold} gold</p>
      ${lvlText}
      <p class="muted">Rewards added to your idle save.</p>
    `;
    elOutcomeAgain.disabled = false;
    showOutcomeModal();
    renderAll();
  }

  function onLoss() {
    pushLog(`Your commander has fallen. Defeat.`, "death");
    elOutcomeTitle.textContent = "Defeated";
    elOutcomeTitle.className = "outcome-title loss";
    elOutcomeBody.innerHTML = `
      <p>Your commander has fallen.</p>
      <p class="muted">No rewards earned. Regroup and try again.</p>
    `;
    elOutcomeAgain.disabled = false;
    showOutcomeModal();
    renderAll();
  }

  function showOutcomeModal() {
    elOutcomeBackdrop.classList.remove("hidden");
    elOutcomeModal.classList.remove("hidden");
  }
  function hideOutcomeModal() {
    elOutcomeBackdrop.classList.add("hidden");
    elOutcomeModal.classList.add("hidden");
  }

  function applyReward(xp, gold) {
    // Read the idle save, add xp/gold, cascade level-ups, write back.
    let save;
    try {
      const raw = localStorage.getItem(IDLE_SAVE_KEY);
      save = raw ? JSON.parse(raw) : null;
    } catch { save = null; }
    if (!save) {
      // No idle save yet (player started in tactics). Nothing to credit.
      return { startLevel: 0, endLevel: 0, levelsGained: 0 };
    }
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

  // --- Combat animations ----------------------------------------------------
  function animateAttack(attacker, target) {
    const node = unitEl(attacker.id);
    if (!node) return;
    const dx = Math.sign(target.x - attacker.x) * 10;
    const dy = Math.sign(target.y - attacker.y) * 10;
    node.style.setProperty("--attack-dx", `${dx}px`);
    node.style.setProperty("--attack-dy", `${dy}px`);
    node.classList.remove("attacking");
    void node.offsetWidth;
    node.classList.add("attacking");
    setTimeout(() => node.classList.remove("attacking"), 360);
    const tNode = unitEl(target.id);
    if (tNode) {
      tNode.classList.remove("hit");
      void tNode.offsetWidth;
      tNode.classList.add("hit");
      setTimeout(() => tNode.classList.remove("hit"), 320);
    }
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

  // --- Sprites --------------------------------------------------------------
  function spriteSvg(kind, opts) {
    const small = opts?.small;
    if (kind === "commander") return commanderSvg(small);
    if (kind === "goblin")    return goblinSvg(small);
    return "";
  }

  function commanderSvg() {
    const body = "#7a8090", skin = "#f4c592", leg = "#2c2240", blade = "#c0c4cc";
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

  // --- Lifecycle ------------------------------------------------------------
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
    pushLog("— Turn 1 —", "phase");
    pushLog("The skirmish begins. Click your commander.", "phase");
    renderAll();
    hideOutcomeModal();
  }

  window.addEventListener("resize", reposAllUnits);
  elEndTurn.addEventListener("click", endTurnNow);
  elSkipAttack.addEventListener("click", skipAttack);
  elOutcomeAgain.addEventListener("click", startNewBattle);

  buildBoard();
  pushLog("— Turn 1 —", "phase");
  pushLog("The skirmish begins. Click your commander.", "phase");
  renderAll();
  fetchVersion().then((v) => { elVersion.textContent = `v${v}`; });
})();
