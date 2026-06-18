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
  const COMMANDER = {
    name: "Commander", maxHp: 50, atk: 8, def: 2, moveRange: 4, attackRange: 1, sprite: "commander",
  };
  const UNIT_CLASSES = {
    warrior: { name: "Warrior", maxHp: 30, atk: 6, def: 2, moveRange: 3, attackRange: 1, sprite: "warrior" },
    archer:  { name: "Archer",  maxHp: 18, atk: 5, def: 0, moveRange: 3, attackRange: 2, sprite: "archer"  },
    mage:    { name: "Mage",    maxHp: 16, atk: 8, def: 0, moveRange: 2, attackRange: 2, sprite: "mage"    },
  };
  const CLASS_ORDER = ["warrior", "archer", "mage"];
  const ENEMY_TYPES = {
    goblin:       { name: "Goblin",        maxHp: 20, atk: 4, def: 1, moveRange: 3, attackRange: 1, sprite: "goblin" },
    goblinArcher: { name: "Goblin Archer", maxHp: 14, atk: 5, def: 0, moveRange: 3, attackRange: 2, sprite: "goblinArcher" },
  };
  const COMMANDER_START = { x: 1, y: 7 };
  const ENEMY_STARTS = [
    { type: "goblin",       x: 7, y: 0 },
    { type: "goblin",       x: 8, y: 2 },
    { type: "goblinArcher", x: 6, y: 4 },
  ];
  // Deploy zone: bottom two rows of the map.
  const SPAWN_ROWS = new Set([6, 7]);
  const DEPLOY_BUDGET = 3;

  // === Rewards / persistence ================================================
  const REWARD = { xp: 50, gold: 30 };
  const IDLE_SAVE_KEY = "dailydefense.idle.v1";
  // Mirrors xpForLevel() in game.js so tactics level-ups use the idle curve.
  const xpForLevel = (level) => Math.floor(40 * Math.pow(level, 1.65));

  // === State ================================================================
  let nextUnitId = 1;
  function makeUnit(tmpl, kind, x, y) {
    return {
      id: `u${nextUnitId++}`,
      kind, // "ally" | "enemy"
      name: tmpl.name,
      sprite: tmpl.sprite,
      x, y,
      hp: tmpl.maxHp,
      maxHp: tmpl.maxHp,
      atk: tmpl.atk,
      def: tmpl.def,
      moveRange: tmpl.moveRange,
      attackRange: tmpl.attackRange,
      hasActed: false,
      isCommander: tmpl.sprite === "commander",
    };
  }

  function freshBattle() {
    nextUnitId = 1;
    return {
      units: [
        makeUnit(COMMANDER, "ally", COMMANDER_START.x, COMMANDER_START.y),
        ...ENEMY_STARTS.map((p) => makeUnit(ENEMY_TYPES[p.type], "enemy", p.x, p.y)),
      ],
      phase: "deploy", // "deploy" | "player" | "enemy" | "done"
      turn: 1,
      selectedId: null,
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
  const elEndTurn = $("battle-end-turn");
  const elSkipAttack = $("battle-skip-attack");
  const elRoster = $("unit-roster");
  const elDeployPanel = $("deploy-panel");
  const elBattlePanel = $("battle-panel");
  const elRosterPanel = $("roster-panel");
  const elDeployRemaining = $("deploy-remaining");
  const elDeployClasses = $("deploy-classes");
  const elDeployStart = $("deploy-start");
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
  const commander = () => state.units.find((u) => u.isCommander);
  const livingEnemies = () => state.units.filter((u) => u.kind === "enemy" && u.hp > 0);
  const livingAllies  = () => state.units.filter((u) => u.kind === "ally"  && u.hp > 0);
  const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  function pushLog(text, kind) {
    log.unshift({ text, kind: kind || "" });
    if (log.length > MAX_LOG) log.length = MAX_LOG;
    renderLog();
  }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

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
        const occ = unitAt(nx, ny);
        if (occ && occ.id !== unit.id) continue;
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
    return state.units.filter((u) => u.kind === "ally" && !u.isCommander).length;
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
    if (u.isCommander) return; // cannot remove the commander
    state.units.splice(idx, 1);
    pushLog(`${u.name} stood down.`, "");
    renderAll();
  }
  function beginBattle() {
    if (state.phase !== "deploy") return;
    state.phase = "player";
    state.selectedClass = null;
    pushLog(`— Turn 1 —`, "phase");
    pushLog(`The skirmish begins.`, "phase");
    renderAll();
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
      node.classList.toggle("acted", u.hasActed && u.hp > 0 && state.phase !== "deploy");
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

  function clearTileHighlights() {
    for (const t of elBoard.querySelectorAll(".tile.reachable, .tile.selected, .tile.attack-target, .tile.spawnable")) {
      t.classList.remove("reachable", "selected", "attack-target", "spawnable");
    }
    for (const n of elBoard.querySelectorAll(".unit.selected, .unit.attackable, .unit.removable")) {
      n.classList.remove("selected", "attackable", "removable");
    }
  }

  function renderSelection() {
    clearTileHighlights();
    if (state.phase === "deploy") {
      // Highlight spawn tiles when ready to place.
      if (state.selectedClass && remainingDeploy() > 0) {
        for (const y of SPAWN_ROWS) {
          for (let x = 0; x < COLS; x++) {
            if (isSpawnTile(x, y)) tileAt(x, y)?.classList.add("spawnable");
          }
        }
      }
      // Mark removable allies (non-commander) so the player knows they can click.
      for (const u of state.units) {
        if (u.kind === "ally" && !u.isCommander) unitEl(u.id)?.classList.add("removable");
      }
      return;
    }
    const sel = state.units.find((u) => u.id === state.selectedId);
    if (!sel) return;
    tileAt(sel.x, sel.y)?.classList.add("selected");
    unitEl(sel.id)?.classList.add("selected");
    if (!state.awaitingAttack) {
      for (const k of state.reachable.keys()) {
        if (k === key(sel.x, sel.y)) continue;
        const [x, y] = k.split(",").map(Number);
        if (unitAt(x, y)) continue;
        tileAt(x, y)?.classList.add("reachable");
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
    elTurn.textContent = state.phase === "deploy" ? "Deploy" : `Turn ${state.turn}`;
    elPhase.textContent =
      state.phase === "deploy" ? "Muster your army" :
      state.phase === "player" ? "Player phase" :
      state.phase === "enemy"  ? "Enemy phase"  :
      "Battle over";
    elPhase.dataset.phase = state.phase;

    elDeployPanel.classList.toggle("hidden", state.phase !== "deploy");
    elBattlePanel.classList.toggle("hidden", state.phase === "deploy");
    elRosterPanel.classList.toggle("hidden", state.phase === "deploy");

    const sel = state.units.find((u) => u.id === state.selectedId);
    const canEnd = state.phase === "player" && !state.busy && !state.outcome;
    elEndTurn.disabled = !canEnd;
    const showSkip = state.awaitingAttack && sel && sel.kind === "ally";
    elSkipAttack.classList.toggle("hidden", !showSkip);

    elDeployRemaining.textContent = String(remainingDeploy());
    elDeployStart.disabled = state.phase !== "deploy";

    if (state.phase === "deploy") {
      if (state.selectedClass) {
        elStatus.textContent = remainingDeploy() > 0
          ? `Click a cyan spawn tile to place ${UNIT_CLASSES[state.selectedClass].name}, or click a placed ally to remove it.`
          : "Roster full — click Begin Battle.";
      } else if (remainingDeploy() === DEPLOY_BUDGET) {
        elStatus.textContent = "Pick a class to deploy, or hit Begin Battle to fight solo.";
      } else {
        elStatus.textContent = "Pick another class to deploy, or hit Begin Battle when ready.";
      }
    } else if (state.outcome) {
      elStatus.textContent = state.outcome === "win" ? "Victory." : "Defeated.";
    } else if (state.busy) {
      elStatus.textContent = "Resolving…";
    } else if (state.phase === "enemy") {
      elStatus.textContent = "Enemy phase — hold the line.";
    } else if (state.awaitingAttack) {
      const n = state.attackTargets.size;
      elStatus.textContent = n > 0
        ? "Click a highlighted enemy to attack, or Skip."
        : "No enemies in range. Click Skip to end this unit's turn.";
    } else if (sel) {
      elStatus.textContent = `Click a highlighted tile to move ${sel.name}.`;
    } else {
      elStatus.textContent = "Click one of your units to act.";
    }
  }

  function renderDeployPanel() {
    if (state.phase !== "deploy") return;
    elDeployClasses.innerHTML = CLASS_ORDER.map((id) => {
      const c = UNIT_CLASSES[id];
      const isSelected = state.selectedClass === id;
      const disabled = remainingDeploy() <= 0 && !isSelected;
      return `
        <button type="button" class="deploy-class ${isSelected ? "selected" : ""}"
                data-class="${id}" ${disabled ? "disabled" : ""}>
          <span class="deploy-class-sprite">${spriteSvg(c.sprite, { small: true })}</span>
          <span class="deploy-class-meta">
            <strong>${c.name}</strong>
            <small>HP ${c.maxHp} · ⚔ ${c.atk} · 🛡 ${c.def}</small>
            <small>Move ${c.moveRange} · Range ${c.attackRange}</small>
          </span>
        </button>`;
    }).join("");
    for (const btn of elDeployClasses.querySelectorAll("button[data-class]")) {
      btn.addEventListener("click", () => selectDeployClass(btn.dataset.class));
    }
  }

  function renderRoster() {
    const items = state.units.map((u) => {
      const pct = Math.max(0, u.hp / u.maxHp) * 100;
      const status = u.hp <= 0 ? "fallen" : u.hasActed ? "acted" : "ready";
      const tag = u.isCommander ? " · cmdr" : "";
      return `
        <li class="roster-row roster-${u.kind} roster-${status}">
          <span class="roster-sprite">${spriteSvg(u.sprite, { small: true })}</span>
          <span class="roster-meta">
            <strong>${u.name}</strong>
            <small>⚔ ${u.atk} · 🛡 ${u.def} · Rng ${u.attackRange}${tag}</small>
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
      // Click a placed ally → remove it.
      if (clicked && clicked.kind === "ally" && !clicked.isCommander) {
        removeAlly(clicked.id);
        return;
      }
      // Click a spawn tile with a class selected → place.
      if (state.selectedClass && isSpawnTile(x, y)) {
        placeAlly(state.selectedClass, x, y);
        return;
      }
      return;
    }

    if (state.phase !== "player") return;

    // Awaiting attack: clicking a target commits attack; else cancel.
    if (state.awaitingAttack) {
      if (clicked && state.attackTargets.has(clicked.id)) {
        doAttack(state.selectedId, clicked.id);
      } else {
        skipAttack();
      }
      return;
    }
    // Fresh ally → select.
    if (clicked && clicked.kind === "ally" && !clicked.hasActed) {
      selectUnit(clicked.id);
      return;
    }
    // Reachable empty tile while selected → move.
    if (state.selectedId && state.reachable.has(key(x, y))) {
      const dest = unitAt(x, y);
      if (dest) {
        if (dest.kind === "ally" && !dest.hasActed && dest.id !== state.selectedId) {
          selectUnit(dest.id);
        }
        return;
      }
      doMove(state.selectedId, x, y);
      return;
    }
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
    state.busy = true;
    renderHud();
    u.x = x; u.y = y;
    positionUnit(u);
    pushLog(`${u.name} marches to (${x}, ${y}).`, "move");
    await sleep(240);
    state.busy = false;

    state.attackTargets = enemiesInRange(u);
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
      unitEl(target.id)?.classList.add("dying");
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

  // === Phase transitions ====================================================
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
    for (const e of livingEnemies()) {
      if (state.outcome) return;
      await enemyTakeTurn(e);
    }
  }

  function pickEnemyTarget(enemy) {
    // Prefer the closest living ally. Tie-break: commander > others (commander
    // is high-value, so finishing him is the win condition).
    const allies = livingAllies();
    if (allies.length === 0) return null;
    allies.sort((a, b) => {
      const da = manhattan(enemy, a), db = manhattan(enemy, b);
      if (da !== db) return da - db;
      if (a.isCommander && !b.isCommander) return -1;
      if (!a.isCommander && b.isCommander) return 1;
      return 0;
    });
    return allies[0];
  }

  async function enemyTakeTurn(enemy) {
    if (enemy.hp <= 0) return;
    const target = pickEnemyTarget(enemy);
    if (!target) return;
    const reach = reachableFrom(enemy, enemy.moveRange);
    // Score each reachable tile by "how far from being able to attack the
    // target". 0 means we can attack from there; higher means we need to
    // close more distance. Ties: prefer shorter movement.
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
    }
    enemy.hasActed = true;
  }

  // === Outcome ==============================================================
  function checkOutcome() {
    if (state.outcome) return true;
    const cmdr = commander();
    if (!cmdr || cmdr.hp <= 0) {
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

  // === Sprites ==============================================================
  function spriteSvg(kind, _opts) {
    switch (kind) {
      case "commander":    return commanderSvg();
      case "warrior":      return warriorSvg();
      case "archer":       return archerSvg();
      case "mage":         return mageSvg();
      case "goblin":       return goblinSvg();
      case "goblinArcher": return goblinArcherSvg();
      default:             return "";
    }
  }

  function commanderSvg() {
    return `
<svg viewBox="0 0 90 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="45" cy="115" rx="22" ry="3" fill="#000" opacity="0.35"/>
  <rect x="33" y="88" width="9" height="22" rx="3" fill="#2c2240"/>
  <rect x="48" y="88" width="9" height="22" rx="3" fill="#2c2240"/>
  <rect x="28" y="48" width="34" height="44" rx="6" fill="#7a8090" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"/>
  <rect x="28" y="78" width="34" height="5" fill="rgba(0,0,0,0.35)"/>
  <rect x="23" y="52" width="8" height="26" rx="3" fill="#7a8090" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>
  <circle cx="45" cy="32" r="13" fill="#f4c592" stroke="rgba(0,0,0,0.25)" stroke-width="1"/>
  <!-- gold circlet so the commander reads as the leader -->
  <path d="M32 28 Q45 18 58 28" stroke="#ffd86b" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <circle cx="50" cy="32" r="1.7" fill="#222"/>
  <g>
    <rect x="60" y="50" width="8" height="26" rx="3" fill="#7a8090" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>
    <rect x="63" y="20" width="3" height="44" fill="#c0c4cc" stroke="rgba(0,0,0,0.4)" stroke-width="0.8"/>
    <rect x="58" y="62" width="13" height="3" fill="#5a3a1a"/>
    <rect x="62" y="64" width="5" height="7" fill="#3a2c00"/>
  </g>
</svg>`;
  }

  function warriorSvg() {
    return `
<svg viewBox="0 0 90 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="45" cy="115" rx="22" ry="3" fill="#000" opacity="0.35"/>
  <rect x="33" y="88" width="9" height="22" rx="3" fill="#2c2240"/>
  <rect x="48" y="88" width="9" height="22" rx="3" fill="#2c2240"/>
  <rect x="28" y="48" width="34" height="44" rx="6" fill="#8a3a2a" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"/>
  <rect x="28" y="78" width="34" height="5" fill="rgba(0,0,0,0.35)"/>
  <!-- shield arm -->
  <rect x="20" y="54" width="11" height="22" rx="3" fill="#3a7aa0" stroke="rgba(0,0,0,0.4)" stroke-width="1"/>
  <circle cx="25.5" cy="64" r="2" fill="#ffd86b"/>
  <circle cx="45" cy="32" r="13" fill="#f4c592" stroke="rgba(0,0,0,0.25)" stroke-width="1"/>
  <circle cx="50" cy="32" r="1.7" fill="#222"/>
  <!-- axe arm -->
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
  <!-- hood -->
  <path d="M32 28 Q45 14 58 28 L58 38 L32 38 Z" fill="#2e4a18"/>
  <circle cx="45" cy="34" r="9" fill="#f4c592" stroke="rgba(0,0,0,0.25)" stroke-width="1"/>
  <circle cx="50" cy="34" r="1.5" fill="#222"/>
  <!-- bow + drawn arrow -->
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
  <!-- robe -->
  <path d="M20 110 L28 50 L62 50 L70 110 Z" fill="#3a4aaa" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"/>
  <rect x="28" y="78" width="34" height="5" fill="rgba(0,0,0,0.4)"/>
  <!-- pointed hood -->
  <path d="M30 38 Q45 6 60 38 L58 42 L32 42 Z" fill="#2a3478" stroke="rgba(0,0,0,0.4)" stroke-width="1"/>
  <circle cx="45" cy="40" r="6.5" fill="#f4c592"/>
  <circle cx="48" cy="40" r="1.4" fill="#222"/>
  <!-- staff -->
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
  <!-- bow -->
  <path d="M16 30 Q4 56 16 82" stroke="#5a3a1a" stroke-width="3" fill="none"/>
  <line x1="16" y1="30" x2="16" y2="82" stroke="#dadada" stroke-width="1"/>
  <!-- arrow nocked -->
  <rect x="14" y="55" width="20" height="2" fill="#dadada"/>
  <path d="M34 56 L30 52 L30 60 Z" fill="#c0c4cc"/>
</svg>`;
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
  elEndTurn.addEventListener("click", endTurnNow);
  elSkipAttack.addEventListener("click", skipAttack);
  elOutcomeAgain.addEventListener("click", startNewBattle);
  elDeployStart.addEventListener("click", beginBattle);

  buildBoard();
  pushLog("Muster your army. Pick classes and place them on the cyan spawn tiles.", "phase");
  renderAll();
  fetchVersion().then((v) => { elVersion.textContent = `v${v}`; });
})();
