(() => {
  "use strict";

  const GRID_W = 10;
  const GRID_H = 20;

  // Turrets must be placed within this Chebyshev distance of any defense
  // cell. Keeps players from spamming the spawn edge.
  const PLACEMENT_RADIUS = 5;

  const MODES = {
    daily: {
      label: "Daily",
      family: "daily",
      startMoney: 120,
      startLives: 20,
      maxWave: 12,
      autoAdvance: false,
    },
    "endless-easy": {
      label: "Endless · Easy",
      family: "endless",
      difficulty: "easy",
      startMoney: 400,
      startLives: 25,
      maxWave: Infinity,
      autoAdvance: true,
      autoAdvanceFrames: 240,           // ~4s
      scaling: {
        speed: 0.025, hp: 0.12,
        spacingBase: 45, spacingDecay: 1.0, spacingMin: 8,
        runnersBase: 4, runnersPerWave: 3, tanksPerWave: 0.8,
      },
    },
    "endless-normal": {
      label: "Endless · Normal",
      family: "endless",
      difficulty: "normal",
      startMoney: 300,
      startLives: 20,
      maxWave: Infinity,
      autoAdvance: true,
      autoAdvanceFrames: 180,           // ~3s
      scaling: {
        speed: 0.035, hp: 0.15,
        spacingBase: 38, spacingDecay: 1.2, spacingMin: 5,
        runnersBase: 5, runnersPerWave: 4, tanksPerWave: 1.2,
      },
    },
    "endless-hard": {
      label: "Endless · Hard",
      family: "endless",
      difficulty: "hard",
      startMoney: 200,
      startLives: 15,
      maxWave: Infinity,
      autoAdvance: true,
      autoAdvanceFrames: 120,           // ~2s
      scaling: {
        speed: 0.050, hp: 0.20,
        spacingBase: 32, spacingDecay: 1.4, spacingMin: 3,
        runnersBase: 6, runnersPerWave: 5, tanksPerWave: 1.6,
      },
    },
    "random": {
      label: "Random · 12 waves",
      family: "random",
      length: "finite",
      startMoney: 0,
      startLives: 20,
      maxWave: 12,
      autoAdvance: false,
      freeTurrets: true,
      randomSeedCount: 4,                // turrets pre-loaded into the queue
      randomGrantFrames: 600,            // 10s @ 60fps → +1 to queue
      randomKillsPerGrant: 5,            // every 5 kills → +1 to queue
    },
    "random-infinite": {
      label: "Random · Infinite",
      family: "random",
      length: "infinite",
      startMoney: 0,
      startLives: 20,
      maxWave: Infinity,
      autoAdvance: true,
      autoAdvanceFrames: 180,            // ~3s
      freeTurrets: true,
      randomSeedCount: 4,
      randomGrantFrames: 600,
      randomKillsPerGrant: 5,
      // Random-infinite borrows endless-normal's escalation curve.
      scaling: {
        speed: 0.035, hp: 0.15,
        spacingBase: 38, spacingDecay: 1.2, spacingMin: 5,
        runnersBase: 5, runnersPerWave: 4, tanksPerWave: 1.2,
      },
    },
  };
  const STARTING_LIVES = 20; // legacy fallback

  const TURRETS = {
    close:  { name: "Close",  cost: 30, range: 1.6, damage: 8,  cooldown: 18, color: "#7ad0ff", splash: 0,   key: "1" },
    medium: { name: "Medium", cost: 55, range: 3.2, damage: 14, cooldown: 36, color: "#ffd86b", splash: 0,   key: "2" },
    aoe:    { name: "AoE",    cost: 75, range: 2.4, damage: 9,  cooldown: 60, color: "#ff8af0", splash: 1.4, key: "3" },
  };

  // --- XP / leveling -------------------------------------------------------
  // Diminishing-returns stat bonuses: bonus(L, cap) = cap * (1 - 0.8^(L-1)).
  // L1 = 0 (base stats). Asymptote: every stat approaches its cap as L -> inf.
  const XP_PER_HP        = 0.5;
  const XP_KILL_SHARE    = 0.40;
  const XP_CLOSEST_SHARE = 0.30;
  const XP_SPLIT_SHARE   = 0.30;
  const LEVEL_DECAY      = 0.8;
  const LEVEL_CAPS = {
    damage:   1.50,  // +150% max
    range:    0.50,  // +50% max
    cooldown: 0.60,  // -60% max (i.e. 2.5x fire rate at L∞)
    splash:   0.50,  // +50% max (AoE only; harmless on non-AoE)
  };

  function levelBonus(level, cap) {
    if (level <= 1) return 0;
    return cap * (1 - Math.pow(LEVEL_DECAY, level - 1));
  }

  function xpToNext(level) {
    return Math.floor(50 * Math.pow(1.5, level - 1));
  }

  function effectiveStats(turret) {
    const base = TURRETS[turret.type];
    const L = turret.level;
    return {
      damage:   base.damage   * (1 + levelBonus(L, LEVEL_CAPS.damage)),
      range:    base.range    * (1 + levelBonus(L, LEVEL_CAPS.range)),
      cooldown: base.cooldown * (1 - levelBonus(L, LEVEL_CAPS.cooldown)),
      splash:   base.splash   * (1 + levelBonus(L, LEVEL_CAPS.splash)),
      color:    base.color,
    };
  }

  const ENEMIES = {
    runner: { name: "Runner", hp: 22, speed: 0.018, color: "#8aff9e", bounty: 6,  size: 0.32 },
    tank:   { name: "Tank",   hp: 90, speed: 0.008, color: "#ff6b8a", bounty: 14, size: 0.42 },
  };

  // --- Seeded PRNG (mulberry32) --------------------------------------------
  function mulberry32(seed) {
    let t = seed >>> 0;
    return function() {
      t = (t + 0x6d2b79f5) >>> 0;
      let r = t;
      r = Math.imul(r ^ (r >>> 15), r | 1);
      r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  const randInt = (rng, lo, hi) => Math.floor(rng() * (hi - lo + 1)) + lo;
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

  // --- Map generation -------------------------------------------------------
  // 1-2 defense points placed in interior; 1-6 paths from edges to a defense
  // point using a biased random walk on the grid. Path cells are marked as
  // unbuildable. Defense cells too.
  function generateMap(seed) {
    const rng = mulberry32(seed);
    const grid = Array.from({ length: GRID_H }, () =>
      Array.from({ length: GRID_W }, () => ({ kind: "empty" }))
    );

    const numDefense = randInt(rng, 1, 2);
    const defenses = [];
    while (defenses.length < numDefense) {
      const x = randInt(rng, 2, GRID_W - 3);
      const y = randInt(rng, GRID_H - 6, GRID_H - 2);
      if (!defenses.some(d => Math.abs(d.x - x) + Math.abs(d.y - y) < 3)) {
        defenses.push({ x, y });
      }
    }

    const numPaths = randInt(rng, 1, 6);
    const paths = [];

    for (let i = 0; i < numPaths; i++) {
      const edge = pick(rng, ["top", "left", "right"]);
      let start;
      if (edge === "top")        start = { x: randInt(rng, 0, GRID_W - 1), y: 0 };
      else if (edge === "left")  start = { x: 0, y: randInt(rng, 0, Math.floor(GRID_H * 0.6)) };
      else                       start = { x: GRID_W - 1, y: randInt(rng, 0, Math.floor(GRID_H * 0.6)) };

      const target = pick(rng, defenses);
      const cells = walkPath(rng, start, target);
      if (cells.length < 3) continue;
      paths.push({ cells, target });
    }

    if (paths.length === 0) {
      const target = defenses[0];
      const start = { x: target.x, y: 0 };
      paths.push({ cells: walkPath(rng, start, target), target });
    }

    for (const p of paths) {
      for (const c of p.cells) {
        if (grid[c.y] && grid[c.y][c.x]) grid[c.y][c.x] = { kind: "path" };
      }
    }
    for (const d of defenses) grid[d.y][d.x] = { kind: "defense" };

    return { grid, defenses, paths, seed };
  }

  // Biased random walk that never revisits cells, so consecutive entries are
  // always 4-adjacent (no teleporting after dedupe — and no dedupe needed).
  // Strong bias toward target with occasional perpendicular deviations.
  function walkPath(rng, start, end) {
    const cells = [{ ...start }];
    const visited = new Set([`${start.x},${start.y}`]);
    const key = (x, y) => `${x},${y}`;
    let cur = { ...start };
    let safety = (GRID_W + GRID_H) * 6;

    while ((cur.x !== end.x || cur.y !== end.y) && safety-- > 0) {
      const dx = Math.sign(end.x - cur.x);
      const dy = Math.sign(end.y - cur.y);
      const inBounds = (x, y) => x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;
      const opts = [];
      const add = (x, y, w) => {
        if (!inBounds(x, y) || visited.has(key(x, y))) return;
        if (w > 0) opts.push({ x, y, w });
      };
      // Heavy weight on moves that close distance to the target.
      if (dx !== 0) add(cur.x + dx, cur.y, 9);
      if (dy !== 0) add(cur.x, cur.y + dy, 9);
      // Light weight on perpendicular detours (only when not actively
      // moving away from target).
      if (dx === 0) {
        add(cur.x - 1, cur.y, 2);
        add(cur.x + 1, cur.y, 2);
      }
      if (dy === 0) {
        add(cur.x, cur.y - 1, 2);
        add(cur.x, cur.y + 1, 2);
      }

      if (opts.length === 0) {
        // Boxed in by visited cells — accept any in-bounds neighbour even
        // if visited, to escape the dead end. Prefer cells closer to target.
        const fallback = [];
        for (const [nx, ny] of [
          [cur.x + 1, cur.y], [cur.x - 1, cur.y],
          [cur.x, cur.y + 1], [cur.x, cur.y - 1],
        ]) {
          if (!inBounds(nx, ny)) continue;
          const dist = Math.abs(nx - end.x) + Math.abs(ny - end.y);
          fallback.push({ x: nx, y: ny, w: 1 / (1 + dist) });
        }
        if (fallback.length === 0) break;
        cur = weightedPick(rng, fallback);
      } else {
        cur = weightedPick(rng, opts);
      }
      visited.add(key(cur.x, cur.y));
      cells.push({ ...cur });
    }
    return cells;
  }

  function weightedPick(rng, opts) {
    let total = 0;
    for (const o of opts) total += o.w;
    let r = rng() * total;
    for (const o of opts) {
      r -= o.w;
      if (r <= 0) return { x: o.x, y: o.y };
    }
    const last = opts[opts.length - 1];
    return { x: last.x, y: last.y };
  }

  // --- Wave definition ------------------------------------------------------
  function waveSpec(n, mode) {
    const cfg = MODES[mode] || MODES.daily;
    let runners, tanks, spacing, hpMult, speedMult;
    if (cfg.scaling) {
      // Endless family and random-infinite use a per-wave scaling table.
      const s = cfg.scaling;
      runners = s.runnersBase + Math.floor(n * s.runnersPerWave);
      tanks = Math.floor(n * s.tanksPerWave);
      spacing = Math.max(s.spacingMin, s.spacingBase - n * s.spacingDecay);
      hpMult = 1 + (n - 1) * s.hp;
      speedMult = 1 + (n - 1) * s.speed;
    } else {
      runners = 6 + Math.floor(n * 3.5);
      tanks = Math.max(0, Math.floor((n - 1) * 0.7));
      spacing = Math.max(18, 50 - n * 2);
      hpMult = 1 + (n - 1) * 0.18;
      speedMult = 1;
    }
    const list = [];
    for (let i = 0; i < runners; i++) list.push("runner");
    for (let i = 0; i < tanks; i++) list.push("tank");
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return { types: list, spacing, hpMult, speedMult };
  }

  // --- Game state -----------------------------------------------------------
  const state = {
    mode: "daily",
    map: null,
    selectedTurret: "close",
    turrets: [],
    enemies: [],
    projectiles: [],
    money: 0,
    lives: STARTING_LIVES,
    wave: 0,
    score: 0,
    spawnQueue: [],
    spawnTimer: 0,
    spawnSpacing: 0,
    waveActive: false,
    running: false,
    gameOver: false,
    won: false,
    dailyDate: null,
    tick: 0,
    startedAt: 0,
    elapsedMs: 0,
    nextWaveCountdown: 0,
    nextRandomTurret: "close",
    turretQueue: 0,
    framesSinceGrant: 0,
    killsSinceGrant: 0,
    leaderboards: {
      "daily": [],
      "endless-easy": [],
      "endless-normal": [],
      "endless-hard": [],
      "random": [],
      "random-infinite": [],
    },
  };

  // --- DOM ------------------------------------------------------------------
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const elLives = document.getElementById("stat-lives");
  const elMoney = document.getElementById("stat-money");
  const elWave = document.getElementById("stat-wave");
  const elScore = document.getElementById("stat-score");
  const elDaily = document.getElementById("daily-label");
  const elTurretGrid = document.getElementById("turret-grid");
  const elStartWave = document.getElementById("start-wave");
  const elReset = document.getElementById("reset-run");
  const elOverlay = document.getElementById("overlay");
  const elOverlayTitle = document.getElementById("overlay-title");
  const elOverlayBody = document.getElementById("overlay-body");
  const elOverlayStart = document.getElementById("overlay-start");
  const elOverlaySubmit = document.getElementById("overlay-submit");
  const elOverlayLB = document.getElementById("overlay-leaderboard");
  const elAppVersion = document.getElementById("app-version");
  const elModePicker = document.getElementById("mode-picker");
  const elModeButtons = Array.from(document.querySelectorAll(".mode-btn"));
  const elDifficultyPicker = document.getElementById("difficulty-picker");
  const elDifficultyButtons = Array.from(document.querySelectorAll("#difficulty-picker .diff-btn"));
  const elRandomLengthPicker = document.getElementById("random-length-picker");
  const elRandomLengthButtons = Array.from(document.querySelectorAll("#random-length-picker .diff-btn"));
  const elRandomNext = document.getElementById("random-next");
  const elRandomNextSwatch = document.getElementById("random-next-swatch");
  const elRandomNextName = document.getElementById("random-next-name");
  const elRandomNextMeta = document.getElementById("random-next-meta");

  // --- Robust button activator --------------------------------------------
  // iOS Safari sometimes swallows `click` events on dynamically toggled
  // elements (especially inside an absolutely-positioned overlay that sits
  // over a canvas with touch listeners). We listen for both `click` and
  // `pointerup` and dedupe within a short window so the handler fires
  // exactly once per tap on touch, mouse, and keyboard.
  function activate(el, handler) {
    if (el.type === "" || el.type === "submit") el.type = "button";
    let triggered = 0;
    const fire = (e) => {
      if (el.disabled) return;
      const now = Date.now();
      if (now - triggered < 350) return;
      triggered = now;
      handler(e);
    };
    el.addEventListener("click", fire);
    el.addEventListener("pointerup", (e) => {
      if (e.pointerType === "touch" || e.pointerType === "pen") fire(e);
    });
  }

  // Turret buttons are built ONCE on first render and then we only toggle
  // .selected / .unaffordable classes on the existing nodes. Rebuilding the
  // DOM on every HUD tick (~10 Hz) was destroying the button between
  // pointerdown and pointerup on iOS, so taps on Medium / AoE were silently
  // dropped.
  const turretButtonNodes = {};

  function buildTurretButtons() {
    elTurretGrid.innerHTML = "";
    for (const [id, t] of Object.entries(TURRETS)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "turret-btn";
      btn.dataset.turret = id;
      btn.innerHTML = `
        <span class="swatch" style="background:${t.color}"></span>
        <span class="meta">
          <strong>${t.name} — $${t.cost}</strong>
          <small>rng ${t.range.toFixed(1)} · dmg ${t.damage}${t.splash ? " · splash" : ""} · key ${t.key}</small>
        </span>`;
      activate(btn, () => {
        state.selectedTurret = id;
        syncTurretButtons();
      });
      elTurretGrid.appendChild(btn);
      turretButtonNodes[id] = btn;
    }
    syncTurretButtons();
  }

  function syncTurretButtons() {
    for (const [id, t] of Object.entries(TURRETS)) {
      const btn = turretButtonNodes[id];
      if (!btn) continue;
      btn.classList.toggle("selected", state.selectedTurret === id);
      btn.classList.toggle("unaffordable", state.money < t.cost);
    }
  }

  function formatElapsed(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  }

  function updateHUD() {
    const cfg = MODES[state.mode];
    elLives.textContent = state.lives;
    elMoney.textContent = cfg && cfg.freeTurrets ? state.turretQueue : state.money;
    elWave.textContent = state.wave;
    elScore.textContent = state.score;
    syncTurretButtons();
    syncRandomNext();
    elStartWave.disabled = state.waveActive || state.gameOver;
    if (state.gameOver) {
      elStartWave.textContent = state.won ? "Run complete" : "Game over";
    } else if (state.nextWaveCountdown > 0) {
      const s = Math.ceil(state.nextWaveCountdown / 60);
      elStartWave.textContent = `Wave ${state.wave + 1} in ${s}s — skip?`;
      elStartWave.disabled = false;
    } else {
      elStartWave.textContent = state.wave === 0
        ? "Start Wave 1"
        : `Start Wave ${state.wave + 1}`;
    }
    updateModeLabel();
  }

  function updateModeLabel() {
    const cfg = MODES[state.mode];
    if (cfg && (cfg.family === "endless" || cfg.maxWave === Infinity)) {
      elDaily.textContent = `· ${cfg.label} · ${formatElapsed(state.elapsedMs)}`;
    } else if (cfg && cfg.family === "random") {
      elDaily.textContent = `· ${cfg.label}`;
    } else if (state.dailyDate) {
      elDaily.textContent = `· daily ${state.dailyDate}`;
    } else {
      elDaily.textContent = "";
    }
  }

  // --- Canvas sizing & input -----------------------------------------------
  let cellPx = 32;
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cellPx = rect.width / GRID_W;
  }
  window.addEventListener("resize", resizeCanvas);

  function pointToCell(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left) / cellPx);
    const y = Math.floor((clientY - rect.top) / cellPx);
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return null;
    return { x, y };
  }

  function isEligibleCell(x, y) {
    if (!state.map) return false;
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return false;
    const tile = state.map.grid[y][x];
    if (tile.kind !== "empty") return false;
    for (const d of state.map.defenses) {
      const dist = Math.max(Math.abs(d.x - x), Math.abs(d.y - y));
      if (dist <= PLACEMENT_RADIUS) return true;
    }
    return false;
  }

  function rollNextTurret() {
    const keys = Object.keys(TURRETS);
    state.nextRandomTurret = keys[Math.floor(Math.random() * keys.length)];
  }

  function tryPlaceTurret(cell) {
    if (!cell || state.gameOver || !state.map) return;
    if (!isEligibleCell(cell.x, cell.y)) return;
    if (state.turrets.some(tr => tr.x === cell.x && tr.y === cell.y)) return;
    const cfg = MODES[state.mode];
    const isRandom = cfg && cfg.freeTurrets;
    if (isRandom && state.turretQueue <= 0) return;
    const type = isRandom ? state.nextRandomTurret : state.selectedTurret;
    const t = TURRETS[type];
    if (!isRandom) {
      if (state.money < t.cost) return;
      state.money -= t.cost;
    } else {
      state.turretQueue -= 1;
    }
    state.turrets.push({
      x: cell.x, y: cell.y, type,
      cd: 0, xp: 0, level: 1,
    });
    if (isRandom) {
      rollNextTurret();
      syncRandomNext();
    }
    updateHUD();
  }

  canvas.addEventListener("click", (e) => {
    tryPlaceTurret(pointToCell(e.clientX, e.clientY));
  });
  canvas.addEventListener("touchend", (e) => {
    if (e.changedTouches.length === 0) return;
    const t = e.changedTouches[0];
    tryPlaceTurret(pointToCell(t.clientX, t.clientY));
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });

  document.addEventListener("keydown", (e) => {
    if (e.key === "1") { state.selectedTurret = "close"; renderTurretButtons(); }
    else if (e.key === "2") { state.selectedTurret = "medium"; renderTurretButtons(); }
    else if (e.key === "3") { state.selectedTurret = "aoe"; renderTurretButtons(); }
    else if (e.key.toLowerCase() === "n") startWave();
    else if (e.key.toLowerCase() === "r") resetRun();
  });

  // --- Wave / enemy logic ---------------------------------------------------
  function startWave() {
    if (state.waveActive || state.gameOver || !state.map) return;
    state.wave += 1;
    const spec = waveSpec(state.wave, state.mode);
    state.spawnQueue = spec.types.map(type => ({
      type, hpMult: spec.hpMult, speedMult: spec.speedMult,
    }));
    state.spawnTimer = 0;
    state.spawnSpacing = spec.spacing;
    state.waveActive = true;
    state.nextWaveCountdown = 0;
    if (state.startedAt === 0) state.startedAt = Date.now();
    updateHUD();
  }

  function spawnEnemy(type, hpMult, speedMult) {
    const path = pick(Math.random, state.map.paths);
    const def = ENEMIES[type];
    state.enemies.push({
      type,
      path,
      idx: 0,
      t: 0,
      x: path.cells[0].x,
      y: path.cells[0].y,
      hp: def.hp * hpMult,
      maxHp: def.hp * hpMult,
      speed: def.speed * (speedMult || 1),
      bounty: def.bounty,
      dead: false,
    });
  }

  function stepEnemies() {
    for (const e of state.enemies) {
      if (e.dead) continue;
      e.t += e.speed;
      while (e.t >= 1 && e.idx < e.path.cells.length - 1) {
        e.t -= 1;
        e.idx += 1;
      }
      // Defensive: never let interpolation read past the end of the path.
      const a = e.path.cells[e.idx];
      const b = e.path.cells[Math.min(e.idx + 1, e.path.cells.length - 1)];
      e.x = a.x + (b.x - a.x) * e.t;
      e.y = a.y + (b.y - a.y) * e.t;
      if (e.idx >= e.path.cells.length - 1 && e.t >= 0.9) {
        e.dead = true;
        state.lives -= 1;
        if (state.lives <= 0) endRun(false);
      }
    }
    state.enemies = state.enemies.filter(e => !e.dead || e.fadingFor !== undefined);
  }

  function stepTurrets() {
    for (const tr of state.turrets) {
      if (tr.cd > 0) { tr.cd -= 1; continue; }
      const stats = effectiveStats(tr);
      let target = null;
      let bestProgress = -1;
      for (const e of state.enemies) {
        if (e.dead) continue;
        const dx = e.x - tr.x;
        const dy = e.y - tr.y;
        if (dx * dx + dy * dy > stats.range * stats.range) continue;
        const progress = e.idx + e.t;
        if (progress > bestProgress) {
          bestProgress = progress;
          target = e;
        }
      }
      if (target) {
        state.projectiles.push({
          x: tr.x + 0.5, y: tr.y + 0.5,
          tx: target.x + 0.5, ty: target.y + 0.5,
          color: stats.color, life: 6,
          target, damage: stats.damage, splash: stats.splash,
          from: tr,
        });
        tr.cd = stats.cooldown;
      }
    }
  }

  function stepProjectiles() {
    for (const p of state.projectiles) {
      p.life -= 1;
      if (p.life > 0) continue;
      if (p.splash > 0) {
        for (const e of state.enemies) {
          if (e.dead) continue;
          const dx = e.x - (p.target.x);
          const dy = e.y - (p.target.y);
          if (dx * dx + dy * dy <= p.splash * p.splash) {
            damageEnemy(e, p.damage, p.from);
          }
        }
      } else if (!p.target.dead) {
        damageEnemy(p.target, p.damage, p.from);
      }
    }
    state.projectiles = state.projectiles.filter(p => p.life > 0);
  }

  function damageEnemy(e, dmg, killer) {
    if (e.dead) return;
    e.hp -= dmg;
    if (e.hp <= 0) {
      e.dead = true;
      state.money += e.bounty;
      state.score += Math.round(e.maxHp);
      awardXp(e, killer);
      // Random mode: kills feed the turret queue.
      const cfg = MODES[state.mode];
      if (cfg && cfg.freeTurrets) {
        state.killsSinceGrant += 1;
        while (state.killsSinceGrant >= cfg.randomKillsPerGrant) {
          state.killsSinceGrant -= cfg.randomKillsPerGrant;
          state.turretQueue += 1;
        }
      }
    }
  }

  function awardXp(enemy, killer) {
    const turrets = state.turrets;
    if (turrets.length === 0) return;
    const total = enemy.maxHp * XP_PER_HP;

    // Find closest turret to the enemy's death position.
    let closest = null;
    let bestDist = Infinity;
    for (const t of turrets) {
      const dx = (t.x + 0.5) - enemy.x;
      const dy = (t.y + 0.5) - enemy.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; closest = t; }
    }

    const grants = new Map(turrets.map(t => [t, 0]));
    if (killer && grants.has(killer)) {
      grants.set(killer, grants.get(killer) + total * XP_KILL_SHARE);
    }
    if (closest) {
      grants.set(closest, grants.get(closest) + total * XP_CLOSEST_SHARE);
    }
    const evenEach = total * XP_SPLIT_SHARE / turrets.length;
    for (const t of turrets) grants.set(t, grants.get(t) + evenEach);

    for (const [t, amount] of grants) addXp(t, amount);
  }

  function addXp(turret, amount) {
    turret.xp += amount;
    while (turret.xp >= xpToNext(turret.level)) {
      turret.xp -= xpToNext(turret.level);
      turret.level += 1;
    }
  }

  // --- Game loop ------------------------------------------------------------
  function gameLoop() {
    if (!state.running) return;
    state.tick += 1;
    if (state.startedAt > 0 && !state.gameOver) {
      state.elapsedMs = Date.now() - state.startedAt;
    }

    if (state.waveActive) {
      state.spawnTimer -= 1;
      if (state.spawnTimer <= 0 && state.spawnQueue.length > 0) {
        const next = state.spawnQueue.shift();
        spawnEnemy(next.type, next.hpMult, next.speedMult);
        state.spawnTimer = state.spawnSpacing;
      }
    } else if (state.nextWaveCountdown > 0 && !state.gameOver) {
      state.nextWaveCountdown -= 1;
      if (state.nextWaveCountdown <= 0) startWave();
    }

    // Random mode: time-based turret grants (always tick, even between waves).
    const modeCfg = MODES[state.mode];
    if (modeCfg && modeCfg.freeTurrets && !state.gameOver) {
      state.framesSinceGrant += 1;
      while (state.framesSinceGrant >= modeCfg.randomGrantFrames) {
        state.framesSinceGrant -= modeCfg.randomGrantFrames;
        state.turretQueue += 1;
      }
    }

    stepTurrets();
    stepEnemies();
    stepProjectiles();

    if (state.waveActive && state.spawnQueue.length === 0 && state.enemies.every(e => e.dead)) {
      state.waveActive = false;
      state.score += 25 * state.wave;
      state.money += 20 + state.wave * 2;
      const cfg = MODES[state.mode];
      if (state.wave >= cfg.maxWave) {
        endRun(true);
      } else if (cfg.autoAdvance) {
        state.nextWaveCountdown = cfg.autoAdvanceFrames;
      }
    }

    if (state.tick % 6 === 0) updateHUD();
    draw();
    requestAnimationFrame(gameLoop);
  }

  // --- Render ---------------------------------------------------------------
  function draw() {
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const cs = W / GRID_W;
    ctx.fillStyle = "#131a30";
    ctx.fillRect(0, 0, W, H);

    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const tile = state.map.grid[y][x];
        if (tile.kind === "path") {
          ctx.fillStyle = "#2a3358";
          ctx.fillRect(x * cs, y * cs, cs, cs);
        } else if (tile.kind === "defense") {
          ctx.fillStyle = "#7ad0ff";
          ctx.fillRect(x * cs + 2, y * cs + 2, cs - 4, cs - 4);
          ctx.fillStyle = "#04122a";
          ctx.font = `${cs * 0.6}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("⌂", x * cs + cs / 2, y * cs + cs / 2 + 1);
        }
      }
    }
    // Subtle accent fill on cells where a turret can actually be placed.
    if (!state.gameOver) {
      ctx.fillStyle = "rgba(122, 208, 255, 0.10)";
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          if (isEligibleCell(x, y)
              && !state.turrets.some(t => t.x === x && t.y === y)) {
            ctx.fillRect(x * cs, y * cs, cs, cs);
          }
        }
      }
    }

    ctx.strokeStyle = "#1a223e";
    ctx.lineWidth = 1;
    for (let x = 0; x <= GRID_W; x++) {
      ctx.beginPath(); ctx.moveTo(x * cs + 0.5, 0); ctx.lineTo(x * cs + 0.5, H); ctx.stroke();
    }
    for (let y = 0; y <= GRID_H; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * cs + 0.5); ctx.lineTo(W, y * cs + 0.5); ctx.stroke();
    }

    for (const tr of state.turrets) {
      const def = TURRETS[tr.type];
      const cx = tr.x * cs + cs / 2;
      const cy = tr.y * cs + cs / 2;
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(cx, cy, cs * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#0008";
      ctx.lineWidth = 2;
      ctx.stroke();
      // Level digit inside the turret. Dark ink on the bright fill, bold.
      ctx.fillStyle = "#0b1020";
      ctx.font = `700 ${Math.round(cs * 0.38)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(tr.level), cx, cy + 1);
    }

    for (const e of state.enemies) {
      if (e.dead) continue;
      const def = ENEMIES[e.type];
      const px = e.x * cs + cs / 2;
      const py = e.y * cs + cs / 2;
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(px, py, cs * def.size, 0, Math.PI * 2);
      ctx.fill();
      const hpPct = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = "#0008";
      ctx.fillRect(px - cs * 0.35, py - cs * 0.5, cs * 0.7, 3);
      ctx.fillStyle = hpPct > 0.5 ? "#8aff9e" : hpPct > 0.25 ? "#ffd86b" : "#ff6b8a";
      ctx.fillRect(px - cs * 0.35, py - cs * 0.5, cs * 0.7 * hpPct, 3);
    }

    for (const p of state.projectiles) {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x * cs, p.y * cs);
      ctx.lineTo(p.tx * cs, p.ty * cs);
      ctx.stroke();
    }
  }

  // --- Lifecycle ------------------------------------------------------------
  function applyModeDefaults() {
    const cfg = MODES[state.mode];
    state.turrets = [];
    state.enemies = [];
    state.projectiles = [];
    state.money = cfg.startMoney;
    state.lives = cfg.startLives;
    state.wave = 0;
    state.score = 0;
    state.waveActive = false;
    state.gameOver = false;
    state.won = false;
    state.spawnQueue = [];
    state.nextWaveCountdown = 0;
    state.startedAt = 0;
    state.elapsedMs = 0;
    if (cfg.freeTurrets) {
      state.turretQueue = cfg.randomSeedCount || 0;
      state.framesSinceGrant = 0;
      state.killsSinceGrant = 0;
      rollNextTurret();
    } else {
      state.turretQueue = 0;
      state.framesSinceGrant = 0;
      state.killsSinceGrant = 0;
    }
    syncRandomNext();
  }

  // Family + sub-selector resolve to a single mode key used everywhere else.
  // - daily               -> "daily"
  // - endless + difficulty -> "endless-<easy|normal|hard>"
  // - random + length      -> "random" | "random-infinite"
  let pickerDifficulty = "normal";
  let pickerLength = "finite";
  function modeKeyFor(family) {
    if (family === "daily") return "daily";
    if (family === "endless") return `endless-${pickerDifficulty}`;
    return pickerLength === "infinite" ? "random-infinite" : "random";
  }

  function setFamily(family) {
    const mode = modeKeyFor(family);
    if (!MODES[mode]) return;
    state.mode = mode;
    for (const el of elModeButtons) {
      el.classList.toggle("selected", el.dataset.family === family);
    }
    if (elDifficultyPicker) {
      elDifficultyPicker.classList.toggle("hidden", family !== "endless");
    }
    if (elRandomLengthPicker) {
      elRandomLengthPicker.classList.toggle("hidden", family !== "random");
    }
    applyModeAndRefresh();
  }

  function setDifficulty(difficulty) {
    pickerDifficulty = difficulty;
    for (const el of elDifficultyButtons) {
      el.classList.toggle("selected", el.dataset.difficulty === difficulty);
    }
    if (MODES[state.mode] && MODES[state.mode].family === "endless") {
      state.mode = modeKeyFor("endless");
      applyModeAndRefresh();
    }
  }

  function setLength(length) {
    pickerLength = length;
    for (const el of elRandomLengthButtons) {
      el.classList.toggle("selected", el.dataset.length === length);
    }
    if (MODES[state.mode] && MODES[state.mode].family === "random") {
      state.mode = modeKeyFor("random");
      applyModeAndRefresh();
    }
  }

  function syncRandomNext() {
    const cfg = MODES[state.mode];
    const isRandom = !!(cfg && cfg.freeTurrets);
    if (elRandomNext) elRandomNext.classList.toggle("hidden", !isRandom);
    if (elTurretGrid) elTurretGrid.classList.toggle("hidden", isRandom);
    if (!isRandom) return;

    const queue = state.turretQueue;
    const hasNext = queue > 0;
    const t = TURRETS[state.nextRandomTurret];
    if (!t) return;

    elRandomNextSwatch.style.background = hasNext ? t.color : "#3a4060";
    elRandomNextName.textContent = hasNext ? t.name : "Queue empty";
    elRandomNextSwatch.style.opacity = hasNext ? "1" : "0.55";

    const secsToGrant = Math.max(
      0,
      Math.ceil((cfg.randomGrantFrames - state.framesSinceGrant) / 60),
    );
    const killsToGrant = Math.max(
      0,
      cfg.randomKillsPerGrant - state.killsSinceGrant,
    );
    elRandomNextMeta.textContent =
      `queue ${queue} · next in ${secsToGrant}s or ${killsToGrant} kill${killsToGrant === 1 ? "" : "s"}`;
    document.getElementById("random-next-label").textContent = hasNext
      ? "Next turret — tap a cell to place"
      : "Waiting for next turret…";
  }

  function applyModeAndRefresh() {
    const mode = state.mode;
    applyModeDefaults();
    state.leaderboards[mode] = state.leaderboards[mode] || [];
    renderLeaderboard(state.leaderboards[mode]);
    fetchScores(state.dailyDate, mode).then(data => {
      state.leaderboards[mode] = data.scores || [];
      if (!state.gameOver) renderLeaderboard(state.leaderboards[mode]);
    });
    updateModeBody();
    updateHUD();
  }

  function updateModeBody() {
    const cfg = MODES[state.mode];
    if (cfg && cfg.family === "endless") {
      elOverlayBody.textContent =
        `${cfg.label}: $${cfg.startMoney} to start, ${cfg.startLives} lives. ` +
        "Waves never stop and get faster. Survive as long as you can.";
    } else if (cfg && cfg.family === "random") {
      const lengthBlurb = cfg.length === "infinite"
        ? "Waves never stop and get faster."
        : "12 waves to survive.";
      elOverlayBody.textContent =
        `Random mode: no money, no choice. ${lengthBlurb} ` +
        "Tap an eligible (highlighted) cell to drop the next random turret.";
    } else {
      elOverlayBody.textContent =
        "Defend the points. Tap a cell to place the selected turret. Up to 12 waves.";
    }
  }

  function resetRun() {
    applyModeDefaults();
    showOverlay({
      title: "Daily Defense",
      body: "",  // updateModeBody fills it in
      startVisible: true,
      submitVisible: false,
      pickerVisible: true,
      leaderboard: state.leaderboards[state.mode] || [],
    });
    updateModeBody();
    updateHUD();
  }

  function endRun(won) {
    state.gameOver = true;
    state.won = won;
    state.waveActive = false;
    state.nextWaveCountdown = 0;
    const cfg = MODES[state.mode];
    const isInfinite = cfg && cfg.maxWave === Infinity;
    const body = isInfinite
      ? `Survived ${formatElapsed(state.elapsedMs)} · wave ${state.wave} · score ${state.score}.`
      : `Final score: ${state.score}.`;
    showOverlay({
      title: won ? "Defended!" : "Defenses fell",
      body,
      startVisible: false,
      submitVisible: true,
      pickerVisible: false,
      leaderboard: state.leaderboards[state.mode] || [],
    });
    updateHUD();
  }

  function showOverlay({ title, body, startVisible, submitVisible, pickerVisible, leaderboard }) {
    elOverlayTitle.textContent = title;
    elOverlayBody.textContent = body;
    elOverlayStart.classList.toggle("hidden", !startVisible);
    elOverlaySubmit.classList.toggle("hidden", !submitVisible);
    if (elModePicker) elModePicker.classList.toggle("hidden", !pickerVisible);
    elOverlaySubmit.disabled = false;
    elOverlaySubmit.textContent = "Submit Score";
    renderLeaderboard(leaderboard || []);
    elOverlay.classList.remove("hidden");
  }
  function hideOverlay() { elOverlay.classList.add("hidden"); }

  function renderLeaderboard(rows) {
    if (!rows.length) { elOverlayLB.innerHTML = ""; return; }
    elOverlayLB.innerHTML = `<h4>Today's top</h4><ol>${
      rows.map(r => `<li><span>${escapeHtml(r.name)}</span><b>${r.score}</b></li>`).join("")
    }</ol>`;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  }

  activate(elOverlayStart, () => hideOverlay());
  activate(elOverlaySubmit, () => submitScore());
  activate(elStartWave, () => startWave());
  activate(elReset, () => resetRun());
  for (const btn of elModeButtons) {
    activate(btn, () => setFamily(btn.dataset.family));
  }
  for (const btn of elDifficultyButtons) {
    activate(btn, () => setDifficulty(btn.dataset.difficulty));
  }
  for (const btn of elRandomLengthButtons) {
    activate(btn, () => setLength(btn.dataset.length));
  }

  async function fetchDaily() {
    const r = await fetch("/api/daily");
    return r.json();
  }
  async function fetchScores(date, mode = "daily") {
    const r = await fetch(`/api/scores?date=${encodeURIComponent(date)}&mode=${encodeURIComponent(mode)}`);
    return r.json();
  }
  async function submitScore() {
    const name = (prompt("Name for the leaderboard (max 16 chars)", "anon") || "anon").slice(0, 16);
    const r = await fetch("/api/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: state.dailyDate,
        mode: state.mode,
        name,
        score: state.score,
      }),
    });
    if (r.ok) {
      const data = await r.json();
      state.leaderboards[state.mode] = data.top || [];
      renderLeaderboard(state.leaderboards[state.mode]);
      elOverlaySubmit.disabled = true;
      elOverlaySubmit.textContent = data.rank ? `Submitted (rank #${data.rank})` : "Submitted";
    } else {
      alert("Failed to submit score.");
    }
  }

  async function fetchVersion() {
    try {
      const r = await fetch("/health");
      const data = await r.json();
      return data.version || "?";
    } catch {
      return "?";
    }
  }

  async function init() {
    const [daily, version] = await Promise.all([fetchDaily(), fetchVersion()]);
    state.dailyDate = daily.date;
    state.map = generateMap(daily.seed);

    // Pre-fetch all leaderboards in parallel.
    const modes = [
      "daily",
      "endless-easy", "endless-normal", "endless-hard",
      "random", "random-infinite",
    ];
    const results = await Promise.all(modes.map(m => fetchScores(daily.date, m)));
    modes.forEach((m, i) => {
      state.leaderboards[m] = results[i].scores || [];
    });

    elAppVersion.textContent = `v${version}`;
    buildTurretButtons();
    resizeCanvas();
    requestAnimationFrame(() => { resizeCanvas(); resetRun(); state.running = true; gameLoop(); });
  }

  init().catch(err => {
    console.error(err);
    document.body.innerHTML = `<pre style="color:#ff6b8a;padding:20px">${escapeHtml(err.stack || err.message || String(err))}</pre>`;
  });
})();
