(() => {
  "use strict";

  // --- Config ---------------------------------------------------------------
  const TICK_MS = 100;                  // game loop step
  const PLAYER_ATTACK_MS = 1500;
  const ENEMY_RESPAWN_MS = 1500;
  const PLAYER_REST_MS = 4000;
  const SAVE_INTERVAL_MS = 5000;
  const SAVE_KEY = "dailydefense.idle.v1";
  const MAX_LOG = 24;

  const ZONES = [
    { id: "meadow",   name: "Forest Meadow",   levelReq: 1,
      enemy: { name: "Slime",   hp: 20,  atk: 2,  def: 0, attackMs: 2200, xp: 10, gold: 3 } },
    { id: "caves",    name: "Goblin Caves",    levelReq: 3,
      enemy: { name: "Goblin",  hp: 60,  atk: 5,  def: 1, attackMs: 2000, xp: 25, gold: 8 } },
    { id: "mountain", name: "Orc Mountain",    levelReq: 6,
      enemy: { name: "Orc",     hp: 150, atk: 12, def: 3, attackMs: 1800, xp: 60, gold: 20 } },
    { id: "volcano",  name: "Dragon Volcano",  levelReq: 10,
      enemy: { name: "Dragon",  hp: 500, atk: 30, def: 8, attackMs: 1500, xp: 200, gold: 75 } },
  ];

  const UPGRADES = [
    { id: "atk",   name: "Attack",  desc: "+1 ATK",     stat: "atk",    delta: 1,
      cost: (lvl) => Math.floor(10 * Math.pow(1.18, lvl)) },
    { id: "def",   name: "Defense", desc: "+1 DEF",     stat: "def",    delta: 1,
      cost: (lvl) => Math.floor(14 * Math.pow(1.22, lvl)) },
    { id: "maxHp", name: "Health",  desc: "+10 max HP", stat: "maxHp",  delta: 10,
      cost: (lvl) => Math.floor(8 * Math.pow(1.16, lvl)) },
  ];

  // XP needed to reach (level + 1) from level.
  function xpForLevel(level) {
    return Math.floor(40 * Math.pow(level, 1.65));
  }

  // --- State ----------------------------------------------------------------
  const initialState = () => ({
    level: 1,
    xp: 0,
    maxHp: 50,
    hp: 50,
    atk: 5,
    def: 1,
    gold: 0,
    upgrades: { atk: 0, def: 0, maxHp: 0 },
    zoneId: "meadow",
    // Combat timers (ms)
    playerAttackTimer: 0,
    enemyAttackTimer: 0,
    enemyHp: ZONES[0].enemy.hp,
    enemyRespawnTimer: 0,
    playerRestTimer: 0,
    enemiesDefeated: 0,
    savedAt: 0,
  });

  let state = loadState() || initialState();
  let log = [];
  let lastTickAt = Date.now();

  // --- DOM ------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const elLevel    = $("stat-level");
  const elGold     = $("stat-gold");
  const elVersion  = $("app-version");

  const elPlayerStats   = $("player-stats");
  const elPlayerHpFill  = $("player-hp-fill");
  const elPlayerHpLabel = $("player-hp-label");
  const elPlayerXpFill  = $("player-xp-fill");
  const elPlayerXpLabel = $("player-xp-label");
  const elPlayerRest    = $("player-rest");

  const elEnemyName    = $("enemy-name");
  const elEnemyStats   = $("enemy-stats");
  const elEnemyHpFill  = $("enemy-hp-fill");
  const elEnemyHpLabel = $("enemy-hp-label");
  const elEnemyReward  = $("enemy-reward");
  const elEnemyRest    = $("enemy-rest");

  const elZoneList    = $("zone-list");
  const elUpgradeList = $("upgrade-list");
  const elCombatLog   = $("combat-log");
  const elResetSave   = $("reset-save");

  // --- Save / load ----------------------------------------------------------
  function saveState() {
    state.savedAt = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch {}
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Sanity: pull through initial defaults for any missing fields.
      const merged = { ...initialState(), ...parsed };
      merged.upgrades = { ...initialState().upgrades, ...(parsed.upgrades || {}) };
      return merged;
    } catch {
      return null;
    }
  }
  function resetSave() {
    if (!confirm("Reset your save? You'll lose all progress.")) return;
    localStorage.removeItem(SAVE_KEY);
    state = initialState();
    log = [];
    pushLog("Save reset. Starting fresh.", "zone");
    renderAll();
  }

  // --- Helpers --------------------------------------------------------------
  function currentZone() {
    return ZONES.find(z => z.id === state.zoneId) || ZONES[0];
  }
  function zoneUnlocked(zone) { return state.level >= zone.levelReq; }
  function fmtNum(n) { return Math.floor(n).toLocaleString(); }

  function pushLog(text, kind) {
    log.unshift({ text, kind: kind || "" });
    if (log.length > MAX_LOG) log.length = MAX_LOG;
    renderLog();
  }

  // --- Combat ---------------------------------------------------------------
  function tick(dtMs) {
    // Player resting?
    if (state.playerRestTimer > 0) {
      state.playerRestTimer -= dtMs;
      if (state.playerRestTimer <= 0) {
        state.playerRestTimer = 0;
        state.hp = state.maxHp;
        pushLog("You're rested and back in the fight.", "");
      }
      return;
    }

    // Enemy respawning?
    if (state.enemyRespawnTimer > 0) {
      state.enemyRespawnTimer -= dtMs;
      if (state.enemyRespawnTimer <= 0) {
        spawnEnemy();
      }
      return;
    }

    const zone = currentZone();
    const enemy = zone.enemy;

    // Player swings.
    state.playerAttackTimer += dtMs;
    while (state.playerAttackTimer >= PLAYER_ATTACK_MS) {
      state.playerAttackTimer -= PLAYER_ATTACK_MS;
      const dmg = Math.max(1, state.atk - enemy.def);
      state.enemyHp -= dmg;
      pushLog(`You hit ${enemy.name} for ${dmg}.`, "");
      if (state.enemyHp <= 0) {
        onEnemyKilled();
        return;
      }
    }

    // Enemy swings.
    state.enemyAttackTimer += dtMs;
    while (state.enemyAttackTimer >= enemy.attackMs) {
      state.enemyAttackTimer -= enemy.attackMs;
      const dmg = Math.max(1, enemy.atk - state.def);
      state.hp -= dmg;
      pushLog(`${enemy.name} hits you for ${dmg}.`, "");
      if (state.hp <= 0) {
        onPlayerDied();
        return;
      }
    }
  }

  function spawnEnemy() {
    const enemy = currentZone().enemy;
    state.enemyHp = enemy.hp;
    state.enemyAttackTimer = 0;
    state.enemyRespawnTimer = 0;
  }

  function onEnemyKilled() {
    const zone = currentZone();
    const enemy = zone.enemy;
    state.gold += enemy.gold;
    gainXp(enemy.xp);
    state.enemiesDefeated += 1;
    pushLog(`Defeated ${enemy.name}! +${enemy.xp} XP, +${enemy.gold} gold.`, "kill");
    state.enemyHp = 0;
    state.enemyRespawnTimer = ENEMY_RESPAWN_MS;
    state.enemyAttackTimer = 0;
  }

  function onPlayerDied() {
    state.hp = 0;
    state.playerRestTimer = PLAYER_REST_MS;
    // Reset the enemy too so it has full HP when you're back.
    state.enemyHp = currentZone().enemy.hp;
    state.enemyAttackTimer = 0;
    pushLog(`You died. Resting for ${Math.round(PLAYER_REST_MS / 1000)}s.`, "death");
  }

  function gainXp(amount) {
    state.xp += amount;
    while (state.xp >= xpForLevel(state.level)) {
      state.xp -= xpForLevel(state.level);
      state.level += 1;
      state.maxHp += 5;
      state.atk += 1;
      state.hp = state.maxHp;
      pushLog(`Level up! Now level ${state.level} (+1 ATK, +5 HP).`, "levelup");
    }
  }

  // --- Actions --------------------------------------------------------------
  function selectZone(zoneId) {
    const zone = ZONES.find(z => z.id === zoneId);
    if (!zone || !zoneUnlocked(zone)) return;
    if (state.zoneId === zoneId) return;
    state.zoneId = zoneId;
    state.enemyHp = zone.enemy.hp;
    state.enemyAttackTimer = 0;
    state.enemyRespawnTimer = 0;
    state.playerAttackTimer = 0;
    pushLog(`Travelled to ${zone.name}.`, "zone");
    renderAll();
  }

  function buyUpgrade(upgradeId) {
    const upgrade = UPGRADES.find(u => u.id === upgradeId);
    if (!upgrade) return;
    const owned = state.upgrades[upgradeId] || 0;
    const cost = upgrade.cost(owned);
    if (state.gold < cost) return;
    state.gold -= cost;
    state.upgrades[upgradeId] = owned + 1;
    state[upgrade.stat] += upgrade.delta;
    if (upgrade.stat === "maxHp") state.hp = Math.min(state.hp + upgrade.delta, state.maxHp);
    pushLog(`Upgraded ${upgrade.name}: ${upgrade.desc}.`, "levelup");
    renderAll();
  }

  // --- Render ---------------------------------------------------------------
  function renderAll() {
    renderHud();
    renderCombat();
    renderZones();
    renderUpgrades();
    renderLog();
  }

  function renderHud() {
    elLevel.textContent = state.level;
    elGold.textContent = fmtNum(state.gold);
  }

  function renderCombat() {
    elPlayerStats.textContent = `⚔ ${state.atk} · 🛡 ${state.def}`;
    const hpPct = Math.max(0, state.hp / state.maxHp);
    elPlayerHpFill.style.width = `${hpPct * 100}%`;
    elPlayerHpLabel.textContent = `${Math.max(0, Math.ceil(state.hp))} / ${state.maxHp}`;

    const xpNeeded = xpForLevel(state.level);
    elPlayerXpFill.style.width = `${Math.min(100, (state.xp / xpNeeded) * 100)}%`;
    elPlayerXpLabel.textContent = `${fmtNum(state.xp)} / ${fmtNum(xpNeeded)} XP`;

    elPlayerRest.classList.toggle("hidden", state.playerRestTimer <= 0);
    if (state.playerRestTimer > 0) {
      elPlayerRest.textContent = `Resting · ${Math.ceil(state.playerRestTimer / 1000)}s`;
    }

    const zone = currentZone();
    const enemy = zone.enemy;
    elEnemyName.textContent = enemy.name;
    elEnemyStats.textContent = `⚔ ${enemy.atk} · 🛡 ${enemy.def}`;
    const ehpPct = Math.max(0, state.enemyHp / enemy.hp);
    elEnemyHpFill.style.width = `${ehpPct * 100}%`;
    elEnemyHpLabel.textContent = `${Math.max(0, Math.ceil(state.enemyHp))} / ${enemy.hp}`;
    elEnemyReward.textContent = `+${enemy.xp} XP · +${enemy.gold} gold`;
    elEnemyRest.classList.toggle("hidden", state.enemyRespawnTimer <= 0);
    if (state.enemyRespawnTimer > 0) {
      elEnemyRest.textContent = `Respawning · ${Math.ceil(state.enemyRespawnTimer / 1000)}s`;
    }
  }

  function renderZones() {
    elZoneList.innerHTML = "";
    for (const zone of ZONES) {
      const unlocked = zoneUnlocked(zone);
      const active = state.zoneId === zone.id;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "zone-btn" + (active ? " active" : "");
      btn.disabled = !unlocked;
      btn.innerHTML = `
        <span class="zone-name">
          <strong>${zone.name}</strong>
          <small>${zone.enemy.name} · ${zone.enemy.hp} HP · ⚔ ${zone.enemy.atk}</small>
        </span>
        <span class="cost">${unlocked ? `+${zone.enemy.xp} XP` : `Lv ${zone.levelReq} 🔒`}</span>
      `;
      btn.addEventListener("click", () => selectZone(zone.id));
      elZoneList.appendChild(btn);
    }
  }

  function renderUpgrades() {
    elUpgradeList.innerHTML = "";
    for (const upgrade of UPGRADES) {
      const owned = state.upgrades[upgrade.id] || 0;
      const cost = upgrade.cost(owned);
      const affordable = state.gold >= cost;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "upgrade-btn" + (affordable ? " affordable" : "");
      btn.disabled = !affordable;
      btn.innerHTML = `
        <span class="upgrade-name">
          <strong>${upgrade.name}</strong>
          <small>${upgrade.desc} · owned ${owned}</small>
        </span>
        <span class="cost">${fmtNum(cost)} g</span>
      `;
      btn.addEventListener("click", () => buyUpgrade(upgrade.id));
      elUpgradeList.appendChild(btn);
    }
  }

  function renderLog() {
    elCombatLog.innerHTML = log
      .map(e => `<li class="${e.kind}">${escapeHtml(e.text)}</li>`)
      .join("");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  }

  // --- Lifecycle ------------------------------------------------------------
  async function fetchVersion() {
    try {
      const r = await fetch("/health");
      const data = await r.json();
      return data.version || "?";
    } catch { return "?"; }
  }

  function loop() {
    const now = Date.now();
    let dt = now - lastTickAt;
    lastTickAt = now;
    // Cap a single loop iteration to 5 seconds to avoid runaway sims if the
    // tab was throttled or backgrounded for a long time.
    if (dt > 5000) dt = 5000;
    tick(dt);
    renderCombat();
    renderHud();
    if (now - state.savedAt >= SAVE_INTERVAL_MS) saveState();
    setTimeout(loop, TICK_MS);
  }

  elResetSave.addEventListener("click", resetSave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveState();
  });
  window.addEventListener("pagehide", saveState);

  fetchVersion().then(v => { elVersion.textContent = `v${v}`; });

  // If the saved enemy state is stale (e.g. zone changed) make sure the
  // enemy HP makes sense for the current zone.
  if (state.enemyHp <= 0 || state.enemyHp > currentZone().enemy.hp) {
    spawnEnemy();
  }
  renderAll();
  pushLog("Welcome back, adventurer!", "zone");
  lastTickAt = Date.now();
  setTimeout(loop, TICK_MS);
})();
