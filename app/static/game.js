(() => {
  "use strict";

  const GRID_W = 10;
  const GRID_H = 20;
  const STARTING_MONEY = 120;
  const STARTING_LIVES = 20;

  const TURRETS = {
    close:  { name: "Close",  cost: 30, range: 1.6, damage: 8,  cooldown: 18, color: "#7ad0ff", splash: 0,   key: "1" },
    medium: { name: "Medium", cost: 55, range: 3.2, damage: 14, cooldown: 36, color: "#ffd86b", splash: 0,   key: "2" },
    aoe:    { name: "AoE",    cost: 75, range: 2.4, damage: 9,  cooldown: 60, color: "#ff8af0", splash: 1.4, key: "3" },
  };

  const ENEMIES = {
    runner: { name: "Runner", hp: 22, speed: 0.035, color: "#8aff9e", bounty: 6,  size: 0.32 },
    tank:   { name: "Tank",   hp: 90, speed: 0.015, color: "#ff6b8a", bounty: 14, size: 0.42 },
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
  function waveSpec(n) {
    const runners = 6 + Math.floor(n * 3.5);
    const tanks = Math.max(0, Math.floor((n - 1) * 0.7));
    const spacing = Math.max(18, 50 - n * 2);
    const list = [];
    for (let i = 0; i < runners; i++) list.push("runner");
    for (let i = 0; i < tanks; i++) list.push("tank");
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return { types: list, spacing, hpMult: 1 + (n - 1) * 0.18 };
  }

  // --- Game state -----------------------------------------------------------
  const state = {
    map: null,
    selectedTurret: "close",
    turrets: [],
    enemies: [],
    projectiles: [],
    money: STARTING_MONEY,
    lives: STARTING_LIVES,
    wave: 0,
    score: 0,
    spawnQueue: [],
    spawnTimer: 0,
    waveActive: false,
    running: false,
    gameOver: false,
    won: false,
    dailyDate: null,
    tick: 0,
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

  function renderTurretButtons() {
    elTurretGrid.innerHTML = "";
    for (const [id, t] of Object.entries(TURRETS)) {
      const btn = document.createElement("button");
      btn.type = "button";
      const affordable = state.money >= t.cost;
      btn.className =
        "turret-btn" +
        (state.selectedTurret === id ? " selected" : "") +
        (affordable ? "" : " unaffordable");
      btn.dataset.turret = id;
      btn.innerHTML = `
        <span class="swatch" style="background:${t.color}"></span>
        <span class="meta">
          <strong>${t.name} — $${t.cost}</strong>
          <small>rng ${t.range.toFixed(1)} · dmg ${t.damage}${t.splash ? " · splash" : ""} · key ${t.key}</small>
        </span>`;
      activate(btn, () => {
        state.selectedTurret = id;
        renderTurretButtons();
      });
      elTurretGrid.appendChild(btn);
    }
  }

  function updateHUD() {
    elLives.textContent = state.lives;
    elMoney.textContent = state.money;
    elWave.textContent = state.wave;
    elScore.textContent = state.score;
    renderTurretButtons();
    elStartWave.disabled = state.waveActive || state.gameOver;
    elStartWave.textContent = state.gameOver
      ? (state.won ? "Run complete" : "Game over")
      : (state.wave === 0 ? "Start Wave 1" : `Start Wave ${state.wave + 1}`);
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

  function tryPlaceTurret(cell) {
    if (!cell || state.gameOver) return;
    const t = TURRETS[state.selectedTurret];
    const tile = state.map.grid[cell.y][cell.x];
    if (tile.kind !== "empty") return;
    if (state.turrets.some(tr => tr.x === cell.x && tr.y === cell.y)) return;
    if (state.money < t.cost) return;
    state.money -= t.cost;
    state.turrets.push({ x: cell.x, y: cell.y, type: state.selectedTurret, cd: 0 });
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
    const spec = waveSpec(state.wave);
    state.spawnQueue = spec.types.map(type => ({ type, hpMult: spec.hpMult }));
    state.spawnTimer = 0;
    state.spawnSpacing = spec.spacing;
    state.waveActive = true;
    updateHUD();
  }

  function spawnEnemy(type, hpMult) {
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
      speed: def.speed,
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
      const def = TURRETS[tr.type];
      let target = null;
      let bestProgress = -1;
      for (const e of state.enemies) {
        if (e.dead) continue;
        const dx = e.x - tr.x;
        const dy = e.y - tr.y;
        if (dx * dx + dy * dy > def.range * def.range) continue;
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
          color: def.color, life: 6,
          target, damage: def.damage, splash: def.splash,
        });
        tr.cd = def.cooldown;
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
            damageEnemy(e, p.damage);
          }
        }
      } else if (!p.target.dead) {
        damageEnemy(p.target, p.damage);
      }
    }
    state.projectiles = state.projectiles.filter(p => p.life > 0);
  }

  function damageEnemy(e, dmg) {
    if (e.dead) return;
    e.hp -= dmg;
    if (e.hp <= 0) {
      e.dead = true;
      state.money += e.bounty;
      state.score += Math.round(e.maxHp);
    }
  }

  // --- Game loop ------------------------------------------------------------
  function gameLoop() {
    if (!state.running) return;
    state.tick += 1;

    if (state.waveActive) {
      state.spawnTimer -= 1;
      if (state.spawnTimer <= 0 && state.spawnQueue.length > 0) {
        const next = state.spawnQueue.shift();
        spawnEnemy(next.type, next.hpMult);
        state.spawnTimer = state.spawnSpacing;
      }
    }

    stepTurrets();
    stepEnemies();
    stepProjectiles();

    if (state.waveActive && state.spawnQueue.length === 0 && state.enemies.every(e => e.dead)) {
      state.waveActive = false;
      state.score += 25 * state.wave;
      state.money += 20 + state.wave * 2;
      if (state.wave >= 12) endRun(true);
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
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(tr.x * cs + cs / 2, tr.y * cs + cs / 2, cs * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#0008";
      ctx.lineWidth = 2;
      ctx.stroke();
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
  function resetRun() {
    state.turrets = [];
    state.enemies = [];
    state.projectiles = [];
    state.money = STARTING_MONEY;
    state.lives = STARTING_LIVES;
    state.wave = 0;
    state.score = 0;
    state.waveActive = false;
    state.gameOver = false;
    state.won = false;
    state.spawnQueue = [];
    showOverlay({
      title: "Daily Defense",
      body: "Defend the points. Tap a cell to place the selected turret. Up to 12 waves.",
      startVisible: true,
      submitVisible: false,
      leaderboard: state.leaderboard,
    });
    updateHUD();
  }

  function endRun(won) {
    state.gameOver = true;
    state.won = won;
    state.waveActive = false;
    showOverlay({
      title: won ? "Defended!" : "Defenses fell",
      body: `Final score: ${state.score}.`,
      startVisible: false,
      submitVisible: true,
      leaderboard: state.leaderboard,
    });
    updateHUD();
  }

  function showOverlay({ title, body, startVisible, submitVisible, leaderboard }) {
    elOverlayTitle.textContent = title;
    elOverlayBody.textContent = body;
    elOverlayStart.classList.toggle("hidden", !startVisible);
    elOverlaySubmit.classList.toggle("hidden", !submitVisible);
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

  async function fetchDaily() {
    const r = await fetch("/api/daily");
    return r.json();
  }
  async function fetchScores(date) {
    const r = await fetch(`/api/scores?date=${encodeURIComponent(date)}`);
    return r.json();
  }
  async function submitScore() {
    const name = (prompt("Name for the leaderboard (max 16 chars)", "anon") || "anon").slice(0, 16);
    const r = await fetch("/api/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: state.dailyDate, name, score: state.score }),
    });
    if (r.ok) {
      const data = await r.json();
      state.leaderboard = data.top || [];
      renderLeaderboard(state.leaderboard);
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
    elDaily.textContent = `· daily ${daily.date}`;
    const scores = await fetchScores(daily.date);
    state.leaderboard = scores.scores || [];

    elAppVersion.textContent = `v${version}`;
    resizeCanvas();
    requestAnimationFrame(() => { resizeCanvas(); resetRun(); state.running = true; gameLoop(); });
  }

  init().catch(err => {
    console.error(err);
    document.body.innerHTML = `<pre style="color:#ff6b8a;padding:20px">${escapeHtml(err.stack || err.message || String(err))}</pre>`;
  });
})();
