(() => {
  "use strict";

  // --- Config ---------------------------------------------------------------
  const TICK_MS = 100;
  const PLAYER_ATTACK_MS = 1500;
  const ENEMY_RESPAWN_MS = 1500;
  const PLAYER_REST_MS = 4000;
  const SAVE_INTERVAL_MS = 5000;
  const SAVE_KEY = "dailydefense.idle.v1";
  const MAX_LOG = 24;

  const ZONES = [
    { id: "meadow",   name: "Forest Meadow",   levelReq: 1,
      enemy: { name: "Slime",   sprite: "slime",  hp: 20,  atk: 2,  def: 0, attackMs: 2200, xp: 10,  gold: 3 } },
    { id: "caves",    name: "Goblin Caves",    levelReq: 3,
      enemy: { name: "Goblin",  sprite: "goblin", hp: 60,  atk: 5,  def: 1, attackMs: 2000, xp: 25,  gold: 8 } },
    { id: "mountain", name: "Orc Mountain",    levelReq: 6,
      enemy: { name: "Orc",     sprite: "orc",    hp: 150, atk: 12, def: 3, attackMs: 1800, xp: 60,  gold: 20 } },
    { id: "volcano",  name: "Dragon Volcano",  levelReq: 10,
      enemy: { name: "Dragon",  sprite: "dragon", hp: 500, atk: 30, def: 8, attackMs: 1500, xp: 200, gold: 75 } },
  ];

  const UPGRADES = [
    { id: "atk",   name: "Attack",  desc: "+1 ATK",     stat: "atk",    delta: 1,
      cost: (lvl) => Math.floor(10 * Math.pow(1.18, lvl)) },
    { id: "def",   name: "Defense", desc: "+1 DEF",     stat: "def",    delta: 1,
      cost: (lvl) => Math.floor(14 * Math.pow(1.22, lvl)) },
    { id: "maxHp", name: "Health",  desc: "+10 max HP", stat: "maxHp",  delta: 10,
      cost: (lvl) => Math.floor(8 * Math.pow(1.16, lvl)) },
  ];

  // Equipment catalog. Tier 0 of each slot is the starter (cost 0, no bonus).
  // `shape` controls how the weapon is drawn next to the character.
  const WEAPONS = [
    { id: "wooden-club",   name: "Wooden Club",   atk: 0,  cost: 0,     color: "#8a6a3a", shape: "club" },
    { id: "iron-sword",    name: "Iron Sword",    atk: 3,  cost: 50,    color: "#c0c4cc", shape: "sword" },
    { id: "steel-sword",   name: "Steel Sword",   atk: 8,  cost: 250,   color: "#e2e6ee", shape: "sword" },
    { id: "flaming-blade", name: "Flaming Blade", atk: 20, cost: 1500,  color: "#ff7a3a", shape: "flame-sword" },
    { id: "dragonslayer",  name: "Dragonslayer",  atk: 50, cost: 8000,  color: "#ffd86b", shape: "greatsword" },
  ];

  const ARMORS = [
    { id: "tunic",       name: "Cloth Tunic",   def: 0,  cost: 0,     color: "#7a6440" },
    { id: "leather",     name: "Leather Armor", def: 2,  cost: 60,    color: "#6a3e1a" },
    { id: "chainmail",   name: "Chainmail",     def: 6,  cost: 300,   color: "#7a8090" },
    { id: "plate",       name: "Plate Armor",   def: 15, cost: 1800,  color: "#aab4c4" },
    { id: "dragonscale", name: "Dragonscale",   def: 35, cost: 10000, color: "#ff6b8a" },
  ];

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
    playerAttackTimer: 0,
    enemyAttackTimer: 0,
    enemyHp: ZONES[0].enemy.hp,
    enemyRespawnTimer: 0,
    playerRestTimer: 0,
    enemiesDefeated: 0,
    equipment: { weapon: "wooden-club", armor: "tunic" },
    inventory: { weapons: ["wooden-club"], armors: ["tunic"] },
    savedAt: 0,
  });

  let state = loadState() || initialState();
  let log = [];
  let lastTickAt = Date.now();
  // Cached visual signature so we only rebuild SVGs when something changes.
  let lastPlayerSig = null;
  let lastEnemySig = null;

  // --- DOM ------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const elLevel    = $("stat-level");
  const elGold     = $("stat-gold");
  const elVersion  = $("app-version");

  const elPlayerFigure  = $("player-figure");
  const elEnemyFigure   = $("enemy-figure");

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

  const elEquipWeaponName  = $("equip-weapon-name");
  const elEquipWeaponBonus = $("equip-weapon-bonus");
  const elEquipArmorName   = $("equip-armor-name");
  const elEquipArmorBonus  = $("equip-armor-bonus");
  const elOpenShop  = $("open-shop");
  const elShopBackdrop = $("shop-backdrop");
  const elShopModal    = $("shop-modal");
  const elShopClose    = $("shop-close");
  const elShopWeapons  = $("shop-weapons");
  const elShopArmors   = $("shop-armors");

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
      const base = initialState();
      const merged = { ...base, ...parsed };
      merged.upgrades  = { ...base.upgrades,  ...(parsed.upgrades || {}) };
      merged.equipment = { ...base.equipment, ...(parsed.equipment || {}) };
      merged.inventory = {
        weapons: Array.isArray(parsed.inventory?.weapons) ? parsed.inventory.weapons : base.inventory.weapons,
        armors:  Array.isArray(parsed.inventory?.armors)  ? parsed.inventory.armors  : base.inventory.armors,
      };
      // Guarantee starter items remain owned even if a save predates them.
      if (!merged.inventory.weapons.includes("wooden-club")) merged.inventory.weapons.unshift("wooden-club");
      if (!merged.inventory.armors.includes("tunic"))        merged.inventory.armors.unshift("tunic");
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
  function currentZone() { return ZONES.find(z => z.id === state.zoneId) || ZONES[0]; }
  function zoneUnlocked(zone) { return state.level >= zone.levelReq; }
  function fmtNum(n) { return Math.floor(n).toLocaleString(); }
  function equippedWeapon() { return WEAPONS.find(w => w.id === state.equipment.weapon) || WEAPONS[0]; }
  function equippedArmor()  { return ARMORS.find(a => a.id === state.equipment.armor)   || ARMORS[0]; }
  function playerAtk() { return state.atk + equippedWeapon().atk; }
  function playerDef() { return state.def + equippedArmor().def; }

  function pushLog(text, kind) {
    log.unshift({ text, kind: kind || "" });
    if (log.length > MAX_LOG) log.length = MAX_LOG;
    renderLog();
  }

  // --- Combat ---------------------------------------------------------------
  function tick(dtMs) {
    if (state.playerRestTimer > 0) {
      state.playerRestTimer -= dtMs;
      if (state.playerRestTimer <= 0) {
        state.playerRestTimer = 0;
        state.hp = state.maxHp;
        pushLog("You're rested and back in the fight.", "");
        triggerSpawn("player");
      }
      return;
    }

    if (state.enemyRespawnTimer > 0) {
      state.enemyRespawnTimer -= dtMs;
      if (state.enemyRespawnTimer <= 0) {
        spawnEnemy();
        triggerSpawn("enemy");
      }
      return;
    }

    const zone = currentZone();
    const enemy = zone.enemy;

    // Player swings — only animate the last swing if multiple processed.
    state.playerAttackTimer += dtMs;
    let lastPlayerDmg = 0;
    let playerKilled = false;
    while (state.playerAttackTimer >= PLAYER_ATTACK_MS) {
      state.playerAttackTimer -= PLAYER_ATTACK_MS;
      const dmg = Math.max(1, playerAtk() - enemy.def);
      state.enemyHp -= dmg;
      lastPlayerDmg = dmg;
      pushLog(`You hit ${enemy.name} for ${dmg}.`, "");
      if (state.enemyHp <= 0) { playerKilled = true; break; }
    }
    if (lastPlayerDmg > 0) {
      triggerAttack("player");
      schedule(() => {
        if (playerKilled) triggerDeath("enemy");
        else triggerHit("enemy");
        popDamage(elEnemyFigure, lastPlayerDmg, "from-player");
      }, 130);
    }
    if (playerKilled) { onEnemyKilled(); return; }

    // Enemy swings.
    state.enemyAttackTimer += dtMs;
    let lastEnemyDmg = 0;
    let playerDied = false;
    while (state.enemyAttackTimer >= enemy.attackMs) {
      state.enemyAttackTimer -= enemy.attackMs;
      const dmg = Math.max(1, enemy.atk - playerDef());
      state.hp -= dmg;
      lastEnemyDmg = dmg;
      pushLog(`${enemy.name} hits you for ${dmg}.`, "");
      if (state.hp <= 0) { playerDied = true; break; }
    }
    if (lastEnemyDmg > 0) {
      triggerAttack("enemy");
      schedule(() => {
        if (playerDied) triggerDeath("player");
        else triggerHit("player");
        popDamage(elPlayerFigure, lastEnemyDmg, "from-enemy");
      }, 130);
    }
    if (playerDied) { onPlayerDied(); return; }
  }

  function schedule(fn, ms) { setTimeout(fn, ms); }

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
    triggerSpawn("enemy");
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

  function buyItem(slot, id) {
    const list = slot === "weapon" ? WEAPONS : ARMORS;
    const owned = state.inventory[slot === "weapon" ? "weapons" : "armors"];
    const item = list.find(x => x.id === id);
    if (!item) return;
    if (owned.includes(id)) return;
    if (state.gold < item.cost) return;
    state.gold -= item.cost;
    owned.push(id);
    pushLog(`Purchased ${item.name}.`, "levelup");
    // Auto-equip if the new item is strictly stronger than what's worn.
    const cur = slot === "weapon" ? equippedWeapon() : equippedArmor();
    const newBonus = slot === "weapon" ? item.atk : item.def;
    const curBonus = slot === "weapon" ? cur.atk  : cur.def;
    if (newBonus > curBonus) equipItem(slot, id);
    else { renderShop(); renderEquipment(); renderHud(); }
  }

  function equipItem(slot, id) {
    const owned = state.inventory[slot === "weapon" ? "weapons" : "armors"];
    if (!owned.includes(id)) return;
    state.equipment[slot] = id;
    const list = slot === "weapon" ? WEAPONS : ARMORS;
    const item = list.find(x => x.id === id);
    if (item) pushLog(`Equipped ${item.name}.`, "zone");
    renderAll();
  }

  // --- Animation primitives -------------------------------------------------
  function flashClass(el, cls, ms) {
    if (!el) return;
    el.classList.remove(cls);
    // force reflow so the animation restarts even if already running
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  }
  function triggerAttack(who) {
    const el = who === "player" ? elPlayerFigure : elEnemyFigure;
    flashClass(el, "attacking", 380);
  }
  function triggerHit(who) {
    const el = who === "player" ? elPlayerFigure : elEnemyFigure;
    flashClass(el, "hit", 320);
  }
  function triggerSpawn(who) {
    const el = who === "player" ? elPlayerFigure : elEnemyFigure;
    el.classList.remove("dying");
    flashClass(el, "spawning", 420);
  }
  function triggerDeath(who) {
    const el = who === "player" ? elPlayerFigure : elEnemyFigure;
    el.classList.add("dying");
    // dying class is sticky until the next spawn explicitly removes it
  }
  function popDamage(target, value, kindClass) {
    if (!target) return;
    const span = document.createElement("span");
    span.className = `damage-popup ${kindClass || ""}`;
    span.textContent = `−${value}`;
    target.appendChild(span);
    setTimeout(() => span.remove(), 850);
  }

  // --- SVG sprites ----------------------------------------------------------
  function playerSvg() {
    const w = equippedWeapon();
    const a = equippedArmor();
    const body = a.color;
    const skin = "#f4c592";
    const leg  = "#2c2240";
    return `
<svg viewBox="0 0 90 120" class="figure-svg" aria-hidden="true">
  <ellipse cx="45" cy="115" rx="22" ry="3" fill="#000" opacity="0.35"/>
  <!-- legs -->
  <rect x="33" y="88" width="9" height="22" rx="3" fill="${leg}"/>
  <rect x="48" y="88" width="9" height="22" rx="3" fill="${leg}"/>
  <!-- body / armor -->
  <rect x="28" y="48" width="34" height="44" rx="6" fill="${body}" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"/>
  <!-- belt -->
  <rect x="28" y="78" width="34" height="5" fill="rgba(0,0,0,0.35)"/>
  <!-- back arm -->
  <rect x="23" y="52" width="8" height="26" rx="3" fill="${body}" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>
  <!-- head -->
  <circle cx="45" cy="32" r="13" fill="${skin}" stroke="rgba(0,0,0,0.25)" stroke-width="1"/>
  <!-- eye -->
  <circle cx="50" cy="32" r="1.7" fill="#222"/>
  <!-- front arm (weapon hand) -->
  <g class="weapon-arm">
    <rect x="60" y="50" width="8" height="26" rx="3" fill="${body}" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>
    ${weaponSvg(w)}
  </g>
</svg>`;
  }

  function weaponSvg(w) {
    switch (w.shape) {
      case "club":
        return `
<rect x="62" y="40" width="4" height="34" fill="#5a3a1a"/>
<ellipse cx="64" cy="36" rx="9" ry="11" fill="${w.color}" stroke="rgba(0,0,0,0.4)" stroke-width="1"/>`;
      case "sword":
        return `
<rect x="63" y="20" width="3" height="44" fill="${w.color}" stroke="rgba(0,0,0,0.4)" stroke-width="0.8"/>
<rect x="58" y="62" width="13" height="3" fill="#5a3a1a"/>
<rect x="62" y="64" width="5" height="7" fill="#3a2c00"/>`;
      case "flame-sword":
        return `
<rect x="63" y="20" width="3" height="44" fill="${w.color}" stroke="rgba(0,0,0,0.5)" stroke-width="0.8"/>
<rect x="58" y="62" width="13" height="3" fill="#5a3a1a"/>
<rect x="62" y="64" width="5" height="7" fill="#3a2c00"/>
<path d="M64.5 14 Q60 22 64 28 Q68 22 64.5 14 Z" fill="#ffd86b" opacity="0.85"/>`;
      case "greatsword":
        return `
<rect x="62" y="12" width="5" height="54" fill="${w.color}" stroke="rgba(0,0,0,0.45)" stroke-width="0.8"/>
<rect x="56" y="64" width="17" height="4" fill="#3a2c00"/>
<rect x="62" y="68" width="5" height="9" fill="#1a1228"/>`;
      default:
        return "";
    }
  }

  function enemySvg(sprite) {
    switch (sprite) {
      case "slime":
        return `
<svg viewBox="0 0 100 100" class="figure-svg" aria-hidden="true">
  <ellipse cx="50" cy="92" rx="32" ry="4" fill="#000" opacity="0.35"/>
  <path d="M22 78 Q22 38 50 38 Q78 38 78 78 Q78 90 50 90 Q22 90 22 78 Z"
        fill="#6affa1" stroke="#2ec76b" stroke-width="2"/>
  <ellipse cx="50" cy="58" rx="14" ry="6" fill="#aaffc1" opacity="0.7"/>
  <circle cx="40" cy="62" r="3" fill="#0b1020"/>
  <circle cx="60" cy="62" r="3" fill="#0b1020"/>
  <path d="M42 75 Q50 80 58 75" stroke="#0b1020" stroke-width="2" fill="none" stroke-linecap="round"/>
</svg>`;
      case "goblin":
        return `
<svg viewBox="0 0 100 120" class="figure-svg" aria-hidden="true">
  <ellipse cx="50" cy="115" rx="22" ry="3" fill="#000" opacity="0.35"/>
  <rect x="36" y="86" width="9" height="22" rx="3" fill="#3a2c00"/>
  <rect x="55" y="86" width="9" height="22" rx="3" fill="#3a2c00"/>
  <rect x="30" y="52" width="40" height="40" rx="6" fill="#7fa84a" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"/>
  <circle cx="50" cy="36" r="14" fill="#9fc760" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"/>
  <!-- ears -->
  <path d="M36 32 L28 28 L36 40 Z" fill="#9fc760"/>
  <path d="M64 32 L72 28 L64 40 Z" fill="#9fc760"/>
  <!-- eyes -->
  <circle cx="44" cy="36" r="2" fill="#ff3333"/>
  <circle cx="56" cy="36" r="2" fill="#ff3333"/>
  <!-- snarl -->
  <path d="M42 44 L50 48 L58 44" stroke="#0b1020" stroke-width="2" fill="none" stroke-linecap="round"/>
  <!-- crude dagger -->
  <rect x="22" y="60" width="2" height="18" fill="#c0c4cc"/>
  <rect x="20" y="78" width="6" height="2" fill="#3a2c00"/>
</svg>`;
      case "orc":
        return `
<svg viewBox="0 0 110 130" class="figure-svg" aria-hidden="true">
  <ellipse cx="55" cy="125" rx="30" ry="4" fill="#000" opacity="0.4"/>
  <rect x="38" y="94" width="11" height="24" rx="3" fill="#2c1810"/>
  <rect x="61" y="94" width="11" height="24" rx="3" fill="#2c1810"/>
  <rect x="26" y="54" width="58" height="44" rx="8" fill="#6a8e58" stroke="rgba(0,0,0,0.4)" stroke-width="1.5"/>
  <!-- shoulder pads -->
  <ellipse cx="28" cy="58" rx="9" ry="6" fill="#3a2c00"/>
  <ellipse cx="82" cy="58" rx="9" ry="6" fill="#3a2c00"/>
  <!-- head -->
  <ellipse cx="55" cy="34" rx="18" ry="16" fill="#85a86f" stroke="rgba(0,0,0,0.4)" stroke-width="1.5"/>
  <!-- tusks -->
  <path d="M46 42 L44 50 L48 44 Z" fill="#fff"/>
  <path d="M64 42 L66 50 L62 44 Z" fill="#fff"/>
  <!-- eyes -->
  <circle cx="48" cy="32" r="2.5" fill="#ffd86b"/>
  <circle cx="62" cy="32" r="2.5" fill="#ffd86b"/>
  <!-- club -->
  <rect x="86" y="58" width="4" height="34" fill="#5a3a1a"/>
  <ellipse cx="88" cy="54" rx="10" ry="12" fill="#7a6440" stroke="rgba(0,0,0,0.4)" stroke-width="1"/>
</svg>`;
      case "dragon":
        return `
<svg viewBox="0 0 140 120" class="figure-svg" aria-hidden="true">
  <ellipse cx="70" cy="115" rx="40" ry="4" fill="#000" opacity="0.4"/>
  <!-- wing back -->
  <path d="M70 56 Q30 18 14 50 Q40 54 56 76 Z" fill="#7a1422" opacity="0.8"/>
  <!-- body -->
  <ellipse cx="74" cy="74" rx="34" ry="24" fill="#c72e54" stroke="rgba(0,0,0,0.5)" stroke-width="1.5"/>
  <!-- tail -->
  <path d="M100 84 Q128 92 132 70 Q120 78 102 76 Z" fill="#c72e54" stroke="rgba(0,0,0,0.5)" stroke-width="1"/>
  <!-- wing front -->
  <path d="M68 56 Q92 16 124 44 Q92 52 78 74 Z" fill="#a02038" opacity="0.95"/>
  <!-- head -->
  <ellipse cx="44" cy="58" rx="20" ry="16" fill="#c72e54" stroke="rgba(0,0,0,0.5)" stroke-width="1.5"/>
  <!-- horns -->
  <path d="M40 44 L36 30 L46 42 Z" fill="#1a0510"/>
  <path d="M52 44 L56 30 L50 42 Z" fill="#1a0510"/>
  <!-- eye -->
  <circle cx="40" cy="56" r="3" fill="#ffd86b"/>
  <circle cx="40" cy="56" r="1.4" fill="#0b1020"/>
  <!-- mouth -->
  <path d="M28 64 L40 66 L34 70 Z" fill="#1a0510"/>
  <!-- legs -->
  <rect x="58" y="94" width="10" height="14" rx="3" fill="#a02038"/>
  <rect x="82" y="94" width="10" height="14" rx="3" fill="#a02038"/>
</svg>`;
      default:
        return `<svg viewBox="0 0 100 100" class="figure-svg"><circle cx="50" cy="50" r="40" fill="#888"/></svg>`;
    }
  }

  // --- Render ---------------------------------------------------------------
  function renderAll() {
    renderHud();
    renderFigures();
    renderCombat();
    renderZones();
    renderUpgrades();
    renderEquipment();
    renderShop();
    renderLog();
  }

  function renderHud() {
    elLevel.textContent = state.level;
    elGold.textContent = fmtNum(state.gold);
  }

  function renderFigures() {
    const psig = `${state.equipment.weapon}|${state.equipment.armor}`;
    if (psig !== lastPlayerSig) {
      elPlayerFigure.innerHTML = playerSvg();
      lastPlayerSig = psig;
    }
    const enemy = currentZone().enemy;
    const esig = enemy.sprite;
    if (esig !== lastEnemySig) {
      elEnemyFigure.innerHTML = enemySvg(enemy.sprite);
      lastEnemySig = esig;
    }
  }

  function renderCombat() {
    elPlayerStats.textContent = `⚔ ${playerAtk()} · 🛡 ${playerDef()}`;
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

  function renderEquipment() {
    const w = equippedWeapon();
    const a = equippedArmor();
    elEquipWeaponName.textContent  = w.name;
    elEquipWeaponBonus.textContent = `+${w.atk} ATK`;
    elEquipArmorName.textContent   = a.name;
    elEquipArmorBonus.textContent  = `+${a.def} DEF`;
  }

  function renderShop() {
    if (!elShopWeapons || !elShopArmors) return;
    elShopWeapons.innerHTML = WEAPONS.map(w => shopItemHtml("weapon", w, w.atk, "ATK")).join("");
    elShopArmors.innerHTML  = ARMORS.map(a  => shopItemHtml("armor",  a, a.def, "DEF")).join("");
    for (const node of elShopWeapons.querySelectorAll("button[data-action]")) wireShopButton(node);
    for (const node of elShopArmors.querySelectorAll("button[data-action]")) wireShopButton(node);
  }

  function shopItemHtml(slot, item, bonus, bonusLabel) {
    const ownedList = state.inventory[slot === "weapon" ? "weapons" : "armors"];
    const owned = ownedList.includes(item.id);
    const equipped = state.equipment[slot] === item.id;
    let action = "";
    if (equipped) {
      action = `<button type="button" class="shop-action" disabled>Equipped</button>`;
    } else if (owned) {
      action = `<button type="button" class="shop-action equip" data-action="equip" data-slot="${slot}" data-id="${item.id}">Equip</button>`;
    } else {
      const can = state.gold >= item.cost;
      action = `<button type="button" class="shop-action buy" data-action="buy" data-slot="${slot}" data-id="${item.id}" ${can ? "" : "disabled"}>
        Buy · ${fmtNum(item.cost)} g
      </button>`;
    }
    const swatchStyle = `background:${item.color}`;
    return `
<div class="shop-item ${equipped ? "equipped" : ""}">
  <span class="shop-swatch" style="${swatchStyle}"></span>
  <span class="shop-meta">
    <strong>${escapeHtml(item.name)}</strong>
    <small>+${bonus} ${bonusLabel}</small>
  </span>
  ${action}
</div>`;
  }

  function wireShopButton(btn) {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      const slot   = btn.dataset.slot;
      const id     = btn.dataset.id;
      if (action === "buy") buyItem(slot, id);
      else if (action === "equip") equipItem(slot, id);
    });
  }

  function openShop() {
    renderShop();
    elShopBackdrop.classList.remove("hidden");
    elShopModal.classList.remove("hidden");
  }
  function closeShop() {
    elShopBackdrop.classList.add("hidden");
    elShopModal.classList.add("hidden");
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
    if (dt > 5000) dt = 5000;
    tick(dt);
    renderCombat();
    renderHud();
    // Some buttons depend on current gold — keep upgrade + shop affordability fresh.
    refreshAffordability();
    if (now - state.savedAt >= SAVE_INTERVAL_MS) saveState();
    setTimeout(loop, TICK_MS);
  }

  let lastGoldRendered = -1;
  function refreshAffordability() {
    if (state.gold === lastGoldRendered) return;
    lastGoldRendered = state.gold;
    renderUpgrades();
    if (!elShopModal.classList.contains("hidden")) renderShop();
  }

  elResetSave.addEventListener("click", resetSave);
  elOpenShop.addEventListener("click", openShop);
  elShopClose.addEventListener("click", closeShop);
  elShopBackdrop.addEventListener("click", closeShop);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !elShopModal.classList.contains("hidden")) closeShop();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveState();
  });
  window.addEventListener("pagehide", saveState);

  fetchVersion().then(v => { elVersion.textContent = `v${v}`; });

  if (state.enemyHp <= 0 || state.enemyHp > currentZone().enemy.hp) {
    spawnEnemy();
  }
  renderAll();
  pushLog("Welcome back, adventurer!", "zone");
  lastTickAt = Date.now();
  setTimeout(loop, TICK_MS);
})();
