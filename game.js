/* Paintball Wars 3D: a first-person version of Paintball Wars (johnjoo1/jesse_game).
   Plain JavaScript + Three.js r128 (global THREE). No build step. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  function showMessage(text) { $('msgText').textContent = text; $('msg').hidden = false; }
  if (!window.THREE) { showMessage("The 3D engine didn't load. Check your internet connection and refresh the page."); return; }
  const T = THREE;
  const TEST = new URLSearchParams(location.search).has('test'); // headless tests: no pointer lock needed

  // ---------- Tuning (carried over from the top-down game where it maps) ----------
  const ARENA = 100, HALF = ARENA / 2;   // meters
  const PLAYER_R = 0.45, EYE = 1.5, EYE_DUCK = 0.85; // ducking: about 1 m tall, so one block covers you
  const DUCK_SPEED = 0.45;
  const WALK = 6, SPRINT_MULT = 1.5, STAMINA_MAX = 2;
  const BOT_SPEED = 4.6;
  const GRAVITY = 22, JUMP_V = 7.5, STEP = 0.45; // jump clears about 1.7 m: crates and rocks yes, walls no
  const PLAYER_HP = 5, BOT_HP = 3;      // hits to splat a person / a bot
  const MAG_SIZE = 12, FIRE_DELAY = 0.16, RELOAD_TIME = 1.4;
  const BALL_SPEED = 42, BALL_GRAVITY = 7, BALL_LIFE = 2, BALL_R = 0.1;
  const RESPAWN_TIME = 3, SPAWN_SHIELD = 3;
  const NUM_BOTS = 8;
  const SIGHT = 42;                     // how far bots can spot someone
  const HIDE_NEAR = 4;                  // bots see you in a bush or tree only this close
  const COLORS = ['#ff3d7f', '#3da5ff', '#ffd23d', '#3dff8b', '#b03dff', '#ff8a3d', '#3dfff0', '#ff3d3d', '#9cff3d', '#ffffff'];
  const BOT_NAMES = ['Splatty', 'Blobby', 'Drip', 'Smudge', 'Neon', 'Goober', 'Pellet', 'Squish', 'Rainbow', 'Sploosh', 'Zippy', 'Mango',
    'Gloop', 'Speckle', 'Dribble', 'Fizz', 'Noodle', 'Puddle', 'Swirl', 'Bonk', 'Wobble', 'Spritz', 'Jelly', 'Blotch', 'Squirt', 'Doodle',
    'Gumdrop', 'Smoosh', 'Pip', 'Kaboom', 'Wiggles', 'Flick'];

  const eyeOf = (c) => c.y + (c.crouch ? EYE_DUCK : EYE);
  const midOf = (c) => c.y + (c.crouch ? 0.5 : 0.85); // where to aim at someone
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  function angDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
  function mulberry32(a) {
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  const tabStore = { // just this tab (two tabs on one device are two different players)
    get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };

  // ---------- Renderer, scene, cameras ----------
  const canvas = $('view');
  const coarse = matchMedia('(pointer: coarse)').matches;
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas, antialias: !coarse, powerPreference: 'high-performance' });
  } catch (e) { showMessage("This browser can't show 3D graphics (WebGL is off or not supported)."); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
  renderer.autoClear = false;
  renderer.info.autoReset = false; // count both render passes per frame
  const SKY = 0xbfe6ff;
  const scene = new T.Scene();
  scene.fog = new T.Fog(SKY, 35, 95);
  const camera = new T.PerspectiveCamera(72, 1, 0.05, 130);
  camera.rotation.order = 'YXZ';
  scene.add(new T.HemisphereLight(0xe4f4ff, 0x6f9a4c, 0.8));
  const sun = new T.DirectionalLight(0xffffff, 0.75);
  sun.position.set(0.5, 1, 0.35);
  scene.add(sun);

  // The gun in your hands is drawn in its own little scene so it never pokes into walls.
  const vmScene = new T.Scene();
  const vmCamera = new T.PerspectiveCamera(60, 1, 0.01, 5);
  vmScene.add(new T.HemisphereLight(0xffffff, 0x8899aa, 0.9));
  const vmSun = new T.DirectionalLight(0xffffff, 0.6); vmSun.position.set(0.3, 1, 0.6); vmScene.add(vmSun);

  { // gradient sky dome that follows the camera
    const g = new T.SphereGeometry(120, 16, 10);
    const top = new T.Color(0x5fb4ff), mid = new T.Color(SKY), cols = [];
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const c = mid.clone().lerp(top, clamp(p.getY(i) / 70, 0, 1)); cols.push(c.r, c.g, c.b); }
    g.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
    const sky = new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -1;
    sky.onBeforeRender = () => sky.position.copy(camera.position);
    scene.add(sky);
  }

  // ---------- Canvas textures ----------
  function canvasTex(size, draw) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    draw(c.getContext('2d'), size);
    return c;
  }
  // A paint splat: one big blob, a ring of smaller blobs and a few flung droplets. White, so it can be tinted.
  function drawBlob(ctx, s, seed) {
    const r = mulberry32(seed), cx = s / 2;
    ctx.fillStyle = '#fff';
    const circle = (x, y, rad) => { ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill(); };
    circle(cx, cx, s * 0.26);
    for (let i = 0; i < 11; i++) {
      const a = r() * Math.PI * 2, d = s * (0.14 + r() * 0.14);
      circle(cx + Math.cos(a) * d, cx + Math.sin(a) * d, s * (0.06 + r() * 0.08));
    }
    for (let i = 0; i < 8; i++) {
      const a = r() * Math.PI * 2, d = s * (0.32 + r() * 0.14);
      circle(cx + Math.cos(a) * d, cx + Math.sin(a) * d, s * (0.015 + r() * 0.03));
    }
  }
  const blobCanvas = canvasTex(128, (ctx, s) => drawBlob(ctx, s, 7));
  const blobTex = new T.CanvasTexture(blobCanvas);
  const blobURL = blobCanvas.toDataURL();
  const dotTex = new T.CanvasTexture(canvasTex(32, (ctx, s) => { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2 - 1, 0, Math.PI * 2); ctx.fill(); }));
  const grassTex = new T.CanvasTexture(canvasTex(256, (ctx, s) => {
    ctx.fillStyle = '#7ccf5a'; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(0, 0, s, s / 2); // mowed stripes
    const r = mulberry32(3);
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = r() < 0.5 ? 'rgba(40,110,30,0.22)' : 'rgba(200,255,150,0.18)';
      ctx.fillRect(r() * s, r() * s, 2, 2 + r() * 3);
    }
  }));
  grassTex.wrapS = grassTex.wrapT = T.RepeatWrapping;
  grassTex.repeat.set(ARENA / 8, ARENA / 8);
  const crateTex = new T.CanvasTexture(canvasTex(128, (ctx, s) => {
    ctx.fillStyle = '#d9a35b'; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#c38a45';
    for (let i = 1; i < 4; i++) ctx.fillRect(0, i * s / 4 - 2, s, 3);
    ctx.strokeStyle = '#9c6a2f'; ctx.lineWidth = 12; ctx.strokeRect(6, 6, s - 12, s - 12);
    ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(10, 10); ctx.lineTo(s - 10, s - 10); ctx.stroke();
  }));

  // ---------- The arena: solid boxes and ramps (everything sits on the ground) ----------
  // Collision is a height field: at any spot, the ground is as high as the tallest box or ramp there.
  // You can step up 0.45 m, jump onto anything up to about 1.7 m, and walk up ramps onto towers.
  const solids = [];       // {x0,x1,z0,z1,h, ramp?, axis, dir}
  const hideZones = [];    // bushes and trees: {x,z,r,top}
  const leafBalls = [];    // spheres of foliage that block sight: {x,y,z,r}
  const CELL = 4, GN = Math.ceil(ARENA / CELL);
  const grid = Array.from({ length: GN * GN }, () => []);
  const cellOf = (v) => clamp(Math.floor((v + HALF) / CELL), 0, GN - 1);
  function addSolid(o) {
    solids.push(o);
    for (let j = cellOf(o.z0); j <= cellOf(o.z1); j++) for (let i = cellOf(o.x0); i <= cellOf(o.x1); i++) grid[j * GN + i].push(o);
    return o;
  }
  function removeSolid(o) {
    solids.splice(solids.indexOf(o), 1);
    for (let j = cellOf(o.z0); j <= cellOf(o.z1); j++) for (let i = cellOf(o.x0); i <= cellOf(o.x1); i++) {
      const cell = grid[j * GN + i], k = cell.indexOf(o);
      if (k >= 0) cell.splice(k, 1);
    }
  }
  function rampHeight(o, x, z) { // ramp surface height at the point of its footprint nearest to (x, z)
    const t = o.axis === 'x' ? (clamp(x, o.x0, o.x1) - o.x0) / (o.x1 - o.x0) : (clamp(z, o.z0, o.z1) - o.z0) / (o.z1 - o.z0);
    return o.h * (o.dir > 0 ? t : 1 - t);
  }
  // a rock's surface height at the point of (x, z, r) nearest its middle (rocks are rounded, like they look)
  function ellHeight(e, x, z, r) {
    const dx = x - e.cx, dz = z - e.cz, d = Math.hypot(dx, dz), k = d > r ? (d - r) / d : 0;
    const q = ((dx * k) / e.rx) ** 2 + ((dz * k) / e.rz) ** 2;
    return q >= 1 ? 0 : e.ry * Math.sqrt(1 - q);
  }
  function heightAt(x, z, r) {
    let h = 0;
    const i0 = cellOf(x - r), i1 = cellOf(x + r), j0 = cellOf(z - r), j1 = cellOf(z + r);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cell = grid[j * GN + i];
      for (let k = 0; k < cell.length; k++) {
        const o = cell[k];
        if (x + r <= o.x0 || x - r >= o.x1 || z + r <= o.z0 || z - r >= o.z1) continue;
        const oh = o.ramp ? rampHeight(o, x, z) : o.ell ? ellHeight(o.ell, x, z, r) : o.h;
        if (oh > h) h = oh;
      }
    }
    return h;
  }
  function solidAtPoint(x, z, y) { // the box or ramp that contains this point, if any
    const cell = grid[cellOf(z) * GN + cellOf(x)];
    for (let k = 0; k < cell.length; k++) {
      const o = cell[k];
      if (x <= o.x0 || x >= o.x1 || z <= o.z0 || z >= o.z1) continue;
      if (o.ell) { const e = o.ell; if (((x - e.cx) / e.rx) ** 2 + (y / e.ry) ** 2 + ((z - e.cz) / e.rz) ** 2 < 1) return o; continue; }
      if (o.cyl) { const c = o.cyl; if (y >= c.y0 && y < c.y0 + c.h && Math.hypot(x - c.cx, z - c.cz) < cylR(c, y)) return o; continue; }
      if (y < (o.ramp ? rampHeight(o, x, z) : o.h) && (o.y0 == null || y >= o.y0 - 0.02)) return o;
    }
    return null;
  }
  const cylR = (c, y) => c.r0 + (c.r1 - c.r0) * clamp((y - c.y0) / c.h, 0, 1); // a trunk is thicker at the bottom
  // the thing whose surface is highest right at (x, z)
  function topAt(x, z) {
    let best = null, bh = 0.02;
    for (const o of grid[cellOf(z) * GN + cellOf(x)]) {
      if (x <= o.x0 || x >= o.x1 || z <= o.z0 || z >= o.z1) continue;
      const h = o.ramp ? rampHeight(o, x, z) : o.ell ? ellHeight(o.ell, x, z, 0) : o.cyl ? 0 : o.h;
      if (h > bh) { bh = h; best = o; }
    }
    return best;
  }
  function concealed(p) {
    for (const h of hideZones) if (p.y < h.top - 0.6 && (p.x - h.x) ** 2 + (p.z - h.z) ** 2 < h.r * h.r) return true;
    return false;
  }
  // Can someone at A see point B? Boxes block, and so does foliage (unless one end is inside it).
  function clearLine(ax, ay, az, bx, by, bz, foliage) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
    const n = Math.ceil(len / 0.35);
    for (let k = 1; k < n; k++) {
      const t = k / n, x = ax + dx * t, y = ay + dy * t, z = az + dz * t;
      if (y < heightAt(x, z, 0)) return false;
    }
    if (foliage) for (const s of leafBalls) {
      const ex = s.x - ax, ey = s.y - ay, ez = s.z - az;
      const t = clamp((ex * dx + ey * dy + ez * dz) / (len * len || 1), 0, 1);
      const px = ax + dx * t - s.x, py = ay + dy * t - s.y, pz = az + dz * t - s.z;
      const rr = s.r * 0.85;
      if (px * px + py * py + pz * pz < rr * rr) {
        const inA = ex * ex + ey * ey + ez * ez < s.r * s.r;
        const bx2 = bx - s.x, by2 = by - s.y, bz2 = bz - s.z, inB = bx2 * bx2 + by2 * by2 + bz2 * bz2 < s.r * s.r;
        if (!inA && !inB) return false;
      }
    }
    return true;
  }

  const boxInst = [], crateInst = [], rockInst = [], trunkInst = [], coneInst = [], bushInst = [];
  const rampMeshes = [];
  const WALL_COLORS = ['#5aa9e6', '#ff8fab', '#ffd166', '#7bd389', '#c3a6ff', '#ffa45c'];
  const markers = []; // map drawing: {x0,x1,z0,z1,kind}
  function buildArena() {
    const rng = mulberry32(20261007), R = (a, b) => a + (b - a) * rng(), RP = (arr) => arr[(rng() * arr.length) | 0];
    const taken = [];
    const isFree = (x0, x1, z0, z1, m) => {
      if (x0 < -HALF + 3 || x1 > HALF - 3 || z0 < -HALF + 3 || z1 > HALF - 3) return false;
      for (const t of taken) if (x0 - m < t.x1 && x1 + m > t.x0 && z0 - m < t.z1 && z1 + m > t.z0) return false;
      return true;
    };
    const take = (x0, x1, z0, z1) => taken.push({ x0, x1, z0, z1 });
    const box = (cx, cz, w, d, h, kind, color) => {
      const o = addSolid({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, h, kind });
      (kind === 'crate' ? crateInst : boxInst).push({ x: cx, z: cz, w, d, h, color });
      markers.push(o);
      return o;
    };
    const ramp = (x0, x1, z0, z1, h, axis, dir) => {
      const o = addSolid({ x0, x1, z0, z1, h, ramp: true, axis, dir, kind: 'ramp' });
      rampMeshes.push(o); markers.push(o);
      return o;
    };

    // Center tower with ramps north and south, inside a ring of walls with wide gaps.
    box(0, 0, 6, 6, 2.6, 'tower', '#ffd166');
    ramp(-1.3, 1.3, -10, -3, 2.6, 'z', 1);
    ramp(-1.3, 1.3, 3, 10, 2.6, 'z', -1);
    take(-4, 4, -11, 11);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const c = RP(WALL_COLORS);
      box(sx * 9, sz * 12.5, 7, 0.7, 2.4, 'wall', c); take(sx * 9 - 3.5, sx * 9 + 3.5, sz * 12.5 - 0.35, sz * 12.5 + 0.35);
      box(sx * 12.5, sz * 9, 0.7, 7, 2.4, 'wall', c); take(sx * 12.5 - 0.35, sx * 12.5 + 0.35, sz * 9 - 3.5, sz * 9 + 3.5);
    }
    // A platform in each corner area, with a ramp on the side facing the middle.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const cx = sx * 31, cz = sz * 31;
      box(cx, cz, 7, 6, 2.4, 'tower', RP(WALL_COLORS));
      const near = cx - sx * 3.5;                       // edge facing the middle
      const far = near - sx * 6.5;
      ramp(Math.min(near, far), Math.max(near, far), cz - 1.3, cz + 1.3, 2.4, 'x', sx > 0 ? 1 : -1);
      take(Math.min(cx - 3.5, far) , Math.max(cx + 3.5, far), cz - 3, cz + 3);
    }
    // Climbing stacks on the east and west: crate, double crate, then a tall wall-top lookout.
    for (const sx of [-1, 1]) {
      const cx = sx * 34;
      box(cx, 0, 3, 3, 2.4, 'tower', '#c3a6ff');
      box(cx - sx * 2.75, 0, 2.5, 2.5, 1.2, 'crate');
      take(cx - 4.5, cx + 4.5, -2, 2);
    }
    // Long tall walls and low walls you can hop onto.
    let tries = 0, walls = 0;
    while (walls < 18 && tries++ < 600) {
      const tall = walls < 11, len = R(4, 8), horiz = rng() < 0.5;
      const w = horiz ? len : 0.7, d = horiz ? 0.7 : len, h = tall ? 2.4 : 1.1;
      const cx = R(-HALF + 6, HALF - 6), cz = R(-HALF + 6, HALF - 6);
      if (!isFree(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, 3)) continue;
      box(cx, cz, w, d, h, 'wall', RP(WALL_COLORS)); take(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2); walls++;
    }
    // Crate clusters, some stacked two high.
    tries = 0; let clusters = 0;
    while (clusters < 11 && tries++ < 600) {
      const cx = R(-HALF + 6, HALF - 6), cz = R(-HALF + 6, HALF - 6), S = 1.25;
      if (!isFree(cx - 2 * S, cx + 2 * S, cz - 2 * S, cz + 2 * S, 2.2)) continue;
      const slots = [];
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) slots.push([i, j]);
      slots.sort(() => rng() - 0.5);
      const n = 2 + ((rng() * 4) | 0);
      for (let k = 0; k < n; k++) {
        const [i, j] = slots[k];
        box(cx + i * S, cz + j * S, 1.2, 1.2, k > 0 && rng() < 0.3 ? 2.4 : 1.2, 'crate');
      }
      take(cx - 2 * S, cx + 2 * S, cz - 2 * S, cz + 2 * S); clusters++;
    }
    // Rocks.
    tries = 0; let rocks = 0;
    while (rocks < 12 && tries++ < 600) {
      const w = R(1.4, 2.8), d = R(1.4, 2.8), h = R(0.7, 1.5), cx = R(-HALF + 5, HALF - 5), cz = R(-HALF + 5, HALF - 5);
      if (!isFree(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, 2.5)) continue;
      const o = addSolid({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, h, kind: 'rock',
        ell: { cx, cz, rx: (w / 2) * 0.96, ry: h * 0.96, rz: (d / 2) * 0.96 } }); // rounded, the way it looks
      markers.push(o);
      const g = 0.55 + rng() * 0.2;
      rng(); // (rocks used to turn a random way)
      rockInst.push({ x: cx, z: cz, sx: w / 2, sy: h, sz: d / 2, ry: 0, color: new T.Color(g, g, g * 1.05) });
      take(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2); rocks++;
    }
    // Pine trees with low, thick branches you can hide in. Only the trunk is solid.
    tries = 0; let trees = 0;
    while (trees < 16 && tries++ < 600) {
      const cx = R(-HALF + 5, HALF - 5), cz = R(-HALF + 5, HALF - 5);
      if (!isFree(cx - 2, cx + 2, cz - 2, cz + 2, 1.5)) continue;
      addSolid({ x0: cx - 0.3, x1: cx + 0.3, z0: cz - 0.3, z1: cz + 0.3, h: 4, kind: 'trunk', cyl: { cx, cz, y0: 0, h: 4.2, r0: 0.32, r1: 0.22 } });
      trunkInst.push({ x: cx, z: cz, h: 4.2 });
      const g = new T.Color().setHSL(0.31 + rng() * 0.06, 0.55, 0.3 + rng() * 0.08);
      coneInst.push({ x: cx, y: 0.35, z: cz, r: 2.2, h: 2.7, color: g, ry: rng() * 6 });
      coneInst.push({ x: cx, y: 2.1, z: cz, r: 1.6, h: 2.1, color: g.clone().offsetHSL(0, 0, 0.04), ry: rng() * 6 });
      coneInst.push({ x: cx, y: 3.5, z: cz, r: 1.0, h: 1.7, color: g.clone().offsetHSL(0, 0, 0.08), ry: rng() * 6 });
      hideZones.push({ x: cx, z: cz, r: 1.9, top: 2.8, kind: 'tree' });
      leafBalls.push({ x: cx, y: 1.3, z: cz, r: 1.7 }, { x: cx, y: 2.9, z: cz, r: 1.2 });
      take(cx - 2, cx + 2, cz - 2, cz + 2); trees++;
    }
    // Bushes: walk right in. Nothing solid.
    tries = 0; let bushes = 0;
    while (bushes < 26 && tries++ < 800) {
      const cx = R(-HALF + 4, HALF - 4), cz = R(-HALF + 4, HALF - 4), r = R(1.3, 1.7);
      if (!isFree(cx - r, cx + r, cz - r, cz + r, 0.8)) continue;
      const g = new T.Color().setHSL(0.27 + rng() * 0.08, 0.6, 0.36 + rng() * 0.1);
      bushInst.push({ x: cx, y: 0.65, z: cz, sx: r, sy: r * 0.72, sz: r, color: g });
      for (let k = 0; k < 2; k++) {
        const a = rng() * 6.28, d = r * 0.45;
        bushInst.push({ x: cx + Math.cos(a) * d, y: 0.5, z: cz + Math.sin(a) * d, sx: r * 0.7, sy: r * 0.6, sz: r * 0.7, color: g.clone().offsetHSL(0, 0, (rng() - 0.5) * 0.08) });
      }
      hideZones.push({ x: cx, z: cz, r: r * 0.95, top: 1.75, kind: 'bush' });
      leafBalls.push({ x: cx, y: 0.75, z: cz, r: r * 0.95 });
      take(cx - r, cx + r, cz - r, cz + r); bushes++;
    }
  }
  buildArena();

  function buildArenaMeshes() {
    const m4 = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3(), p = new T.Vector3(), c = new T.Color();
    const up = new T.Vector3(0, 1, 0);
    function instanced(geo, mat, list, fill) {
      const mesh = new T.InstancedMesh(geo, mat, list.length);
      list.forEach((it, i) => { fill(it); m4.compose(p, q, s); mesh.setMatrixAt(i, m4); mesh.setColorAt(i, c); });
      scene.add(mesh);
      return mesh;
    }
    const unitBox = new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    // fence around the outside
    const fence = [];
    for (const [x, z, w, d] of [[0, -HALF - 0.5, ARENA + 2, 1], [0, HALF + 0.5, ARENA + 2, 1], [-HALF - 0.5, 0, 1, ARENA], [HALF + 0.5, 0, 1, ARENA]])
      fence.push({ x, z, w, d, h: 3.2, color: '#f4f6fb' });
    for (const [x, z, w, d] of [[0, -HALF - 0.2, ARENA, 0.3], [0, HALF + 0.2, ARENA, 0.3], [-HALF - 0.2, 0, 0.3, ARENA], [HALF + 0.2, 0, 0.3, ARENA]])
      fence.push({ x, z, w, d, h: 0.5, color: '#ff8fab', y: 2.4 });
    instanced(unitBox, new T.MeshLambertMaterial(), [...boxInst, ...fence], (b) => {
      p.set(b.x, b.y || 0, b.z); q.identity(); s.set(b.w, b.h, b.d); c.set(b.color);
    });
    instanced(unitBox, new T.MeshLambertMaterial({ map: crateTex }), crateInst, (b) => {
      p.set(b.x, 0, b.z); q.identity(); s.set(b.w, b.h, b.d); c.set(0xffffff);
    });
    const rockGeo = new T.IcosahedronGeometry(1, 1).toNonIndexed(); rockGeo.computeVertexNormals(); // low-poly, round enough for paint to sit on
    instanced(rockGeo, new T.MeshLambertMaterial(), rockInst, (r) => {
      p.set(r.x, 0, r.z); q.setFromAxisAngle(up, r.ry); s.set(r.sx, r.sy, r.sz); c.copy(r.color);
    });
    instanced(new T.CylinderGeometry(0.22, 0.32, 1, 6).translate(0, 0.5, 0), new T.MeshLambertMaterial(), trunkInst, (t) => {
      p.set(t.x, 0, t.z); q.identity(); s.set(1, t.h, 1); c.set('#8a5a32');
    });
    // a few trees outside the fence so the horizon isn't empty
    const rng = mulberry32(99), outside = [];
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + rng() * 0.1, d = HALF + 8 + rng() * 18;
      const g = new T.Color().setHSL(0.31 + rng() * 0.05, 0.5, 0.32);
      const sc = 1.4 + rng() * 1.2;
      outside.push({ x: Math.cos(a) * d, y: 0, z: Math.sin(a) * d, r: 2.4 * sc, h: 4 * sc, color: g, ry: 0 });
      outside.push({ x: Math.cos(a) * d, y: 2.6 * sc, z: Math.sin(a) * d, r: 1.6 * sc, h: 3 * sc, color: g, ry: 0 });
    }
    instanced(new T.ConeGeometry(1, 1, 8).translate(0, 0.5, 0), new T.MeshLambertMaterial(), [...coneInst, ...outside], (k) => {
      p.set(k.x, k.y, k.z); q.setFromAxisAngle(up, k.ry); s.set(k.r, k.h, k.r); c.copy(k.color);
    });
    instanced(new T.IcosahedronGeometry(1, 1), new T.MeshLambertMaterial(), bushInst, (b) => {
      p.set(b.x, b.y, b.z); q.identity(); s.set(b.sx, b.sy, b.sz); c.copy(b.color);
    });
    // ramps: a wedge rising along +x, bottom face left out
    const v = [0, 0, -0.5, 0, 0, 0.5, 1, 1, 0.5, 0, 0, -0.5, 1, 1, 0.5, 1, 1, -0.5,   // slope
      1, 0, -0.5, 1, 1, -0.5, 1, 1, 0.5, 1, 0, -0.5, 1, 1, 0.5, 1, 0, 0.5,            // high end
      0, 0, -0.5, 1, 1, -0.5, 1, 0, -0.5, 0, 0, 0.5, 1, 0, 0.5, 1, 1, 0.5];           // sides
    const wedge = new T.BufferGeometry();
    wedge.setAttribute('position', new T.Float32BufferAttribute(v, 3));
    wedge.computeVertexNormals();
    const rampMat = new T.MeshLambertMaterial({ color: '#ff9f43' });
    for (const o of rampMeshes) {
      const m = new T.Mesh(wedge, rampMat);
      const L = o.axis === 'x' ? o.x1 - o.x0 : o.z1 - o.z0, W = o.axis === 'x' ? o.z1 - o.z0 : o.x1 - o.x0;
      m.scale.set(L, o.h, W);
      if (o.axis === 'x') { m.position.set(o.dir > 0 ? o.x0 : o.x1, 0, (o.z0 + o.z1) / 2); m.rotation.y = o.dir > 0 ? 0 : Math.PI; }
      else { m.position.set((o.x0 + o.x1) / 2, 0, o.dir > 0 ? o.z0 : o.z1); m.rotation.y = o.dir > 0 ? -Math.PI / 2 : Math.PI / 2; }
      scene.add(m);
    }
    const ground = new T.Mesh(new T.PlaneGeometry(ARENA + 120, ARENA + 120), new T.MeshLambertMaterial({ map: grassTex }));
    grassTex.repeat.set((ARENA + 120) / 8, (ARENA + 120) / 8);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
  }
  buildArenaMeshes();

  // Open spots on the ground, for spawning and for bots to wander to.
  const navPoints = [];
  for (let x = -HALF + 3; x <= HALF - 3; x += 3) for (let z = -HALF + 3; z <= HALF - 3; z += 3) {
    const p = { x, z, y: 0 };
    if (heightAt(x, z, 0.9) === 0 && !concealed(p)) navPoints.push(p);
  }

  // ---------- Paint that stays on things (one instanced mesh, recycled) ----------
  const MAX_DECALS = 700;
  const decals = new T.InstancedMesh(new T.PlaneGeometry(1, 1),
    new T.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    MAX_DECALS);
  decals.frustumCulled = false;
  const _m4 = new T.Matrix4(), _q = new T.Quaternion(), _q2 = new T.Quaternion(), _v = new T.Vector3(), _s = new T.Vector3(), _c = new T.Color();
  const ZAXIS = new T.Vector3(0, 0, 1);
  { _m4.makeScale(0, 0, 0); for (let i = 0; i < MAX_DECALS; i++) { decals.setMatrixAt(i, _m4); decals.setColorAt(i, _c.set(0xffffff)); } }
  decals.count = 0;
  scene.add(decals);
  let decalNext = 0;
  const decalPos = new Float32Array(MAX_DECALS * 3);
  const _n = new T.Vector3();
  function addDecal(x, y, z, nx, ny, nz, color, size) {
    const i = decalNext; decalNext = (decalNext + 1) % MAX_DECALS;
    decals.count = Math.max(decals.count, i + 1);
    _n.set(nx, ny, nz);
    _q.setFromUnitVectors(ZAXIS, _n);
    _q2.setFromAxisAngle(ZAXIS, Math.random() * Math.PI * 2);
    _q.multiply(_q2);
    _v.set(x + nx * 0.012, y + ny * 0.012, z + nz * 0.012);
    decalPos[i * 3] = x; decalPos[i * 3 + 1] = y; decalPos[i * 3 + 2] = z;
    _m4.compose(_v, _q, _s.set(size, size, 1));
    decals.setMatrixAt(i, _m4);
    decals.setColorAt(i, _c.set(color));
    decals.instanceMatrix.needsUpdate = true;
    decals.instanceColor.needsUpdate = true;
  }
  function clearDecals() { decals.count = 0; decalNext = 0; }
  // (for the tests) splats whose rim hangs in the air: a point just behind the paint should be inside something
  function paintCheck(firstBad) {
    const m = new T.Matrix4(), ex = new T.Vector3(), ey = new T.Vector3(), ez = new T.Vector3(), pos = new T.Vector3();
    let floating = 0, total = 0; const kinds = {};
    const solidHere = (x, y, z) => y <= 0 || ((Math.abs(x) >= HALF || Math.abs(z) >= HALF) && y < 3.2) || !!solidAtPoint(x, z, y);
    for (let i = 0; i < decals.count; i++) {
      decals.getMatrixAt(i, m); m.extractBasis(ex, ey, ez); pos.setFromMatrixPosition(m);
      const size = ex.length();
      if (size < 1e-3) continue; // a hidden one
      total++; ex.normalize(); ey.normalize(); ez.normalize();
      let bad = false;
      for (let k = 0; k < 12 && !bad; k++) {
        const a = (k / 12) * Math.PI * 2, r = size * 0.4, cs = Math.cos(a) * r, sn = Math.sin(a) * r;
        const x = pos.x + ex.x * cs + ey.x * sn - ez.x * 0.08, y = pos.y + ex.y * cs + ey.y * sn - ez.y * 0.08, z = pos.z + ex.z * cs + ey.z * sn - ez.z * 0.08;
        if (!solidHere(x, y, z)) bad = true;
      }
      if (!bad) continue;
      if (firstBad) return { x: pos.x, y: pos.y, z: pos.z };
      floating++;
      const o = solidAtPoint(pos.x - ez.x * 0.05, pos.z - ez.z * 0.05, pos.y - ez.y * 0.05);
      const k = o ? o.kind : pos.y < 0.05 ? 'ground' : 'air';
      kinds[k] = (kinds[k] || 0) + 1;
    }
    return firstBad ? null : { total, floating, kinds: Object.entries(kinds).map(([k, v]) => k + ' ' + v).join(', ') };
  }
  function hideDecalsIn(o) { // paint on something that just broke goes with it
    _m4.makeScale(0, 0, 0);
    for (let i = 0; i < decals.count; i++) {
      const x = decalPos[i * 3], y = decalPos[i * 3 + 1], z = decalPos[i * 3 + 2];
      if (x > o.x0 - 0.05 && x < o.x1 + 0.05 && z > o.z0 - 0.05 && z < o.z1 + 0.05 && y > Math.max(0.02, (o.y0 || 0) - 0.02) && y < o.h + 0.05) decals.setMatrixAt(i, _m4);
    }
    decals.instanceMatrix.needsUpdate = true;
  }

  // ---------- Paint bursts (one Points object) ----------
  const MAX_PARTS = 600;
  const partPos = new Float32Array(MAX_PARTS * 3).fill(-999), partCol = new Float32Array(MAX_PARTS * 3);
  const partGeo = new T.BufferGeometry();
  partGeo.setAttribute('position', new T.BufferAttribute(partPos, 3));
  partGeo.setAttribute('color', new T.BufferAttribute(partCol, 3));
  const partsMesh = new T.Points(partGeo, new T.PointsMaterial({ size: 0.2, vertexColors: true, map: dotTex, alphaTest: 0.5 }));
  partsMesh.frustumCulled = false;
  scene.add(partsMesh);
  const parts = []; let partNext = 0;
  function burst(x, y, z, color, n, speed, size) {
    _c.set(color);
    for (let k = 0; k < n; k++) {
      const i = partNext; partNext = (partNext + 1) % MAX_PARTS;
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = speed * (0.4 + Math.random() * 0.8), h = Math.sqrt(1 - u * u);
      parts[i] = { x, y, z, vx: Math.cos(a) * h * s, vy: Math.abs(u) * s * 0.9 + speed * 0.3, vz: Math.sin(a) * h * s, life: 0.5 + Math.random() * 0.5 };
      partCol[i * 3] = _c.r; partCol[i * 3 + 1] = _c.g; partCol[i * 3 + 2] = _c.b;
    }
    partGeo.attributes.color.needsUpdate = true;
  }
  function updateParts(dt) {
    for (let i = 0; i < MAX_PARTS; i++) {
      const p = parts[i];
      if (!p) continue;
      p.life -= dt;
      p.vy -= 14 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.life <= 0 || p.y < 0) { parts[i] = null; partPos[i * 3 + 1] = -999; continue; }
      partPos[i * 3] = p.x; partPos[i * 3 + 1] = p.y; partPos[i * 3 + 2] = p.z;
    }
    partGeo.attributes.position.needsUpdate = true;
  }

  // ---------- Sounds (made on the fly, no files) ----------
  let ac = null, master = null, noiseBuf = null;
  function initAudio() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.55; master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ac = null; }
  }
  function tone(f1, f2, dur, type, vol, delay = 0) {
    if (!ac) return;
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, freq, q, vol, type = 'bandpass', delay = 0) {
    if (!ac) return;
    const t = ac.currentTime + delay, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02);
  }
  const sfx = {
    shot(v = 1) { noise(0.07, 1500, 1.2, 0.45 * v); tone(240, 90, 0.08, 'sine', 0.35 * v); },
    splat(v = 1) { noise(0.2, 700, 0.7, 0.55 * v, 'lowpass'); tone(330, 110, 0.14, 'triangle', 0.25 * v); },
    hit() { tone(1350, 1300, 0.05, 'square', 0.1); this.splat(0.5); },
    kill() { this.splat(1.3); tone(523, 523, 0.1, 'triangle', 0.3, 0.06); tone(784, 784, 0.18, 'triangle', 0.3, 0.15); },
    hurt() { noise(0.16, 380, 0.8, 0.6, 'lowpass'); tone(170, 70, 0.16, 'sine', 0.45); },
    splatted() { noise(0.4, 500, 0.6, 0.7, 'lowpass'); tone(400, 90, 0.5, 'triangle', 0.3); },
    reload() { tone(900, 700, 0.04, 'square', 0.08); tone(700, 950, 0.05, 'square', 0.08, 0.3); },
    empty() { tone(1800, 1600, 0.03, 'square', 0.06); },
    block() { tone(900, 1700, 0.09, 'sine', 0.18); },
    spawn() { tone(440, 880, 0.18, 'sine', 0.15); },
    pick() { tone(523, 523, 0.08, 'sine', 0.18); tone(659, 659, 0.08, 'sine', 0.18, 0.07); tone(784, 784, 0.16, 'sine', 0.18, 0.14); },
    place(v = 1) { tone(220, 120, 0.12, 'triangle', 0.3 * v); noise(0.08, 500, 0.8, 0.25 * v, 'lowpass'); },
    heal() { tone(880, 1320, 0.15, 'sine', 0.12); },
    boom(v = 1) { noise(0.5, 300, 0.5, 0.9 * v, 'lowpass'); tone(160, 40, 0.5, 'sine', 0.6 * v); },
  };

  // ---------- Characters ----------
  const shared = {
    body: new T.SphereGeometry(0.5, 14, 10),
    eye: new T.SphereGeometry(0.11, 10, 8),
    pupil: new T.SphereGeometry(0.055, 8, 6),
    band: new T.CylinderGeometry(0.47, 0.47, 0.12, 16, 1, true),
    foot: new T.SphereGeometry(0.15, 8, 6),
    gun: new T.BoxGeometry(0.1, 0.12, 0.5),
    hopper: new T.SphereGeometry(0.11, 10, 8),
    spot: new T.SphereGeometry(0.13, 8, 6),
    shadow: new T.CircleGeometry(0.5, 16).rotateX(-Math.PI / 2),
    bubble: new T.SphereGeometry(1, 18, 12),
    ring: new T.PlaneGeometry(1.9, 1.9).rotateX(-Math.PI / 2),
    white: new T.MeshLambertMaterial({ color: 0xffffff }),
    black: new T.MeshBasicMaterial({ color: 0x1c2230 }),
    dark: new T.MeshLambertMaterial({ color: 0x343b4f }),
    shadowMat: new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }),
    bubbleMat: new T.MeshBasicMaterial({ color: 0xaaf0ff, transparent: true, opacity: 0.25, depthWrite: false }),
  };
  const ringTex = new T.CanvasTexture(canvasTex(128, (ctx, sz) => { // dashed circle for teammates
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 10; ctx.setLineDash([22, 14]);
    ctx.beginPath(); ctx.arc(sz / 2, sz / 2, sz / 2 - 8, 0, Math.PI * 2); ctx.stroke();
  }));
  const paintMats = new Map();
  function paintMat(color) {
    if (!paintMats.has(color)) paintMats.set(color, new T.MeshLambertMaterial({ color }));
    return paintMats.get(color);
  }
  function makeModel(color) {
    const g = new T.Group(), up = new T.Group(); // up: everything but the feet (squashes when ducking)
    g.add(up);
    const bodyMat = new T.MeshLambertMaterial({ color });
    const body = new T.Mesh(shared.body, bodyMat);
    body.scale.set(0.9, 1.25, 0.9); body.position.y = 0.85; up.add(body);
    const band = new T.Mesh(shared.band, shared.dark); band.position.y = 1.12; band.scale.set(0.98, 1, 0.98); up.add(band);
    for (const sx of [-1, 1]) {
      const e = new T.Mesh(shared.eye, shared.white); e.position.set(sx * 0.15, 1.13, -0.4); e.scale.z = 0.6; up.add(e);
      const p = new T.Mesh(shared.pupil, shared.black); p.position.set(sx * 0.15, 1.13, -0.47); up.add(p);
    }
    const feet = [];
    for (const sx of [-1, 1]) { const f = new T.Mesh(shared.foot, shared.dark); f.position.set(sx * 0.18, 0.1, 0); f.scale.set(1, 0.7, 1.4); g.add(f); feet.push(f); }
    const gun = new T.Mesh(shared.gun, shared.dark); gun.position.set(0.38, 0.75, -0.35); up.add(gun);
    const hop = new T.Mesh(shared.hopper, bodyMat); hop.position.set(0.38, 0.88, -0.25); up.add(hop);
    const bubble = new T.Mesh(shared.bubble, shared.bubbleMat); bubble.position.y = 0.85; bubble.visible = false; g.add(bubble);
    const spots = new T.Group(); g.add(spots);
    // name tag with health pips
    const tc = document.createElement('canvas'); tc.width = 256; tc.height = 72;
    const tag = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(tc), depthWrite: false }));
    tag.scale.set(2, 0.56, 1); tag.position.y = 2.05; g.add(tag);
    scene.add(g);
    const shadow = new T.Mesh(shared.shadow, shared.shadowMat); scene.add(shadow);
    return { g, up, body, bodyMat, hop, feet, bubble, spots, tag, tc, shadow, tagKey: '', duckK: 0 };
  }
  function drawTag(p) {
    const ally = me && p !== me && allied(me, p);
    const key = p.name + '|' + p.color + '|' + p.hp + '/' + p.maxHp + '|' + ally;
    if (key === p.m.tagKey) return;
    p.m.tagKey = key;
    const ctx = p.m.tc.getContext('2d');
    ctx.clearRect(0, 0, 256, 72);
    ctx.font = '900 30px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const label = (ally ? '🤝 ' : '') + p.name;
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(16,22,36,0.85)'; ctx.strokeText(label, 128, 22);
    ctx.fillStyle = p.color; ctx.fillText(label, 128, 22);
    const n = p.maxHp, w = 22, x0 = 128 - (n * w) / 2 + w / 2;
    for (let i = 0; i < n; i++) {
      ctx.beginPath(); ctx.arc(x0 + i * w, 56, 8, 0, Math.PI * 2);
      ctx.fillStyle = i < p.hp ? '#ff3d7f' : 'rgba(255,255,255,0.35)'; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(16,22,36,0.8)'; ctx.stroke();
    }
    p.m.tag.material.map.needsUpdate = true;
  }

  const chars = [];
  let nextId = 1;
  function makeChar(name, color, isBot, id) {
    const p = {
      id: id || (isBot ? 'b' : 'p') + nextId++, name, color, ownColor: color, isBot, m: makeModel(color),
      team: null, ss: 0, remote: false, awayUntil: 0, role: 'attack', blocks: 0, crouch: false,
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, onGround: true,
      maxHp: isBot ? BOT_HP : PLAYER_HP, hp: 0, alive: false, respawn: 0, shield: 0, deadT: 0,
      ammo: MAG_SIZE, reload: 0, cooldown: 0, stamina: STAMINA_MAX, kills: 0, deaths: 0, streak: 0,
      lastHitBy: null, walkT: 0, spots: 0,
      buffs: {}, magSize: MAG_SIZE, items: [], sel: 0, healT: 0, // boosts and carried defenses
      // bot brain
      mode: 'wander', goal: null, goalT: 0, target: null, lastSeen: -99, seenX: 0, seenZ: 0, react: 0, think: Math.random() * 0.2,
      burst: 0, strafe: 1, strafeT: 0, cover: null, coverT: 0, stuckT: 0, lastX: 0, lastZ: 0, side: Math.random() < 0.5 ? 1 : -1,
      hurtBy: null, hurtT: 0, wantJump: false, aimYaw: 0, aimPitch: 0, errYaw: 0, errPitch: 0,
    };
    chars.push(p);
    return p;
  }
  function setColor(p, color) {
    p.color = color; p.m.bodyMat.color.set(color); p.m.tagKey = '';
  }
  function clearSpots(p) { const s = p.m.spots; while (s.children.length) s.remove(s.children[0]); p.spots = 0; }

  function spawnSpot(p) {
    if (teamMode && p.team != null) { // team games: always at your team's base
      const b = bases.find((x) => x.alive && x.team === p.team);
      if (b) { const s = b.spots.length ? pick(b.spots) : b; return { x: s.x, z: s.z }; }
    }
    let best = null, bestScore = -1;
    for (let k = 0; k < 14; k++) {
      const c = pick(navPoints);
      if (k < 13 && heightAt(c.x, c.z, 0.9) > 0) continue; // a barricade or turret is standing there
      let near = 99;
      for (const o of chars) if (o !== p && inPlay(o) && !friendly(o, p)) near = Math.min(near, Math.hypot(o.x - c.x, o.z - c.z));
      if (near > bestScore) { bestScore = near; best = c; }
    }
    return best;
  }
  function spawn(p) {
    const s = spawnSpot(p);
    p.x = s.x + rand(-0.5, 0.5); p.z = s.z + rand(-0.5, 0.5); p.y = 0; p.vx = p.vy = p.vz = 0; p.onGround = true;
    p.yaw = Math.atan2(p.x, p.z); // face the middle
    p.pitch = 0;
    p.buffs = {}; p.magSize = MAG_SIZE; p.items = []; p.sel = 0; p.healT = 0; // boosts and carried defenses end when you're splatted
    p.maxHp = p.isBot ? BOT_HP : PLAYER_HP;
    p.hp = p.maxHp; p.alive = true; p.shield = SPAWN_SHIELD; p.ammo = p.magSize; p.reload = 0; p.cooldown = 0.3;
    p.stamina = STAMINA_MAX; p.target = null; p.mode = 'wander'; p.goal = null; p.lastHitBy = null; p.deadT = 0;
    p.ss++; // spawn counter: tells a friend's screen to jump to the new spot
    p.askT = 0; p.asking = false;
    clearSpots(p);
    p.m.g.visible = true; p.m.g.scale.set(1, 1, 1); p.m.shadow.visible = true;
    if (p === me) { sfx.spawn(); setDeadUI(false); }
  }

  // ---------- Paintballs ----------
  const MAX_BALLS = 220;
  const ballMesh = new T.InstancedMesh(new T.SphereGeometry(1, 8, 6), new T.MeshBasicMaterial(), MAX_BALLS);
  ballMesh.frustumCulled = false;
  for (let i = 0; i < MAX_BALLS; i++) ballMesh.setColorAt(i, _c.set(0xffffff));
  ballMesh.count = 0;
  scene.add(ballMesh);
  const balls = [];
  // owner gets the credit; src is a turret if one fired it
  // On a friend's screen every ball is just for show (vis): the host's copy decides what it hits.
  function fireBall(owner, ox, oy, oz, dx, dy, dz, dmg = 1, color = owner.color, src = null) {
    if (balls.length >= MAX_BALLS) balls.shift();
    balls.push({ x: ox, y: oy, z: oz, vx: dx * BALL_SPEED, vy: dy * BALL_SPEED, vz: dz * BALL_SPEED, life: BALL_LIFE, owner, color, dmg, src, vis: mode === 'client' });
    if (mode === 'host' && state !== 'lobby') outbox.push({ t: 'b', o: owner.id, s: src ? 1 : 0, c: color, p: [ox, oy, oz, dx, dy, dz].map((v) => Math.round(v * 1000) / 1000) });
  }
  // A shot from a person or bot: Triple Shot fans out 3 balls, the Golden Gun's count double.
  function launch(p, ox, oy, oz, dx, dy, dz) {
    const golden = !!p.buffs.golden;
    for (const a of p.buffs.triple ? [-TRIPLE_SPREAD, 0, TRIPLE_SPREAD] : [0]) {
      const cs = Math.cos(a), sn = Math.sin(a);
      fireBall(p, ox, oy, oz, dx * cs + dz * sn, dy, -dx * sn + dz * cs, golden ? 2 : 1, golden ? GOLD : p.color);
    }
  }
  function hitsBody(c, x, y, z) { // capsule around the blob body (shorter when ducking: about 1 m)
    const ex = x - c.x, ez = z - c.z, h2 = ex * ex + ez * ez;
    if (h2 > 1) return false;
    if (c.crouch) { const dy = y - clamp(y, c.y + 0.4, c.y + 0.5); return h2 + dy * dy < 0.3; }
    const dy = y - clamp(y, c.y + 0.6, c.y + 1.1);
    return h2 + dy * dy < 0.36; // (0.5 + BALL_R)^2
  }
  function inBubble(c, x, y, z) { const dy = y - midOf(c); return (x - c.x) ** 2 + dy * dy + (z - c.z) ** 2 < 1.05; }
  function updateBalls(dt) {
    for (let bi = balls.length - 1; bi >= 0; bi--) {
      const b = balls[bi];
      b.life -= dt;
      let done = b.life <= 0;
      const steps = Math.max(1, Math.ceil((BALL_SPEED * dt) / 0.25)), h = dt / steps;
      for (let st = 0; st < steps && !done; st++) {
        const px = b.x, py = b.y, pz = b.z;
        b.vy -= BALL_GRAVITY * h;
        b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
        // shield domes stop enemy paint at the edge; turrets take hits
        if (ballVsDeploys(b, px, py, pz)) { done = true; break; }
        // people
        for (const c of chars) {
          if (!inPlay(c) || friendly(c, b.owner)) continue; // your own paint passes through you
          if (c.shield > 0 && inBubble(c, b.x, b.y, b.z)) { burst(b.x, b.y, b.z, '#bff6ff', 8, 3); if (c === me || b.owner === me) sfx.block(); done = true; break; }
          if (hitsBody(c, b.x, b.y, b.z)) {
            if (b.vis) burst(b.x, b.y, b.z, b.color, 6, 2.5); // the host's hit event paints them
            else hitChar(c, b.owner, b.x, b.y, b.z, b.dmg, b.color, b.src);
            done = true; break;
          }
        }
        if (done) break;
        // the fence
        if (Math.abs(b.x) > HALF || Math.abs(b.z) > HALF) {
          if (b.y < 3.2) {
            const onX = Math.abs(b.x) - HALF > Math.abs(b.z) - HALF;
            const nx = onX ? -Math.sign(b.x) : 0, nz = onX ? 0 : -Math.sign(b.z);
            const [y, half] = span(b.y, 0, 3.2, 0.65 * DECAL_R); // (the fence is 3.2 m tall)
            splash(onX ? Math.sign(b.x) * HALF : b.x, y, onX ? b.z : Math.sign(b.z) * HALF, nx, 0, nz, b.color, half / DECAL_R);
          }
          done = true; break;
        }
        // ground
        if (b.y <= 0) { splash(b.x, 0, b.z, 0, 1, 0, b.color); done = true; break; }
        // boxes and ramps
        const o = solidAtPoint(b.x, b.z, b.y);
        if (o) {
          // any paint wears a barricade down, its owner's included; turrets only take enemy paint
          if (o.dep && !b.vis && (o.dep.type === 'wall' || !friendly(o.dep.owner, b.owner))) hitDeploy(o.dep);
          if (o.blk && !b.vis) hitBlock(o.blk); // any paint wears a block down, like a barricade
          if (o.ell) roundSplash(o.ell, b);
          else if (o.cyl) postSplash(o.cyl, b);
          else if (o.ramp) {
            const top = rampHeight(o, px, pz);
            if (py >= top - 0.05) slopeSplash(o, b.x, b.z, b.color, rand(0.45, 0.8)); // landed on the slope
            else sideSplash(o, px, pz, b);
          } else if (py >= o.h) { const [x, z, size] = fitTop(o, b.x, b.z, rand(0.45, 0.8)); splash(x, o.h, z, 0, 1, 0, b.color, size); }
          else sideSplash(o, px, pz, b);
          done = true;
        }
      }
      if (done) balls.splice(bi, 1);
    }
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      _m4.makeScale(BALL_R, BALL_R, BALL_R); _m4.setPosition(b.x, b.y, b.z);
      ballMesh.setMatrixAt(i, _m4); ballMesh.setColorAt(i, _c.set(b.color));
    }
    ballMesh.count = balls.length;
    ballMesh.instanceMatrix.needsUpdate = true;
    if (ballMesh.instanceColor) ballMesh.instanceColor.needsUpdate = true;
  }
  // Paint stays on the face it hit: a splat is moved in from the edges (and made smaller if the face is small),
  // so none of it hangs off into the air.
  const DECAL_R = 0.42; // how far a splat's paint reaches from its middle, for each meter of its size
  const span = (c, a, b, half) => (b - a <= 2 * half ? [(a + b) / 2, (b - a) / 2] : [clamp(c, a + half, b - half), half]);
  function fitTop(o, x, z, size) {
    const [cx, hx] = span(x, o.x0, o.x1, size * DECAL_R), [cz, hz] = span(z, o.z0, o.z1, size * DECAL_R);
    return [cx, cz, Math.min(hx, hz) / DECAL_R];
  }
  function sideSplash(o, px, pz, b) {
    // which side of the box did it come from?
    const dx = px < o.x0 ? o.x0 - px : px > o.x1 ? px - o.x1 : 0;
    const dz = pz < o.z0 ? o.z0 - pz : pz > o.z1 ? pz - o.z1 : 0;
    const R0 = rand(0.45, 0.8) * DECAL_R, lo = o.y0 || 0;
    if (dx >= dz) {
      const nx = px < o.x0 ? -1 : 1, fx = nx < 0 ? o.x0 : o.x1;
      const [z, hz] = span(b.z, o.z0, o.z1, R0);
      // (a ramp's side is a triangle: stay under the lower end of the slope across the splat)
      const [y, hy] = span(b.y, lo, o.ramp ? Math.min(rampHeight(o, fx, z - hz), rampHeight(o, fx, z + hz)) : o.h, R0);
      splash(fx, y, z, nx, 0, 0, b.color, Math.min(hz, hy) / DECAL_R);
    } else {
      const nz = pz < o.z0 ? -1 : 1, fz = nz < 0 ? o.z0 : o.z1;
      const [x, hx] = span(b.x, o.x0, o.x1, R0);
      const [y, hy] = span(b.y, lo, o.ramp ? Math.min(rampHeight(o, x - hx, fz), rampHeight(o, x + hx, fz)) : o.h, R0);
      splash(x, y, fz, 0, 0, nz, b.color, Math.min(hx, hy) / DECAL_R);
    }
  }
  function slopeNormal(o) {
    const L = o.axis === 'x' ? o.x1 - o.x0 : o.z1 - o.z0, k = (o.h / L) * o.dir, len = Math.hypot(k, 1);
    return [o.axis === 'x' ? -k / len : 0, 1 / len, o.axis === 'z' ? -k / len : 0];
  }
  function slopeSplash(o, x0, z0, color, size, quiet) {
    const [x, z, sz] = fitTop(o, x0, z0, size), [nx, ny, nz] = slopeNormal(o);
    if (quiet) addDecal(x, rampHeight(o, x, z), z, nx, ny, nz, color, sz);
    else splash(x, rampHeight(o, x, z), z, nx, ny, nz, color, sz);
  }
  function roundSplash(e, b) { // on a rock: on its rounded surface, small enough to follow the curve
    const dx = b.x - e.cx, dz = b.z - e.cz, q = Math.sqrt((dx / e.rx) ** 2 + (b.y / e.ry) ** 2 + (dz / e.rz) ** 2) || 1;
    const sx = dx / q, sy = b.y / q, sz = dz / q;
    let nx = sx / (e.rx * e.rx), ny = sy / (e.ry * e.ry), nz = sz / (e.rz * e.rz);
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    splash(e.cx + sx, sy, e.cz + sz, nx, ny, nz, b.color, Math.min(rand(0.45, 0.8), 0.7 * Math.min(e.rx, e.ry, e.rz)));
  }
  function postSplash(c, b) { // on a tree trunk or turret post: a small splat on its round side
    const size = Math.min(0.36, c.h * 0.9), a = Math.atan2(b.z - c.cz, b.x - c.cx);
    const y = clamp(b.y, c.y0 + size * 0.5, c.y0 + c.h - size * 0.5), r = cylR(c, y);
    splash(c.cx + Math.cos(a) * r, y, c.cz + Math.sin(a) * r, Math.cos(a), 0, Math.sin(a), b.color, size);
  }
  // a big splat on the floor (where someone was splatted, a mine went off): fitted to whatever it lands on
  function floorDecal(x, z, color, size) {
    const o = topAt(x, z);
    if (!o) { addDecal(x, 0.005, z, 0, 1, 0, color, size); return; } // the ground goes on forever
    if (o.ramp) { slopeSplash(o, x, z, color, size, true); return; }
    if (o.ell) {
      const e = o.ell, y = ellHeight(e, x, z, 0);
      let nx = (x - e.cx) / (e.rx * e.rx), ny = y / (e.ry * e.ry), nz = (z - e.cz) / (e.rz * e.rz);
      const l = Math.hypot(nx, ny, nz) || 1;
      addDecal(x, y, z, nx / l, ny / l, nz / l, color, Math.min(size, 0.7 * Math.min(e.rx, e.ry, e.rz)));
      return;
    }
    const [cx, cz, sz] = fitTop(o, x, z, size);
    addDecal(cx, o.h + 0.005, cz, 0, 1, 0, color, sz);
  }
  function splash(x, y, z, nx, ny, nz, color, size = rand(0.45, 0.8)) {
    addDecal(x, y, z, nx, ny, nz, color, size);
    burst(x + nx * 0.05, y + ny * 0.05, z + nz * 0.05, color, 5, 2.2);
    if (me && me.alive) { const d = Math.hypot(x - me.x, z - me.z); if (d < 14) sfx.splat(0.35 * (1 - d / 14)); }
  }

  // shooter gets the credit; src is the turret or mine that did it, if any
  function hitChar(c, shooter, x, y, z, dmg = 1, color = shooter.color, src = null) {
    if (!c.alive) return;
    if (c.shield > 0) { fx({ t: 'pop', x: r2(x), y: r2(y), z: r2(z) }); return; }
    c.hp = Math.max(0, c.hp - dmg);
    c.lastHitBy = shooter;
    c.hurtBy = shooter; c.hurtT = 3;
    if (c.isBot) botHurt(c, src && src.alive ? src : shooter);
    const from = src || shooter;
    fx({ t: 'hit', v: c.id, k: shooter.id, x: r2(x), y: r2(y), z: r2(z), c: color, fx: r2(from.x), fz: r2(from.z), dead: c.hp <= 0 ? 1 : 0 });
    if (c.hp <= 0) splatChar(c, shooter, src, color);
  }
  function splatChar(c, killer, src, color = killer.color) {
    c.alive = false; c.respawn = RESPAWN_TIME; c.deadT = 0; c.deaths++; c.streak = 0;
    c.grudge = { id: killer.id, at: now }; // bots won't team up with whoever just splatted them
    if (killer !== c) { killer.kills++; killer.streak++; earnBlock(killer); }
    fx({ t: 'splat', v: c.id, k: killer.id, x: r2(c.x), y: r2(c.y), z: r2(c.z), gy: r2(heightAt(c.x, c.z, 0)), c: color,
      how: src ? POWERUPS[src.type].icon : '', st: killer.streak });
    if (Math.random() < DROP_CHANCE) spawnDrop(c.x, heightAt(c.x, c.z, 0), c.z); // half of all splats drop something
    for (const b of chars) if (b.target === c) b.target = null;
  }

  // ---------- Movement and physics (people and bots share it) ----------
  function tryMove(p, nx, nz) {
    if (heightAt(nx, nz, PLAYER_R) > p.y + STEP) return false;
    p.x = nx; p.z = nz; return true;
  }
  function physics(p, dt) {
    const lim = HALF - PLAYER_R;
    const nx = clamp(p.x + p.vx * dt, -lim, lim), nz = clamp(p.z + p.vz * dt, -lim, lim);
    p.blocked = false;
    if (!tryMove(p, nx, nz)) {
      p.blocked = true;
      if (!tryMove(p, nx, p.z)) p.vx = 0;
      if (!tryMove(p, p.x, nz)) p.vz = 0;
    }
    const g = heightAt(p.x, p.z, PLAYER_R);
    if (p.onGround) {
      if (p.vy <= 0 && g >= p.y - 0.5) p.y = g; else p.onGround = false;
    }
    if (!p.onGround) {
      p.vy -= GRAVITY * dt; p.y += p.vy * dt;
      if (p.y <= g) { p.y = g; p.vy = 0; p.onGround = true; }
    }
  }
  function jump(p) { if (p.onGround) { p.vy = JUMP_V; p.onGround = false; } }
  function separate() { // keep people from walking through each other
    for (let i = 0; i < chars.length; i++) {
      const a = chars[i]; if (!inPlay(a) || a.remote) continue;
      for (let j = i + 1; j < chars.length; j++) {
        const b = chars[j]; if (!inPlay(b) || b.remote || Math.abs(a.y - b.y) > 1.4) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
        if (d2 > 0.81 || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), push = (0.9 - d) / 2, ux = dx / d, uz = dz / d;
        tryMove(a, a.x - ux * push, a.z - uz * push); tryMove(b, b.x + ux * push, b.z + uz * push);
      }
    }
  }

  function canShoot(p) { return p.alive && p.cooldown <= 0 && p.reload <= 0 && p.ammo > 0; }
  function startReload(p) {
    if (p.reload > 0 || p.ammo >= p.magSize || !p.alive) return;
    p.reload = RELOAD_TIME * (p.buffs.mag ? 0.6 : 1);
    if (p === me) sfx.reload();
  }
  function useAmmo(p) {
    p.ammo--; p.cooldown = FIRE_DELAY * (p.buffs.rapid ? 0.5 : 1); p.shield = 0; // shooting drops your spawn shield
    if (p.ammo <= 0) startReload(p);
  }

  // ---------- Power-ups and defenses (same rules as the top-down game) ----------
  // Half of all splats drop something. Boosts work right away and last until you're splatted. Defenses go in one
  // of 3 carry slots; once placed, the ones that can be shot down (barricade, turret) and the mine stay until
  // destroyed or set off, up to 3 standing per player. The others run on a timer.
  // w = weight: out of every 114 drops, roughly this many are that kind (rarer = stronger).
  const DROP_CHANCE = 0.5, DROP_LIFETIME = 20;
  const POWERUPS = {
    heart:  { w: 15, name: 'Extra Heart',   icon: '♥', color: '#ff4d6d', desc: '+1 max health and a full heal' },
    rapid:  { w: 15, name: 'Rapid Fire',    icon: '⚡', color: '#ffd23d', desc: 'Shoot twice as fast' },
    speed:  { w: 12, name: 'Speed Boots',   icon: '»', color: '#3dfff0', desc: 'Run 30% faster' },
    mag:    { w: 12, name: 'Big Hopper',    icon: '▤', color: '#9cff3d', desc: '24 paintballs and faster reloads' },
    triple: { w: 9,  name: 'Triple Shot',   icon: '⁂', color: '#ff8a3d', desc: 'Every shot fires 3 paintballs' },
    golden: { w: 3,  name: 'Golden Gun',    icon: '★', color: '#ffc800', desc: 'Every hit counts double' },
    wall:   { w: 12, place: true, name: 'Barricade',     icon: '▮', color: '#a0b4c8', desc: 'A wall anyone can hide behind, until it takes 8 hits' },
    heal:   { w: 9,  place: true, name: 'Heal Station',  icon: '✚', color: '#3dff8b', desc: 'Heals anyone standing in it (20s)' },
    dome:   { w: 7,  place: true, name: 'Shield Dome',   icon: '◠', color: '#7fd4ff', desc: "Enemy paint can't get in (10s)" },
    turret: { w: 6,  place: true, name: 'Sentry Turret', icon: '⊕', color: '#c78bff', desc: 'Shoots enemies near it until it takes 5 hits' },
    bush:   { w: 8,  place: true, name: 'Bush',          icon: '🌳', color: '#4cbb4c', desc: "A hiding spot: bots can't see you inside (90s)" },
    mine:   { w: 6,  place: true, name: 'Paint Mine',    icon: '💣', color: '#ff5a3d', desc: 'A hidden trap: an enemy who steps on it takes 2 hits' },
  };
  const MAX_CARRY = 3;     // defenses you can carry at once (slots 1-3)
  const MAX_LASTING = 3;   // barricades + turrets + mines one player can have standing; a 4th replaces their oldest
  const DEPLOY = {         // ttl 0 = no timer. Sizes in meters.
    wall:   { ttl: 0, hp: 8 },
    heal:   { ttl: 20, r: 1.8 },
    dome:   { ttl: 10, r: 2.6 },
    turret: { ttl: 0, hp: 5, range: 20, rate: 0.5 },
    bush:   { ttl: 90, r: 1.6 },
    mine:   { ttl: 0, r: 2.6, trigger: 0.9, arm: 1 }, // waits until someone steps on it
  };
  const GOLD = '#ffc800', TRIPLE_SPREAD = 0.06;
  // Who's on your side: you, your team in a team game, and anyone you've teamed up with.
  let teamMode = 0;                                   // 0: everyone for themselves; 2-4 set teams (hosted games)
  let alliances = {}, requests = {}, botAnswers = {}, botTeamT = 8; // team-ups: "a|b" -> { breakT, life }
  const pairKey = (a, b) => (a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id);
  const allied = (a, b) => a !== b && !!alliances[pairKey(a, b)];
  const inPlay = (c) => c.alive && !c.awayUntil; // (a friend whose game is reconnecting stays out of play)
  const friendly = (a, b) => a === b || (teamMode > 0 && a.team != null && a.team === b.team) || allied(a, b);

  // round badge with the item's symbol, for drops and floating labels
  const iconTexCache = {};
  function iconTex(type) {
    if (!iconTexCache[type]) {
      const P = POWERUPS[type];
      iconTexCache[type] = new T.CanvasTexture(canvasTex(128, (ctx) => {
        ctx.beginPath(); ctx.arc(64, 64, 56, 0, 7); ctx.fillStyle = P.color; ctx.fill();
        ctx.lineWidth = 9; ctx.strokeStyle = '#ffffff'; ctx.stroke();
        ctx.font = '900 66px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#1c2230';
        ctx.fillText(P.icon, 64, 68);
      }));
    }
    return iconTexCache[type];
  }
  const itemGeo = {
    ring: new T.TorusGeometry(0.45, 0.06, 6, 24).rotateX(Math.PI / 2),
    beam: new T.CylinderGeometry(0.05, 0.05, 3.2, 6, 1, true).translate(0, 1.6, 0),
    healRing: new T.TorusGeometry(1, 0.07, 6, 32).rotateX(Math.PI / 2),
    healCol: new T.CylinderGeometry(1, 1, 1.3, 24, 1, true).translate(0, 0.65, 0),
    dome: new T.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    box: new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    tBase: new T.CylinderGeometry(0.26, 0.36, 0.55, 8).translate(0, 0.275, 0),
    tHead: new T.SphereGeometry(0.28, 14, 10),
    tBarrel: new T.CylinderGeometry(0.06, 0.07, 0.5, 8).rotateX(Math.PI / 2).translate(0, 0, -0.3),
    mine: new T.CylinderGeometry(0.32, 0.36, 0.1, 12).translate(0, 0.05, 0),
    light: new T.SphereGeometry(0.09, 8, 6),
    bush: new T.IcosahedronGeometry(1, 1),
  };

  // ----- drops on the ground -----
  const drops = [];
  let itemId = 0;
  function rollDrop() {
    const types = Object.keys(POWERUPS);
    let n = Math.random() * types.reduce((t, k) => t + POWERUPS[k].w, 0);
    for (const k of types) { n -= POWERUPS[k].w; if (n < 0) return k; }
    return types[0];
  }
  function spawnDrop(x, y, z, type = rollDrop()) {
    const col = POWERUPS[type].color, g = new T.Group();
    const ring = new T.Mesh(itemGeo.ring, new T.MeshBasicMaterial({ color: col })); ring.position.y = 0.1;
    const beam = new T.Mesh(itemGeo.beam, new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.3, depthWrite: false }));
    const icon = new T.Sprite(new T.SpriteMaterial({ map: iconTex(type) })); icon.scale.set(0.85, 0.85, 1); icon.position.y = 0.9;
    g.add(ring, beam, icon); g.position.set(x, y, z); scene.add(g);
    const d = { id: ++itemId, type, x, y, z, ttl: DROP_LIFETIME, g, icon, ring, phase: Math.random() * 6 };
    drops.push(d);
    return d;
  }
  function removeDrop(d) {
    scene.remove(d.g);
    d.g.traverse((o) => { if (o.material) o.material.dispose(); });
    drops.splice(drops.indexOf(d), 1);
  }
  function givePowerup(p, type) {
    const b = p.buffs;
    if (type === 'heart') {
      const base = p.isBot ? BOT_HP : PLAYER_HP;
      p.maxHp = Math.min(base + 3, p.maxHp + 1);
      p.hp = p.maxHp;
    } else if (type === 'mag') {
      b.mag = 1; p.magSize = MAG_SIZE * 2;
      if (p.reload <= 0) p.ammo = p.magSize;
    } else if (POWERUPS[type].place) {
      if (p.items.length < MAX_CARRY) p.items.push(type); // updateDrops never hands one to a full player
    } else {
      b[type] = 1;
    }
  }
  let fullNoteT = 0;
  function updateDrops(dt) {
    fullNoteT -= dt;
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.ttl -= dt;
      if (d.ttl <= 0) { removeDrop(d); continue; }
      animateDrop(d, dt);
      // with all 3 carry slots full, a defense stays on the ground for someone else
      const place = POWERUPS[d.type].place;
      const near = (p) => inPlay(p) && Math.hypot(p.x - d.x, p.z - d.z) < 1.1 && Math.abs(p.y - d.y) < 1.4;
      const taker = chars.find((p) => near(p) && (!place || p.items.length < MAX_CARRY));
      if (!taker) {
        if (me && near(me) && fullNoteT <= 0) { fullNoteT = 3; toast('Your 3 defense slots are full. Place one to make room!', '#ffffff'); }
        continue;
      }
      givePowerup(taker, d.type);
      removeDrop(d);
      fx({ t: 'pick', p: taker.id, k: d.type, n: taker.items.length });
    }
  }
  function animateDrop(d, dt) {
    d.icon.position.y = 0.9 + Math.sin(now * 3 + d.phase) * 0.12;
    d.ring.rotation.y += dt * 2;
    d.g.visible = d.ttl > 4 || Math.floor(d.ttl * 5) % 2 === 0; // blinks before it fades
  }

  // ----- placed defenses -----
  const deploys = [];
  function placeItem(p, slot = p.sel) {
    if (!p || !p.alive || !Number.isInteger(slot) || slot < 0 || slot >= p.items.length) return false;
    const type = p.items.splice(slot, 1)[0], cfg = DEPLOY[type];
    p.sel = clamp(p.sel, 0, Math.max(0, p.items.length - 1));
    const fwx = -Math.sin(p.yaw), fwz = -Math.cos(p.yaw), lim = HALF - 1;
    const d = { id: ++itemId, type, owner: p, color: p.color, ttl: cfg.ttl, hp: cfg.hp || 0, x: p.x, y: p.y, z: p.z, yaw: p.yaw, cool: 0, flash: 0,
      alive: true, shield: 0, vx: 0, vz: 0 };
    if (type === 'wall') { d.x = p.x + fwx * 1.7; d.z = p.z + fwz * 1.7; }        // stands across your line of fire
    else if (type === 'turret') { d.x = p.x + fwx * 1.3; d.z = p.z + fwz * 1.3; d.aimH = 0.75; }
    else if (type === 'mine') d.cool = cfg.arm;                                     // arms after a moment
    d.x = clamp(d.x, -lim, lim); d.z = clamp(d.z, -lim, lim);
    if (type === 'wall' || type === 'turret') d.y = heightAt(d.x, d.z, 0);
    if (type === 'wall') {
      const across = Math.abs(fwx) >= Math.abs(fwz); // facing along x: the wall runs along z
      d.w = across ? 0.5 : 2.8; d.d = across ? 2.8 : 0.5;
    }
    registerDeploy(d);
    if (!cfg.ttl) { // lasting defenses never time out, so cap how many each player has up at once
      const mine = deploys.filter((q) => q.owner === p && !DEPLOY[q.type].ttl);
      if (mine.length > MAX_LASTING) removeDeploy(mine[0], true);
    }
    fx({ t: 'place', p: p.id, k: type, x: r2(d.x), z: r2(d.z) });
    return true;
  }
  // put a defense into the world: what it blocks or hides, and its model (friends' screens use this too)
  function registerDeploy(d) {
    const cfg = DEPLOY[d.type], type = d.type;
    if (type === 'wall') {
      d.solid = addSolid({ x0: d.x - d.w / 2, x1: d.x + d.w / 2, z0: d.z - d.d / 2, z1: d.z + d.d / 2, h: d.y + 2, kind: 'barricade', dep: d });
    } else if (type === 'turret') {
      d.solid = addSolid({ x0: d.x - 0.3, x1: d.x + 0.3, z0: d.z - 0.3, z1: d.z + 0.3, h: d.y + 0.55, kind: 'turret', dep: d,
        cyl: { cx: d.x, cz: d.z, y0: d.y, h: 0.55, r0: 0.36, r1: 0.26 } });
    } else if (type === 'bush') {
      d.zone = { x: d.x, z: d.z, r: cfg.r * 0.95, top: d.y + 1.75, kind: 'bush' }; hideZones.push(d.zone);
      d.leaf = { x: d.x, y: d.y + 0.75, z: d.z, r: cfg.r * 0.95 }; leafBalls.push(d.leaf);
    }
    buildDeployModel(d);
    deploys.push(d);
  }
  function removeDeploy(d, broke) {
    if (!d.alive) return;
    d.alive = false;
    deploys.splice(deploys.indexOf(d), 1);
    scene.remove(d.g);
    d.g.traverse((o) => { if (o.material && o.material.userData.own) o.material.dispose(); });
    if (d.solid) { removeSolid(d.solid); hideDecalsIn(d.solid); }
    if (d.zone) hideZones.splice(hideZones.indexOf(d.zone), 1);
    if (d.leaf) leafBalls.splice(leafBalls.indexOf(d.leaf), 1);
    if (broke) burst(d.x, d.y + 0.8, d.z, POWERUPS[d.type].color, 30, 5);
    for (const b of chars) if (b.target === d) b.target = null;
  }
  function hitDeploy(d) {
    if (!DEPLOY[d.type].hp) return;
    d.hp--; d.flash = 0.12;
    if (d.hp <= 0) removeDeploy(d, true);
  }
  function inHeal(p) {
    for (const d of deploys) if (d.type === 'heal' && Math.hypot(p.x - d.x, p.z - d.z) < DEPLOY.heal.r && Math.abs(p.y - d.y) < 2) return true;
    return false;
  }
  // Domes stop enemy paint coming in from outside (paint already inside, and the owner's, passes).
  // Turrets take hits from enemy paint. Returns true if the ball is used up.
  function ballVsDeploys(b, px, py, pz) {
    for (const d of deploys) {
      if (friendly(d.owner, b.owner)) continue;
      if (d.type === 'dome') {
        const r = DEPLOY.dome.r, inNow = (b.x - d.x) ** 2 + (b.y - d.y) ** 2 + (b.z - d.z) ** 2 < r * r && b.y >= d.y - 0.1;
        const inBefore = (px - d.x) ** 2 + (py - d.y) ** 2 + (pz - d.z) ** 2 < r * r && py >= d.y - 0.1;
        if (inNow && !inBefore) { burst(b.x, b.y, b.z, '#7fd4ff', 8, 3); d.flash = 0.15; if (d.owner === me) sfx.block(); return true; }
      } else if (d.type === 'turret') {
        if ((b.x - d.x) ** 2 + (b.y - d.y - 0.75) ** 2 + (b.z - d.z) ** 2 < 0.45 * 0.45) {
          burst(b.x, b.y, b.z, b.color, 8, 3);
          if (!b.vis) hitDeploy(d);
          if (b.owner === me) { hitMarker(false); sfx.hit(); }
          return true;
        }
      }
    }
    return false;
  }
  function boom(d) {
    removeDeploy(d, false);
    const R = DEPLOY.mine.r, spots = [];
    for (let k = 0; k < 5; k++) { const a = Math.random() * 6.28, r = rand(1, R); spots.push([r2(d.x + Math.cos(a) * r), r2(d.z + Math.sin(a) * r)]); }
    fx({ t: 'boom', x: r2(d.x), y: r2(d.y), z: r2(d.z), c: d.color, s: spots });
    for (const q of chars) { // everyone nearby except the owner's side takes 2 hits, counted as the owner's
      if (!inPlay(q) || friendly(q, d.owner) || Math.hypot(q.x - d.x, q.z - d.z) > R || Math.abs(q.y - d.y) > 2) continue;
      hitChar(q, d.owner, q.x, q.y + 0.8, q.z, 2, d.color, d);
    }
  }
  function updateDeploys(dt) {
    for (const d of deploys.slice()) {
      const cfg = DEPLOY[d.type], timed = cfg.ttl > 0;
      if (timed) d.ttl -= dt;
      if (timed && d.ttl <= 0) { removeDeploy(d, false); continue; }
      d.flash = Math.max(0, d.flash - dt);
      if (d.type === 'heal') {
        // heals anyone standing in it, friend or foe
        for (const q of chars) {
          if (!inPlay(q) || Math.hypot(q.x - d.x, q.z - d.z) >= cfg.r || Math.abs(q.y - d.y) > 2) continue;
          q.healT += dt;
          if (q.healT >= 1.5 && q.hp < q.maxHp) {
            q.healT = 0; q.hp++;
            fx({ t: 'heal', p: q.id, x: r2(q.x), y: r2(q.y), z: r2(q.z) });
          }
        }
        if (Math.random() < dt * 6) burst(d.x + rand(-1.2, 1.2), d.y + 0.1, d.z + rand(-1.2, 1.2), '#9dffc0', 1, 1.2);
      } else if (d.type === 'mine') {
        if (d.cool > 0) d.cool -= dt;
        else if (chars.some((q) => inPlay(q) && !friendly(q, d.owner) && Math.hypot(q.x - d.x, q.z - d.z) < cfg.trigger && Math.abs(q.y - d.y) < 1.2)) {
          boom(d);
          continue;
        }
      } else if (d.type === 'turret') {
        d.cool -= dt;
        let best = null, bestD = cfg.range;
        const hx = d.x, hy = d.y + 0.75, hz = d.z;
        for (const o of chars) {
          if (friendly(o, d.owner) || !inPlay(o) || o.shield > 0) continue;
          const dd = Math.hypot(o.x - hx, o.z - hz);
          if (dd > bestD || (concealed(o) && dd > HIDE_NEAR) || !clearLine(hx, hy, hz, o.x, midOf(o), o.z, dd > HIDE_NEAR)) continue;
          best = o; bestD = dd;
        }
        if (best) {
          const lead = (bestD / BALL_SPEED) * 0.5, tx = best.x + best.vx * lead, tz = best.z + best.vz * lead;
          const want = Math.atan2(-(tx - hx), -(tz - hz));
          d.yaw += clamp(angDiff(d.yaw, want), -6 * dt, 6 * dt);
          if (d.cool <= 0 && Math.abs(angDiff(d.yaw, want)) < 0.2) {
            d.cool = cfg.rate;
            const time = bestD / BALL_SPEED, a = d.yaw + rand(-0.06, 0.06);
            const pitch = Math.atan2(midOf(best) - hy + 0.5 * BALL_GRAVITY * time * time, bestD) + rand(-0.03, 0.03), cp = Math.cos(pitch);
            const dx = -Math.sin(a) * cp, dy = Math.sin(pitch), dz = -Math.cos(a) * cp;
            // the turret's paintballs count as its owner's, so its splats go on their score
            fireBall(d.owner, hx + dx * 0.6, hy + dy * 0.6, hz + dz * 0.6, dx, dy, dz, 1, d.color, d);
            d.recoil = 1;
            if (me && state === 'play') { const dm = Math.hypot(hx - me.x, hz - me.z); if (dm < 35) sfx.shot(0.35 * (1 - dm / 35)); }
          }
        }
      }
      animateDeploy(d, dt);
    }
  }
  function ownMat(params) { const m = new T.MeshLambertMaterial(params); m.userData.own = true; return m; }
  function ownBasic(params) { const m = new T.MeshBasicMaterial(params); m.userData.own = true; return m; }
  function buildDeployModel(d) {
    const g = new T.Group(), cfg = DEPLOY[d.type];
    g.position.set(d.x, 0, d.z);
    if (d.type === 'wall') {
      d.mat = ownMat({ color: '#a0b4c8', emissive: 0x000000 });
      const wall = new T.Mesh(itemGeo.box, d.mat); wall.scale.set(d.w, d.y + 2, d.d);
      const stripe = new T.Mesh(itemGeo.box, ownMat({ color: d.color })); stripe.scale.set(d.w + 0.04, 0.22, d.d + 0.04); stripe.position.y = d.y + 1.7;
      g.add(wall, stripe);
    } else if (d.type === 'heal') {
      g.position.y = d.y;
      const ring = new T.Mesh(itemGeo.healRing, ownBasic({ color: '#3dff8b' })); ring.scale.setScalar(cfg.r); ring.position.y = 0.05;
      const col = new T.Mesh(itemGeo.healCol, ownBasic({ color: '#3dff8b', transparent: true, opacity: 0.16, depthWrite: false, side: T.DoubleSide }));
      col.scale.set(cfg.r, 1, cfg.r);
      const icon = new T.Sprite(new T.SpriteMaterial({ map: iconTex('heal') })); icon.material.userData.own = true; icon.scale.set(0.7, 0.7, 1); icon.position.y = 2.1;
      d.icon = icon;
      g.add(ring, col, icon);
    } else if (d.type === 'dome') {
      g.position.y = d.y;
      d.mat = ownBasic({ color: '#7fd4ff', transparent: true, opacity: 0.22, depthWrite: false, side: T.DoubleSide });
      const dome = new T.Mesh(itemGeo.dome, d.mat); dome.scale.setScalar(cfg.r);
      const ring = new T.Mesh(itemGeo.healRing, ownBasic({ color: d.color })); ring.scale.setScalar(cfg.r); ring.position.y = 0.05;
      g.add(dome, ring);
    } else if (d.type === 'turret') {
      g.position.y = d.y;
      d.mat = ownMat({ color: d.color, emissive: 0x000000 });
      const base = new T.Mesh(itemGeo.tBase, shared.dark);
      const head = new T.Group(); head.position.y = 0.75;
      head.add(new T.Mesh(itemGeo.tHead, d.mat), new T.Mesh(itemGeo.tBarrel, shared.dark));
      const eye = new T.Mesh(itemGeo.light, shared.white); eye.position.set(0, 0.08, -0.24); eye.scale.set(1.3, 0.6, 0.6); head.add(eye);
      d.head = head;
      g.add(base, head);
    } else if (d.type === 'bush') {
      g.position.y = d.y;
      const col = new T.Color().setHSL(0.3, 0.6, 0.4);
      const mat = ownMat({ color: col });
      const parts = [[0, 0.65, 0, 1, 0.72], [0.5, 0.5, 0.3, 0.7, 0.6], [-0.4, 0.5, -0.35, 0.7, 0.6]];
      for (const [x, y, z, s, sy] of parts) { const m = new T.Mesh(itemGeo.bush, mat); m.position.set(x, y, z); m.scale.set(cfg.r * s, cfg.r * sy, cfg.r * s); g.add(m); }
    } else if (d.type === 'mine') {
      g.position.y = d.y;
      const disc = new T.Mesh(itemGeo.mine, shared.dark);
      d.lightMat = ownBasic({ color: d.color });
      const light = new T.Mesh(itemGeo.light, d.lightMat); light.position.y = 0.13;
      g.add(disc, light);
      g.visible = !!me && friendly(me, d.owner); // only you and your teammates can see your mines
    }
    scene.add(g);
    d.g = g;
  }
  function animateDeploy(d, dt) {
    const cfg = DEPLOY[d.type];
    if (cfg.ttl) d.g.visible = d.ttl > 3 || Math.floor(d.ttl * 5) % 2 === 0; // blinks before its time runs out
    if (d.type === 'wall') {
      const wear = 1 - d.hp / cfg.hp;
      d.mat.color.setRGB(0.63 - wear * 0.25, 0.71 - wear * 0.25, 0.78 - wear * 0.2);
      d.mat.emissive.setScalar(d.flash > 0 ? 0.5 : 0);
      d.g.position.x = d.x + (d.flash > 0 ? Math.sin(now * 90) * 0.03 : 0);
    } else if (d.type === 'turret') {
      d.recoil = Math.max(0, (d.recoil || 0) - dt * 8);
      d.head.rotation.y = d.yaw;
      d.head.position.y = 0.75 - (d.recoil || 0) * 0.03;
      d.mat.emissive.setScalar(d.flash > 0 ? 0.6 : 0);
    } else if (d.type === 'dome') {
      d.mat.opacity = d.flash > 0 ? 0.45 : 0.2 + Math.sin(now * 3) * 0.04;
    } else if (d.type === 'heal') {
      d.icon.position.y = 2.1 + Math.sin(now * 2.5) * 0.1;
    } else if (d.type === 'mine') {
      d.g.visible = !!me && friendly(me, d.owner);
      d.lightMat.color.set(d.cool > 0 || Math.floor(now * 2) % 2 ? d.color : '#ffffff');
    }
  }
  function clearItems() {
    clearBlocks();
    while (drops.length) removeDrop(drops[0]);
    while (deploys.length) removeDeploy(deploys[0], false);
  }

  // ---------- Blocks: build cover like in Minecraft ----------
  // Every splat you make earns a 1 m block (people only, not bots); you keep them when you're splatted.
  // Look at a spot and press F (or the 🧱 button): look at the top of something to stack on it, or at its side
  // to put one next to it. Blocks settle onto whatever is under them, so nothing floats; when one breaks, the
  // ones above drop down. Like barricades, any paint wears a block down (4 hits).
  const BLOCK_HP = 4, BLOCKS_PER_SPLAT = 1, MAX_BLOCKS_CARRIED = 30, MAX_BLOCKS_STANDING = 60, MAX_BLOCKS = 400;
  const BLOCK_REACH = 5, BUILD_TOP = 7; // how far away you can build, and how high (m)
  const blocks = [];                     // { id, i, j, y0, hp, owner, color, solid, flash }
  let blockId = 0, blockVer = 0;
  const blockTex = new T.CanvasTexture(canvasTex(64, (ctx, sz) => { // a toy brick: light face, darker edge
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, sz, sz);
    ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(0, sz * 0.55, sz, sz * 0.45);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 5; ctx.strokeRect(2.5, 2.5, sz - 5, sz - 5);
  }));
  const blockMesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5), new T.MeshLambertMaterial({ map: blockTex }), MAX_BLOCKS);
  blockMesh.frustumCulled = false;
  for (let i = 0; i < MAX_BLOCKS; i++) blockMesh.setColorAt(i, _c.set(0xffffff));
  blockMesh.count = 0;
  scene.add(blockMesh);
  function drawBlocks() {
    const c = new T.Color();
    blocks.forEach((b, k) => {
      _m4.makeTranslation(b.i, b.y0, b.j);
      blockMesh.setMatrixAt(k, _m4);
      c.set(b.color).lerp(_c.set(0xffffff), 0.35);                 // a pastel of its builder's color
      c.multiplyScalar(0.55 + 0.45 * (b.hp / BLOCK_HP));              // darker as it wears down
      if (b.flash > 0) c.lerp(_c.set(0xffffff), 0.6);
      blockMesh.setColorAt(k, c);
    });
    blockMesh.count = blocks.length;
    blockMesh.instanceMatrix.needsUpdate = true;
    blockMesh.instanceColor.needsUpdate = true;
  }
  const blocksIn = (i, j) => blocks.filter((b) => b.i === i && b.j === j).sort((a, b) => a.y0 - b.y0);
  function addBlock(i, j, y0, owner, color, id = ++blockId, hp = BLOCK_HP) {
    const b = { id, i, j, y0, hp, owner, color, flash: 0 };
    b.solid = addSolid({ x0: i, x1: i + 1, z0: j, z1: j + 1, h: y0 + 1, y0, kind: 'block', blk: b });
    blocks.push(b);
    blockId = Math.max(blockId, id);
    blockVer++;
    drawBlocks();
    return b;
  }
  // a block goes (broken, or replaced by its builder's newest): paint on it goes too, and blocks above drop down
  function removeBlock(b, broke) {
    const k = blocks.indexOf(b);
    if (k < 0) return;
    blocks.splice(k, 1);
    removeSolid(b.solid);
    hideDecalsIn({ x0: b.i, x1: b.i + 1, z0: b.j, z1: b.j + 1, y0: b.y0, h: 99 });
    if (broke) burst(b.i + 0.5, b.y0 + 0.5, b.j + 0.5, b.color, 24, 4);
    for (const a of blocksIn(b.i, b.j)) if (a.y0 > b.y0) { a.y0 -= 1; a.solid.y0 = a.y0; a.solid.h = a.y0 + 1; }
    blockVer++;
    drawBlocks();
  }
  function hitBlock(b) {
    b.hp--; b.flash = 0.12;
    if (b.hp <= 0) removeBlock(b, true); else { blockVer++; drawBlocks(); }
  }
  function clearBlocks() { while (blocks.length) removeBlock(blocks[blocks.length - 1], false); blockId = 0; }
  // Where would a block go? Follow your aim until it meets something (up to 5 m): the block goes in the space
  // just in front of that, settled onto whatever is under it.
  function blockTarget(p) {
    const ey = eyeOf(p), cp = Math.cos(p.pitch);
    const dx = -Math.sin(p.yaw) * cp, dy = Math.sin(p.pitch), dz = -Math.cos(p.yaw) * cp;
    let px = p.x, pz = p.z;
    for (let s = 0.1; s <= BLOCK_REACH; s += 0.1) {
      const x = p.x + dx * s, y = ey + dy * s, z = p.z + dz * s;
      if (y <= 0 || y < heightAt(x, z, 0)) return blockCell(p, Math.floor(px), Math.floor(pz));
      px = x; pz = z;
    }
    return null;
  }
  // can p put a block in column (i, j)? It sits on the highest thing there.
  function blockCell(p, i, j) {
    const y0 = heightAt(i + 0.5, j + 0.5, 0.49);
    let ok = Math.abs(i + 0.5) < HALF - 0.5 && Math.abs(j + 0.5) < HALF - 0.5 && y0 + 1 <= BUILD_TOP;
    if (ok) for (const c of chars) { // not inside anyone (you included)
      if (!inPlay(c)) continue;
      const nx = clamp(c.x, i, i + 1), nz = clamp(c.z, j, j + 1);
      if ((c.x - nx) ** 2 + (c.z - nz) ** 2 < PLAYER_R * PLAYER_R && c.y < y0 + 1 && c.y + 1.6 > y0) { ok = false; break; }
    }
    return { i, j, y0, ok };
  }
  // the host (or a solo game) puts the block down
  function placeBlock(p, i, j) {
    if (!p || !inPlay(p) || !(p.blocks > 0) || !Number.isInteger(i) || !Number.isInteger(j)) return false;
    if (Math.hypot(i + 0.5 - p.x, j + 0.5 - p.z) > BLOCK_REACH + 2) return false;
    const t = blockCell(p, i, j);
    if (!t.ok) return false;
    const mine = blocks.filter((b) => b.owner === p);
    if (mine.length >= MAX_BLOCKS_STANDING) removeBlock(mine[0], true); // your oldest goes
    if (blocks.length >= MAX_BLOCKS) return false;
    addBlock(i, j, t.y0, p, p.color);
    p.blocks--;
    fx({ t: 'block', p: p.id, x: i + 0.5, y: t.y0, z: j + 0.5 });
    return true;
  }
  function earnBlock(p) { // a splat earns a block
    if (p.isBot) return;
    p.blocks = Math.min(MAX_BLOCKS_CARRIED, (p.blocks || 0) + BLOCKS_PER_SPLAT);
    fx({ t: 'gotblock', p: p.id, n: p.blocks });
  }
  function updateBlocks(dt) {
    let dirty = false;
    for (const b of blocks) if (b.flash > 0) { b.flash -= dt; dirty = true; }
    if (dirty) drawBlocks();
  }
  // the ghost block that shows where yours would go
  const ghost = new T.Group();
  {
    const geo = new T.BoxGeometry(1.02, 1.02, 1.02).translate(0.5, 0.5, 0.5);
    ghost.fill = new T.Mesh(geo, new T.MeshBasicMaterial({ color: 0x3dff8b, transparent: true, opacity: 0.22, depthWrite: false }));
    ghost.edges = new T.LineSegments(new T.EdgesGeometry(geo), new T.LineBasicMaterial({ color: 0xffffff }));
    ghost.add(ghost.fill, ghost.edges);
    ghost.visible = false;
    scene.add(ghost);
  }
  let myTarget = null;
  function updateGhost() {
    myTarget = me && inPlay(me) && state === 'play' && me.blocks > 0 && brain.state === 'off' ? blockTarget(me) : null;
    ghost.visible = !!myTarget;
    if (!myTarget) return;
    ghost.position.set(myTarget.i - 0.01, myTarget.y0 - 0.01, myTarget.j - 0.01);
    ghost.fill.material.color.set(myTarget.ok ? 0x3dff8b : 0xff4d4d);
    ghost.edges.material.color.set(myTarget.ok ? 0xffffff : 0xff9a9a);
  }
  // F or the 🧱 button: right away, or (a friend's game) by asking the host
  function useBlock() {
    if (!me || !inPlay(me) || !(me.blocks > 0)) return;
    const t = myTarget || blockTarget(me);
    if (!t || !t.ok) { if (t) sfx.empty(); return; }
    if (mode === 'client') clientOut.blocks.push([t.i, t.j]);
    else placeBlock(me, t.i, t.j);
  }
  // friends' screens: the host's list of blocks
  function syncBlocks(list) {
    const ids = new Set(list.map((a) => a[0]));
    for (const b of blocks.slice()) if (!ids.has(b.id)) removeBlock(b, true);
    let changed = false;
    for (const [id, i, j, y0, hp, ownerId, color] of list) {
      const b = blocks.find((q) => q.id === id);
      if (!b) { addBlock(i, j, y0, byId(ownerId) || nobody(ownerId), color, id, hp); continue; }
      if (b.y0 !== y0) { b.y0 = y0; b.solid.y0 = y0; b.solid.h = y0 + 1; changed = true; }
      if (b.hp !== hp) { if (hp < b.hp) b.flash = 0.12; b.hp = hp; changed = true; }
    }
    if (changed) drawBlocks();
  }
  const blockList = () => blocks.map((b) => [b.id, b.i, b.j, r2(b.y0), b.hp, b.owner.id, b.color]);

  // ---------- Bots ----------
  function botHurt(b, shooter) {
    if (friendly(b, shooter.owner || shooter)) return;
    if (!b.target || !b.target.alive || b.target === shooter || Math.random() < 0.5) {
      if (b.target !== shooter) b.react = rand(0.25, 0.5);
      b.target = shooter; b.lastSeen = now; b.seenX = shooter.x; b.seenZ = shooter.z;
    }
    if ((b.hp === 1 || Math.random() < 0.25) && b.mode !== 'cover') {
      const c = findCover(b, shooter);
      if (c) { b.mode = 'cover'; b.cover = c; b.coverT = rand(2.5, 4); b.coverMax = 8; }
    }
  }
  function canSee(b, o) {
    const d = Math.hypot(o.x - b.x, o.z - b.z);
    if (d > SIGHT) return false;
    if (d > HIDE_NEAR && concealed(o)) return false;
    const hi = o.crouch ? 0.8 : 1.25, lo = o.crouch ? 0.35 : 0.6; // the top of their head and their middle
    return clearLine(b.x, eyeOf(b), b.z, o.x, o.y + hi, o.z, d > HIDE_NEAR) ||
      clearLine(b.x, eyeOf(b), b.z, o.x, o.y + lo, o.z, d > HIDE_NEAR);
  }
  function botPerceive(b) {
    let best = null, bestScore = Infinity;
    const fwx = -Math.sin(b.yaw), fwz = -Math.cos(b.yaw);
    for (const o of chars) {
      if (!inPlay(o) || friendly(b, o)) continue;
      const dx = o.x - b.x, dz = o.z - b.z, d = Math.hypot(dx, dz);
      if (d > SIGHT) continue;
      const alert = (b.hurtBy === o && b.hurtT > 0) || o === b.target;
      if (!alert && d > 7 && (dx * fwx + dz * fwz) / (d || 1) < 0.2) continue; // outside its view
      if (!canSee(b, o)) continue;
      const score = d - (o === b.target ? 6 : 0) + (o.shield > 0 ? 15 : 0);
      if (score < bestScore) { bestScore = score; best = o; }
    }
    // enemy turrets are fair game too (otherwise they'd never come down)
    for (const t of deploys) {
      if (t.type !== 'turret' || friendly(b, t.owner)) continue;
      const d = Math.hypot(t.x - b.x, t.z - b.z);
      if (d + 4 < bestScore && canSee(b, t)) { bestScore = d + 4; best = t; }
    }
    if (best) {
      if (best !== b.target) b.react = rand(0.55, 1.0); // a moment to react, so they don't snap onto you
      b.target = best; b.lastSeen = now; b.seenX = best.x; b.seenZ = best.z;
      if (b.mode === 'wander') b.mode = 'fight';
    } else if (b.target && (!b.target.alive || friendly(b, b.target) || now - b.lastSeen > 3)) {
      if (b.target.alive) { b.goal = { x: b.seenX, z: b.seenZ }; b.goalT = 8; } // go look where they were
      b.target = null;
      if (b.mode === 'fight') b.mode = 'wander';
    }
    // put a defense down in a fight (a heal station only once hurt)
    if (b.target && b.items.length && b.react <= 0 && Math.random() < 0.1) {
      const slot = b.hp < b.maxHp && b.items.includes('heal') ? b.items.indexOf('heal') : b.items.findIndex((k) => k !== 'heal');
      if (slot >= 0) placeItem(b, slot);
    }
    // team games: everyone rushes back when home is under attack
    if (teamMode && !b.target) { const g = baseGoal(b); if (g && g !== b.goalBase) newGoal(b); }
    // with nobody around: go heal up, or grab something lying nearby
    if (!b.target && b.mode === 'wander') {
      const heal = b.hp < b.maxHp && deploys.find((d) => d.type === 'heal' && Math.hypot(d.x - b.x, d.z - b.z) < 25);
      const goal = heal || drops.find((d) => Math.hypot(d.x - b.x, d.z - b.z) < 18 && (!POWERUPS[d.type].place || b.items.length < MAX_CARRY) &&
        clearLine(b.x, b.y + EYE, b.z, d.x, d.y + 0.8, d.z, false));
      if (goal) { b.goal = { x: goal.x, z: goal.z }; b.goalT = 8; b.goalNear = heal ? 0.6 : 0.5; }
    }
  }
  function findCover(b, threat) {
    let best = null, bestD = 18;
    for (const o of solids) {
      if (o.ramp || o.h < 1.8 || o.kind === 'trunk') continue;
      const cx = (o.x0 + o.x1) / 2, cz = (o.z0 + o.z1) / 2;
      const d = Math.hypot(cx - b.x, cz - b.z);
      if (d > bestD) continue;
      let ax = cx - threat.x, az = cz - threat.z; const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
      const ext = Math.abs(ax) * (o.x1 - o.x0) / 2 + Math.abs(az) * (o.z1 - o.z0) / 2;
      const px = cx + ax * (ext + 1), pz = cz + az * (ext + 1);
      if (Math.abs(px) > HALF - 1 || Math.abs(pz) > HALF - 1 || heightAt(px, pz, PLAYER_R) > 0.1) continue;
      if (clearLine(threat.x, threat.y + EYE, threat.z, px, 1.2, pz, false)) continue;
      best = { x: px, z: pz }; bestD = d;
    }
    return best;
  }
  function newGoal(b) {
    const base = baseGoal(b); // team games: attack an enemy base or guard home
    if (base) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * BASE_R * 0.6;
      b.goal = { x: base.x + Math.cos(a) * r, z: base.z + Math.sin(a) * r }; b.goalT = 10; b.goalBase = base;
      return;
    }
    const mate = chars.find((o) => o.alive && allied(o, b)); // stick near a teammate when there's nobody to fight
    if (mate && Math.random() < 0.8) { b.goal = { x: mate.x + rand(-3, 3), z: mate.z + rand(-3, 3) }; b.goalT = 4; return; }
    for (let k = 0; k < 10; k++) {
      const c = pick(navPoints);
      if (Math.hypot(c.x - b.x, c.z - b.z) < 30) { b.goal = { x: c.x, z: c.z }; b.goalT = 14; return; }
    }
    b.goal = { x: pick(navPoints).x, z: pick(navPoints).z }; b.goalT = 14;
  }
  // Steer toward a direction, sliding around whatever is in the way.
  function steer(b, dx, dz) {
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return [0, 0];
    dx /= len; dz /= len;
    const angs = [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.5, -2.5];
    for (const a0 of angs) {
      const a = a0 * b.side, cs = Math.cos(a), sn = Math.sin(a);
      const rx = dx * cs - dz * sn, rz = dx * sn + dz * cs;
      const h = heightAt(b.x + rx * 1.3, b.z + rz * 1.3, PLAYER_R);
      if (h <= b.y + STEP) return [rx, rz];
      if (a0 === 0 && h <= b.y + 1.5 && b.onGround && Math.random() < 0.5) { b.wantJump = true; return [rx, rz]; } // hop up
    }
    return [dx, dz];
  }
  function updateBot(b, dt) {
    b.think -= dt; b.hurtT -= dt;
    if (b.think <= 0) { b.think = 0.2; botPerceive(b); }
    if (b.cooldown > 0) b.cooldown -= dt;
    if (b.reload > 0) { b.reload -= dt; if (b.reload <= 0) b.ammo = b.magSize; }
    const BS = BOT_SPEED * (b.buffs.speed ? 1.3 : 1);
    let mx = 0, mz = 0, speed = BS, faceYaw = null;
    b.crouch = false;
    const t = b.target && b.target.alive ? b.target : null;
    if (b.mode === 'cover' && b.cover) {
      const dx = b.cover.x - b.x, dz = b.cover.z - b.z, d = Math.hypot(dx, dz);
      if (d > 0.8) { [mx, mz] = steer(b, dx, dz); speed = BS * 1.2; }
      else { b.coverT -= dt; b.crouch = true; if (b.ammo < b.magSize) startReload(b); } // duck down behind it
      b.coverMax -= dt;
      if (b.coverT <= 0 || b.coverMax <= 0) { b.mode = t ? 'fight' : 'wander'; b.cover = null; }
      if (t) faceYaw = Math.atan2(-(t.x - b.x), -(t.z - b.z));
    } else if (t) {
      const dx = t.x - b.x, dz = t.z - b.z, d = Math.hypot(dx, dz);
      faceYaw = Math.atan2(-dx, -dz);
      b.strafeT -= dt;
      if (b.strafeT <= 0) { b.strafe = Math.random() < 0.5 ? -1 : 1; b.strafeT = rand(0.8, 2); if (Math.random() < 0.25) b.strafe = 0; }
      const ux = dx / (d || 1), uz = dz / (d || 1);
      const radial = d > 20 ? 1 : d < 8 ? -0.8 : 0;
      [mx, mz] = steer(b, ux * radial + -uz * b.strafe, uz * radial + ux * b.strafe);
      if (radial === 0 && b.strafe === 0) { mx = 0; mz = 0; }
      speed = BS * 0.75;
    } else if (b.hp < b.maxHp && inHeal(b)) {
      // stand in the heal station until healed
    } else {
      if (!b.goal || (b.goalT -= dt) <= 0) newGoal(b);
      const dx = b.goal.x - b.x, dz = b.goal.z - b.z, d = Math.hypot(dx, dz);
      if (d < (b.goalNear || 1.5)) { b.goal = null; b.goalT = 0; b.goalNear = 0; }
      else [mx, mz] = steer(b, dx, dz);
      if (b.ammo < b.magSize && b.reload <= 0) startReload(b);
    }
    // stuck? pick somewhere else and go around the other way
    b.stuckT += dt;
    if (b.stuckT > 1.5) {
      if ((mx || mz) && Math.hypot(b.x - b.lastX, b.z - b.lastZ) < 0.6) { b.side = -b.side; newGoal(b); if (b.mode === 'cover') b.coverT = 0; }
      b.stuckT = 0; b.lastX = b.x; b.lastZ = b.z;
    }
    const k = Math.min(1, dt * 8);
    b.vx += (mx * speed - b.vx) * k; b.vz += (mz * speed - b.vz) * k;
    if (b.wantJump) { jump(b); b.wantJump = false; }
    physics(b, dt);
    if (faceYaw == null && (Math.abs(b.vx) + Math.abs(b.vz) > 0.5)) faceYaw = Math.atan2(-b.vx, -b.vz);
    if (faceYaw != null) b.yaw += clamp(angDiff(b.yaw, faceYaw), -4 * dt, 4 * dt);

    // shooting: wait to react, then short bursts with wobbly aim
    if (t) {
      if (b.react > 0) b.react -= dt;
      const seenRecently = now - b.lastSeen < 0.35;
      const facing = Math.abs(angDiff(b.yaw, faceYaw)) < 0.25;
      if (b.react <= 0 && seenRecently && facing && canShoot(b) && t.shield <= 0) {
        if (b.burst <= 0) { b.burst = 2 + ((Math.random() * 3) | 0); }
        botShoot(b, t);
        b.burst--;
        b.cooldown = (b.burst > 0 ? 0.24 : rand(0.9, 1.7)) * (b.buffs.rapid ? 0.6 : 1);
      }
    }
  }
  function botShoot(b, t) {
    const ox = b.x, oy = b.y + (b.crouch ? 0.6 : 1.0), oz = b.z;
    const tx = t.x, ty = t.aimH ? t.y + t.aimH : midOf(t), tz = t.z;
    const d = Math.hypot(tx - ox, tz - oz), time = d / BALL_SPEED;
    let yaw = Math.atan2(-(tx - ox), -(tz - oz));
    let pitch = Math.atan2(ty - oy + 0.5 * BALL_GRAVITY * time * time, d);
    const err = 0.045 + Math.random() * 0.03;
    yaw += (Math.random() * 2 - 1) * err; pitch += (Math.random() * 2 - 1) * err * 0.6;
    const cp = Math.cos(pitch);
    launch(b, ox - Math.sin(yaw) * 0.6, oy, oz - Math.cos(yaw) * 0.6, -Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
    useAmmo(b);
    if (me && state === 'play') { const dd = Math.hypot(b.x - me.x, b.z - me.z); if (dd < 40) sfx.shot(0.45 * (1 - dd / 40)); }
  }

  // ---------- You ----------
  let me = null;
  let state = 'menu'; // menu | play | pause
  let now = 0;
  const keys = {};
  const input = { fire: false, jump: false, sprintTouch: false, stickX: 0, stickY: 0 };
  let touchMode = coarse;

  // gun in your hands
  const vm = new T.Group();
  {
    const body = new T.Mesh(new T.BoxGeometry(0.09, 0.11, 0.42), new T.MeshLambertMaterial({ color: 0x3c4560 }));
    const barrel = new T.Mesh(new T.CylinderGeometry(0.022, 0.026, 0.34, 10).rotateX(Math.PI / 2), new T.MeshLambertMaterial({ color: 0x252b3d }));
    barrel.position.set(0, 0.015, -0.36);
    const grip = new T.Mesh(new T.BoxGeometry(0.06, 0.14, 0.07), new T.MeshLambertMaterial({ color: 0x252b3d }));
    grip.position.set(0, -0.1, 0.1); grip.rotation.x = 0.25;
    vm.hopperMat = new T.MeshLambertMaterial({ color: 0xff3d7f });
    const hop = new T.Mesh(new T.SphereGeometry(0.075, 14, 10), vm.hopperMat); hop.position.set(0, 0.12, -0.03); hop.scale.set(1, 0.9, 1.3);
    const neck = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 0.06, 8), vm.hopperMat); neck.position.set(0, 0.07, -0.05);
    const flash = new T.Mesh(new T.SphereGeometry(0.05, 10, 8), vm.hopperMat.clone()); flash.position.set(0, 0.015, -0.56); flash.visible = false;
    vm.flash = flash; vm.hop = hop;
    vm.add(body, barrel, grip, hop, neck, flash);
    vm.base = new T.Vector3(0.16, -0.15, -0.4); // placed on screen in resize()
    vm.scale.setScalar(0.62);
    vm.position.copy(vm.base);
    vmScene.add(vm);
  }
  let recoil = 0, flashT = 0, bobT = 0;

  function shootMe() {
    if (!canShoot(me)) { if (me.ammo <= 0) startReload(me); return; }
    // aim at whatever is under the crosshair, starting from the gun barrel
    const cp = Math.cos(me.pitch), ex = me.x, ey = eyeOf(me), ez = me.z;
    let dx = -Math.sin(me.yaw) * cp, dy = Math.sin(me.pitch), dz = -Math.cos(me.yaw) * cp;
    if (touchMode) [dx, dy, dz] = aimAssist(ex, ey, ez, dx, dy, dz);
    let dist = 60;
    for (let s = 0.5; s < 60; s += 0.5) {
      const x = ex + dx * s, y = ey + dy * s, z = ez + dz * s;
      if (y < 0 || y < heightAt(x, z, 0)) { dist = s; break; }
      let hit = false;
      for (const c of chars) if (c !== me && c.alive && hitsBody(c, x, y, z)) { hit = true; break; }
      if (hit) { dist = s; break; }
    }
    const rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw);
    const ox = ex + rx * 0.16 + dx * 0.5, oy = ey - 0.16 + dy * 0.5, oz = ez + rz * 0.16 + dz * 0.5;
    const tx = ex + dx * dist, ty = ey + dy * dist, tz = ez + dz * dist;
    let ax = tx - ox, ay = ty - oy, az = tz - oz;
    const al = Math.hypot(ax, ay, az); ax /= al; ay /= al; az /= al;
    const sp = 0.008;
    ax += rand(-sp, sp); ay += rand(-sp, sp); az += rand(-sp, sp);
    launch(me, ox, oy, oz, ax, ay, az);
    if (mode === 'client') clientOut.shots.push([ox, oy, oz, ax, ay, az].map((v) => Math.round(v * 1000) / 1000)); // the host fires the real one
    useAmmo(me);
    sfx.shot(0.9);
    recoil = 1; flashT = 0.05;
  }
  // place a carried defense: right away, or (a friend's game) by asking the host
  function useSlot(slot) {
    if (!me || !me.alive || slot < 0 || slot >= me.items.length) return;
    if (mode === 'client') clientOut.uses.push(slot);
    else placeItem(me, slot);
  }
  // On touch screens, paint bends a little toward someone close to the crosshair.
  function aimAssist(ex, ey, ez, dx, dy, dz) {
    let best = null, bestA = 0.06;
    for (const c of chars) {
      if (c === me || !c.alive) continue;
      const tx = c.x - ex, ty = midOf(c) - ey, tz = c.z - ez;
      const d = Math.hypot(tx, ty, tz);
      if (d > 35) continue;
      const a = Math.acos(clamp((tx * dx + ty * dy + tz * dz) / d, -1, 1));
      if (a < bestA && !friendly(me, c) && !(concealed(c) && d > HIDE_NEAR) && clearLine(ex, ey, ez, c.x, midOf(c), c.z, false)) { bestA = a; best = [tx / d, ty / d, tz / d]; }
    }
    if (!best) return [dx, dy, dz];
    const k = 0.6, x = dx + (best[0] - dx) * k, y = dy + (best[1] - dy) * k, z = dz + (best[2] - dz) * k, l = Math.hypot(x, y, z);
    return [x / l, y / l, z / l];
  }

  function updateMe(dt) {
    if (me.cooldown > 0) me.cooldown -= dt;
    if (me.reload > 0) { me.reload -= dt; if (me.reload <= 0) me.ammo = me.magSize; }
    let fwd = 0, side = 0;
    if (keys.KeyW || keys.ArrowUp) fwd += 1;
    if (keys.KeyS || keys.ArrowDown) fwd -= 1;
    if (keys.KeyD || keys.ArrowRight) side += 1;
    if (keys.KeyA || keys.ArrowLeft) side -= 1;
    fwd += -input.stickY; side += input.stickX;
    const mag = Math.hypot(fwd, side);
    if (mag > 1) { fwd /= mag; side /= mag; }
    me.crouch = !!(keys.KeyC || input.duck);
    const sprintWanted = (keys.ShiftLeft || keys.ShiftRight || input.sprintTouch) && fwd > 0.3 && !me.crouch;
    let speed = WALK * (me.buffs.speed ? 1.3 : 1) * (me.crouch ? DUCK_SPEED : 1);
    if (sprintWanted && me.stamina > 0) { speed *= SPRINT_MULT; me.stamina = Math.max(0, me.stamina - dt); me.sprintLock = 0.6; }
    else { me.sprintLock = (me.sprintLock || 0) - dt; if (me.sprintLock <= 0) me.stamina = Math.min(STAMINA_MAX, me.stamina + dt * 0.6); }
    if (concealed(me)) speed *= 0.85;
    const sn = Math.sin(me.yaw), cs = Math.cos(me.yaw);
    const wx = -sn * fwd + cs * side, wz = -cs * fwd - sn * side;
    const k = Math.min(1, dt * (me.onGround ? 14 : 3));
    me.vx += (wx * speed - me.vx) * k; me.vz += (wz * speed - me.vz) * k;
    if (keys.Space || input.jump) jump(me);
    physics(me, dt);
    if (input.fire || mouseDown) shootMe();
  }

  // ---------- Input: mouse + keyboard, or touch. Switches by what you last used. ----------
  let mouseDown = false, locked = false;
  function setTouchMode(on) {
    if (touchMode === on) return;
    touchMode = on;
    document.body.classList.toggle('touch', on);
    $('touch').hidden = !(on && state === 'play');
    resize();
    if (on && locked) document.exitPointerLock();
    if (!on && state === 'play' && !locked && !TEST) pause();
  }
  document.body.classList.toggle('touch', touchMode);
  window.addEventListener('touchstart', () => setTouchMode(true), { passive: true, capture: true });
  window.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && (e.movementX || e.movementY)) setTouchMode(false); });
  function lockPointer() {
    if (TEST || touchMode) return;
    try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* not allowed here */ }
  }
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (locked && state === 'pause') resume();
    if (!locked && state === 'play' && !touchMode && !TEST && !panelOpen && $('gameover').hidden && brain.state === 'off') pause();
  });
  canvas.addEventListener('mousedown', (e) => {
    if (state !== 'play' || touchMode || brain.state !== 'off') return;
    if (!locked && !TEST) { lockPointer(); return; }
    if (e.button === 0) { initAudio(); mouseDown = true; }
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('mousedown', (e) => { if (e.button === 2 && state === 'play' && me && (locked || TEST)) useSlot(me.sel); });
  window.addEventListener('wheel', (e) => { if (state === 'play' && me && (locked || TEST)) cycleSlot(e.deltaY > 0 ? 1 : -1); }, { passive: true });
  function cycleSlot(dir) { if (me.items.length > 1) me.sel = (me.sel + dir + me.items.length) % me.items.length; }
  document.addEventListener('mousemove', (e) => {
    if (state !== 'play' || !me || !me.alive || panelOpen || (!locked && !TEST)) return;
    const mx = clamp(e.movementX, -250, 250), my = clamp(e.movementY, -250, 250);
    me.yaw -= mx * 0.0024; me.pitch = clamp(me.pitch - my * 0.0024, -1.45, 1.45);
  });
  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') { if (e.code === 'Enter') { if (e.target.id === 'code') joinGame(); else startGame(); } return; }
    setTouchMode(false);
    if (brain.state !== 'off' && (state === 'play' || state === 'pause')) { // the Brain Boost card: 1/2/3 answer, Enter or Space goes on
      const n = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].indexOf(e.code);
      if (n >= 0) { brainKey(n % 3); e.preventDefault(); return; }
      if ((e.code === 'Enter' || e.code === 'Space') && brainEl.querySelector('.go')) { e.preventDefault(); brainEl.querySelector('.go').click(); return; }
    }
    keys[e.code] = true;
    if (state === 'play' && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (state === 'play' && e.code === 'KeyR' && me) startReload(me);
    if (state === 'play' && me) { // defenses: 1/2/3 place that slot, E the highlighted one, Tab moves the highlight
      const n = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (n >= 0) useSlot(n);
      if (e.code === 'KeyE') useSlot(me.sel);
      if (e.code === 'KeyF') useBlock();
      if (e.code === 'Tab') { e.preventDefault(); cycleSlot(1); }
    }
    if (state === 'play' && e.code === 'KeyP' && !panelOpen) pause();
    if (state === 'play' && e.code === 'KeyT') { panelOpen ? closeTeams() : openTeams(); }
    if (state === 'play' && e.code === 'Escape' && panelOpen) closeTeams();
    if (state === 'play' && askFrom && (e.code === 'KeyY' || e.code === 'KeyN')) requestTeam(e.code === 'KeyY' ? 'accept' : 'decline', askFrom);
    if (state === 'menu' && e.code === 'Enter') startGame();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseDown = false; });

  // touch: left side is a thumbstick that appears where you put your thumb, right side drags to look
  const touchEl = $('touch'), stickEl = $('stick'), knobEl = $('knob');
  const touches = new Map(); // id -> {kind, x, y, ox, oy}
  const STICK_R = 55;
  function touchStart(e) {
    if (state !== 'play') return;
    e.preventDefault();
    initAudio();
    for (const t of e.changedTouches) {
      const btn = t.target.closest && t.target.closest('[data-t]');
      const kind = btn ? btn.dataset.t : (t.clientX < innerWidth * 0.42 && ![...touches.values()].some((v) => v.kind === 'move') ? 'move' : 'look');
      touches.set(t.identifier, { kind, x: t.clientX, y: t.clientY, ox: t.clientX, oy: t.clientY, btn });
      if (btn) btn.classList.add('on');
      if (kind === 'move') { stickEl.hidden = false; stickEl.style.left = t.clientX + 'px'; stickEl.style.top = t.clientY + 'px'; knobEl.style.transform = ''; $('stickHint').hidden = true; }
      if (kind === 'fire') input.fire = true;
      if (kind === 'jump') input.jump = true;
      if (kind === 'reload' && me) startReload(me);
      if (kind === 'block') useBlock();
      if (kind === 'duck') { input.duck = !input.duck; btn.classList.toggle('lit', input.duck); }
    }
  }
  function touchMove(e) {
    if (state !== 'play') return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      const s = touches.get(t.identifier);
      if (!s) continue;
      if (s.kind === 'move') {
        let dx = t.clientX - s.ox, dy = t.clientY - s.oy;
        const d = Math.hypot(dx, dy);
        if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
        input.stickX = dx / STICK_R; input.stickY = dy / STICK_R;
        input.sprintTouch = d > STICK_R * 1.15 && dy < 0; // push past the edge to run
        knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
      } else if ((s.kind === 'look' || s.kind === 'fire') && me && me.alive) {
        const dx = t.clientX - s.x, dy = t.clientY - s.y;
        me.yaw -= dx * 0.0055; me.pitch = clamp(me.pitch - dy * 0.0055, -1.45, 1.45);
      }
      s.x = t.clientX; s.y = t.clientY;
    }
  }
  function touchEnd(e) {
    for (const t of e.changedTouches) {
      const s = touches.get(t.identifier);
      if (!s) continue;
      touches.delete(t.identifier);
      if (s.btn) s.btn.classList.remove('on');
      if (s.kind === 'move') { input.stickX = input.stickY = 0; input.sprintTouch = false; stickEl.hidden = true; }
      if (s.kind === 'fire') input.fire = false;
      if (s.kind === 'jump') input.jump = false;
    }
  }
  touchEl.addEventListener('touchstart', touchStart, { passive: false });
  touchEl.addEventListener('touchmove', touchMove, { passive: false });
  touchEl.addEventListener('touchend', touchEnd);
  touchEl.addEventListener('touchcancel', touchEnd);
  function clearTouches() {
    touches.clear(); input.fire = input.jump = input.sprintTouch = input.duck = false;
    $('tDuck').classList.remove('lit'); input.stickX = input.stickY = 0; stickEl.hidden = true;
    document.querySelectorAll('.tb.on').forEach((b) => b.classList.remove('on'));
  }

  // ---------- HUD ----------
  const hud = $('hud'), hitEl = $('hitmark'), splatEl = $('splat'), feedEl = $('feed'), boardEl = $('board');
  const heartsEl = $('hearts'), ammoN = $('ammoN'), ballsEl = $('balls'), reloadEl = $('reload'), stamEl = $('stam');
  const deadEl = $('dead'), buffsEl = $('buffs'), slotsEl = $('slots');
  slotsEl.addEventListener('click', (e) => { // touch: tap a carried defense to place it
    const b = e.target.closest('[data-slot]');
    if (b && state === 'play' && me) useSlot(+b.dataset.slot);
  });
  let hitAnim = null;
  function hitMarker(kill) {
    hitEl.classList.toggle('kill', kill);
    if (kill) hitEl.style.setProperty('--kc', me.color);
    if (hitAnim) hitAnim.cancel();
    hitAnim = hitEl.animate([{ opacity: 1, transform: 'scale(1.3)' }, { opacity: 1, transform: 'scale(1)', offset: 0.3 }, { opacity: 0, transform: 'scale(1)' }],
      { duration: kill ? 600 : 320, easing: 'ease-out' });
  }
  function splatPopup(victim, streak) {
    splatEl.style.setProperty('--kc', me.color);
    splatEl.querySelector('.who').textContent = `You splatted ${victim.name}!` + (streak >= 3 ? `  🔥 ${streak} in a row` : '');
    splatEl.classList.remove('show'); void splatEl.offsetWidth; splatEl.classList.add('show');
  }
  function hurtFx(from, color) {
    sfx.hurt();
    const h = $('hurt');
    h.style.setProperty('--hc', color);
    h.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 600, easing: 'ease-out' });
    // a paint splat on the screen, on the side the shot came from
    const a = angDiff(me.yaw, Math.atan2(-(from.x - me.x), -(from.z - me.z)));
    const sx = 50 - Math.sin(a) * 30, sy = 50 - Math.cos(a) * 26;
    const d = document.createElement('div');
    d.style.cssText = `left:${clamp(sx, 12, 88)}%;top:${clamp(sy, 15, 85)}%;background:${color};-webkit-mask-image:url(${blobURL});mask-image:url(${blobURL});transform:rotate(${rand(0, 360)}deg)`;
    $('splats').appendChild(d);
    setTimeout(() => d.remove(), 1700);
  }
  const feed = [];
  function addFeed(killer, victim, how) {
    const nm = (p) => `<b style="color:${p.color}">${p === me ? 'You' : esc(p.name)}</b>`;
    const el = document.createElement('div');
    el.innerHTML = `${nm(killer)} <span style="opacity:.8">${how ? how + ' ' : ''}splatted</span> ${nm(victim)}`;
    pushFeed(el);
  }
  function addNote(html) { // a line in the feed that isn't a splat ("Mango joined the game")
    const el = document.createElement('div');
    el.className = 'note';
    el.innerHTML = html;
    pushFeed(el);
  }
  function pushFeed(el) {
    feedEl.prepend(el);
    feed.unshift({ el, t: now });
    while (feed.length > 5) feed.pop().el.remove();
  }
  const toastEl = $('toast');
  function toast(html, color) {
    toastEl.innerHTML = html;
    toastEl.style.setProperty('--tc', color);
    toastEl.classList.remove('show'); void toastEl.offsetWidth; toastEl.classList.add('show');
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function setDeadUI(on, killer) {
    deadEl.hidden = !on;
    $('cross').hidden = on;
    if (on) deadEl.querySelector('.t').innerHTML = `Splatted by <span style="color:${killer.color}">${esc(killer.name)}</span>!`;
  }
  let hudKey = '', boardT = 0;
  function updateHUD(dt) {
    const key = [me.blocks, me.hp, me.maxHp, me.ammo, me.magSize, me.reload > 0, me.color, Object.keys(me.buffs).join(), me.items.join(), me.sel, touchMode, mode, teamMode].join(',');
    if (key !== hudKey) {
      hudKey = key;
      heartsEl.innerHTML = Array.from({ length: me.maxHp }, (_, i) => `<span class="${i < me.hp ? '' : 'off'}">❤</span>`).join('');
      ammoN.textContent = me.ammo;
      $('ammoM').textContent = me.magSize;
      ballsEl.innerHTML = Array.from({ length: me.magSize }, (_, i) => `<i class="${i < me.ammo ? '' : 'off'}"></i>`).join('');
      reloadEl.hidden = !(me.reload > 0);
      // boosts you have, and your 3 defense slots
      const bs = Object.keys(POWERUPS).filter((k) => !POWERUPS[k].place && (me.buffs[k] || (k === 'heart' && me.maxHp > PLAYER_HP)));
      buffsEl.innerHTML = bs.map((k) => `<span title="${POWERUPS[k].name}" style="background:${POWERUPS[k].color}">${POWERUPS[k].icon}</span>`).join('');
      buffsEl.hidden = !bs.length;
      slotsEl.innerHTML = Array.from({ length: MAX_CARRY }, (_, i) => {
        const k = me.items[i];
        if (!k) return `<button class="slot empty" tabindex="-1"><small>${i + 1}</small></button>`;
        const P = POWERUPS[k];
        return `<button class="slot${i === me.sel ? ' sel' : ''}" data-slot="${i}" tabindex="-1" style="--ic:${P.color}" aria-label="Place ${P.name}">` +
          `<span>${P.icon}</span><small>${touchMode ? '' : i + 1}</small><em>${P.name}</em></button>`;
      }).join('');
      slotsEl.hidden = !me.items.length;
      // touch: the slots sit just above the hearts and ammo, however tall those are
      slotsEl.style.bottom = touchMode && innerWidth > innerHeight ? Math.max($('health').offsetHeight, $('ammo').offsetHeight) + 14 + 'px' : '';
      const gc = me.buffs.golden ? GOLD : me.color;
      vm.hopperMat.color.set(gc); vm.flash.material.color.set(gc);
      const nb = me.blocks || 0;
      $('blocksHud').hidden = !nb || touchMode;
      $('blocksN').textContent = nb;
      $('tBlock').innerHTML = `🧱<small>${nb}</small>`;
      $('tBlock').classList.toggle('none', !nb);
      $('teamBtn').innerHTML = (teamMode ? '👥 Teams' : '🤝 Team up') + (touchMode ? '' : ' <span class="key">T</span>');
    }
    if (me.reload > 0) reloadEl.querySelector('i').style.width = ((1 - me.reload / RELOAD_TIME) * 100).toFixed(0) + '%';
    stamEl.style.visibility = me.stamina < STAMINA_MAX ? 'visible' : 'hidden';
    stamEl.firstChild.style.width = ((me.stamina / STAMINA_MAX) * 100).toFixed(0) + '%';
    $('shieldTag').hidden = !(me.alive && me.shield > 0);
    const hidden = me.alive && concealed(me);
    $('hiddenTag').hidden = !hidden;
    $('leafy').style.opacity = hidden ? 1 : 0;
    $('shieldFx').style.opacity = me.alive && me.shield > 0 ? 1 : 0;
    if (!me.alive) deadEl.querySelector('.c').textContent = `Back in ${Math.max(1, Math.ceil(me.respawn))}…`;
    for (const f of feed) f.el.style.opacity = now - f.t > 6 ? 0 : 1;
    boardT -= dt;
    if (boardT <= 0) {
      boardT = 0.25;
      const sorted = [...chars].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      let html;
      if (teamMode) { // each team's size and splats, then you
        const teams = activeTeams().map((t) => ({ t, n: chars.filter((p) => p.team === t).length, k: chars.filter((p) => p.team === t).reduce((a, p) => a + p.kills, 0) }))
          .sort((a, b) => b.k - a.k);
        html = '<div class="h">Teams · players · splats</div>' + teams.map(({ t, n, k }) =>
          `<div class="r${t === me.team ? ' me' : ''}"><span class="d" style="background:${TEAM_INFO[t].color}"></span><span class="nm">${TEAM_INFO[t].name}</span><span class="n">${n}</span><span>${k}</span></div>`).join('') +
          `<div class="r me"><span class="d" style="background:${me.color}"></span><span class="nm">You</span><span class="n"></span><span>${me.kills}</span></div>`;
      } else {
        let rows = sorted.slice(0, touchMode ? 3 : 5);
        if (!rows.includes(me)) rows = [...rows, me];
        html = '<div class="h">Splats</div>' + rows.map((p) =>
          `<div class="r${p === me ? ' me' : ''}"><span class="d" style="background:${p.color}"></span><span class="nm">${sorted.indexOf(p) + 1}. ${esc(p.name)}${allied(me, p) ? ' 🤝' : ''}${p.away ? ' 💤' : ''}</span><span>${p.kills}</span></div>`).join('');
      }
      const bs = brainScoreText();
      boardEl.innerHTML = html + (bs ? `<div class="bscore">${bs}</div>` : '');
      updateSightings();
      if (panelOpen) renderTeams();
      updateCapBar();
    }
    updateAsk();
    brainTick();
    $('teamBtn').hidden = !(state === 'play' && me);
    drawMap();
  }
  // team games: how a capture is going, at the top of the screen
  function updateCapBar() {
    const el = $('capBar');
    let text = '', color = '#fff', pct = 0;
    if (teamMode && me && gameOver == null) {
      const home = bases.find((b) => b.alive && b.team === me.team);
      const here = bases.find((b) => b.alive && Math.hypot(me.x - b.x, me.z - b.z) < BASE_R);
      if (home && home.cap > 0 && home.capTeam !== me.team && home.capTeam != null) {
        text = `⚠ Team ${TEAM_INFO[home.capTeam].name} is taking your base! Get back there!`; color = TEAM_INFO[home.capTeam].color; pct = home.cap;
      } else if (here && here.team !== me.team && me.alive) {
        const T0 = TEAM_INFO[here.team];
        text = here.cap > 0 && here.capTeam === me.team ? `Capturing Team ${T0.name}'s base…` : here.cap > 0 ? 'Contested!' : `Team ${T0.name}'s base: bring more of your team than they have here`;
        color = here.capTeam != null ? TEAM_INFO[here.capTeam].color : me.color; pct = here.cap;
      } else if (here && here.team === me.team && here.cap > 0) {
        text = 'Defend your base!'; color = TEAM_INFO[here.capTeam].color; pct = here.cap;
      }
    }
    el.hidden = !text;
    if (text) { el.querySelector('span').textContent = text; el.style.setProperty('--cc', color); el.querySelector('i').style.width = Math.round(pct * 100) + '%'; }
  }

  // ---------- Minimap: turns with you, shows people you can see ----------
  const mapEl = $('map'), mctx = mapEl.getContext('2d');
  const MAP_PX = 4; // pixels per meter on the prerendered map
  const mapImg = document.createElement('canvas');
  mapImg.width = mapImg.height = ARENA * MAP_PX;
  {
    const c = mapImg.getContext('2d'), P = (v) => (v + HALF) * MAP_PX;
    c.fillStyle = '#4f9a3c'; c.fillRect(0, 0, mapImg.width, mapImg.height);
    for (const h of hideZones) { c.fillStyle = h.kind === 'tree' ? '#2d6b2a' : '#3f8a35'; c.beginPath(); c.arc(P(h.x), P(h.z), h.r * MAP_PX, 0, 7); c.fill(); }
    for (const o of markers) {
      c.fillStyle = o.ramp ? '#ffb46b' : o.kind === 'crate' ? '#d9a35b' : o.kind === 'rock' ? '#a7a9b0' : o.kind === 'tower' ? '#fff0b8' : o.h > 2 ? '#f2f4f8' : '#c9ced8';
      c.fillRect(P(o.x0), P(o.z0), (o.x1 - o.x0) * MAP_PX, (o.z1 - o.z0) * MAP_PX);
    }
    c.strokeStyle = '#ffffff'; c.lineWidth = 6; c.strokeRect(0, 0, mapImg.width, mapImg.height);
  }
  const seenOnMap = new Map();
  function updateSightings() {
    for (const c of chars) {
      if (c === me || !c.alive || !me.alive) continue;
      if (canSee(me, c)) seenOnMap.set(c, now);
    }
  }
  function drawMap() {
    const W = mapEl.width, view = 64, s = W / view; // shows 64 m across
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, W, W);
    mctx.translate(W / 2, W / 2);
    mctx.rotate(me.yaw);
    mctx.scale(s / MAP_PX, s / MAP_PX);
    mctx.drawImage(mapImg, -(me.x + HALF) * MAP_PX, -(me.z + HALF) * MAP_PX);
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    const cs = Math.cos(me.yaw), sn = Math.sin(me.yaw);
    const mx = (x, z) => [((x - me.x) * cs - (z - me.z) * sn) * s + W / 2, ((x - me.x) * sn + (z - me.z) * cs) * s + W / 2];
    for (const d of deploys) {
      if (d.type === 'mine' && !friendly(me, d.owner)) continue; // only your side's mines show
      const [x, y] = mx(d.x, d.z);
      mctx.beginPath();
      if (d.type === 'wall') {
        const long = d.w > d.d, h = (long ? d.w : d.d) / 2;
        const [x0, y0] = mx(d.x - (long ? h : 0), d.z - (long ? 0 : h)), [x1, y1] = mx(d.x + (long ? h : 0), d.z + (long ? 0 : h));
        mctx.moveTo(x0, y0); mctx.lineTo(x1, y1); mctx.lineWidth = 6; mctx.strokeStyle = '#ffffff'; mctx.stroke();
        continue;
      }
      const r = d.type === 'heal' || d.type === 'dome' || d.type === 'bush' ? DEPLOY[d.type].r * s : 6;
      mctx.arc(x, y, r, 0, 7);
      mctx.fillStyle = d.type === 'turret' || d.type === 'mine' ? d.color : POWERUPS[d.type].color + '99';
      mctx.fill();
    }
    for (const d of drops) {
      const [x, y] = mx(d.x, d.z);
      mctx.beginPath(); mctx.arc(x, y, 7, 0, 7); mctx.fillStyle = POWERUPS[d.type].color; mctx.fill();
      mctx.lineWidth = 3; mctx.strokeStyle = '#ffffff'; mctx.stroke();
    }
    for (const b of bases) {
      if (!b.alive) continue;
      const [x, y] = mx(b.x, b.z);
      mctx.beginPath(); mctx.arc(x, y, BASE_R * s, 0, 7);
      mctx.fillStyle = TEAM_INFO[b.team].color + '55'; mctx.fill();
      mctx.lineWidth = 4; mctx.strokeStyle = TEAM_INFO[b.team].color; mctx.stroke();
    }
    for (const c of chars) {
      if (c === me || !c.alive) continue;
      const mate = friendly(me, c);
      if (!mate && now - (seenOnMap.get(c) || -99) > 1.5) continue; // teammates always show; others only while you can see them
      const [x, y] = mx(c.x, c.z);
      mctx.beginPath(); mctx.arc(x, y, 9, 0, 7); mctx.fillStyle = mate && !teamMode ? '#3dff8b' : c.color; mctx.fill();
      mctx.lineWidth = 3; mctx.strokeStyle = mate ? '#ffffff' : '#1c2230'; mctx.stroke();
    }
    // you: an arrow pointing up
    mctx.translate(W / 2, W / 2);
    mctx.beginPath(); mctx.moveTo(0, -16); mctx.lineTo(11, 12); mctx.lineTo(0, 6); mctx.lineTo(-11, 12); mctx.closePath();
    mctx.fillStyle = me.color; mctx.fill(); mctx.lineWidth = 3; mctx.strokeStyle = '#fff'; mctx.stroke();
    mctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---------- Screens ----------
  const menuEl = $('menu'), pauseEl = $('pause'), nameEl = $('name'), colorsEl = $('colors');
  const profile = store.get('pbw3d-profile') || {};
  let chosenColor = COLORS.includes(profile.color) ? profile.color : COLORS[0];
  nameEl.value = typeof profile.name === 'string' ? profile.name.slice(0, 12) : '';
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.style.background = c; b.setAttribute('aria-label', 'color ' + c);
    if (c === chosenColor) b.classList.add('sel');
    b.onclick = () => { chosenColor = c; colorsEl.querySelectorAll('button').forEach((x) => x.classList.toggle('sel', x === b)); };
    colorsEl.appendChild(b);
  }
  $('play').onclick = startGame;
  $('resume').onclick = () => { initAudio(); if (touchMode || TEST) resume(); else lockPointer(); };
  $('quit').onclick = () => { if (mode === 'solo') toMenu(); else leaveGame(); };
  $('pauseBtn').addEventListener('click', pause);
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') pause(); });

  const bots = [];
  const shuffledNames = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  function makeBots() { // a solo game (and the view behind the start screen)
    for (let i = 0; i < NUM_BOTS; i++) addBot(null);
  }
  // clear the arena: nobody in it, no paint, no items, no team-ups
  function resetWorld() {
    if (brain.state !== 'off') { clearGoRows(); brainEl.hidden = true; brain.state = 'off'; }
    brain.seen = null;
    removeAllChars();
    clearDecals(); clearItems(); clearBases();
    balls.length = 0;
    alliances = {}; requests = {}; botAnswers = {};
    feed.length = 0; feedEl.innerHTML = '';
    for (let i = 0; i < parts.length; i++) parts[i] = null;
    partPos.fill(-999); partGeo.attributes.position.needsUpdate = true;
    seenOnMap.clear();
  }
  function myColorChanged() {
    const c = me.buffs && me.buffs.golden ? GOLD : me.color;
    vm.hopperMat.color.set(c); vm.flash.material.color.set(c);
    document.documentElement.style.setProperty('--me', me.color);
    hudKey = '';
  }
  // from the start screen, the lobby, or joining: into the game
  function enterPlay() {
    me.m.g.visible = false;
    myColorChanged();
    hudKey = '';
    menuEl.hidden = true; lobbyEl.hidden = true; hud.hidden = false; pauseEl.hidden = true;
    setDeadUI(!me.alive && mode !== 'client', nobody('?'));
    if (document.activeElement) document.activeElement.blur();
    state = 'play';
    $('touch').hidden = !touchMode;
    $('stickHint').hidden = false;
    $('quit').textContent = mode === 'solo' ? 'Back to start' : 'Leave game';
    $('pauseNote').textContent = mode === 'solo' ? '' : "The game keeps going while you're paused.";
    lockPointer();
  }
  function startGame() {
    if (state === 'play' || mode !== 'solo') return;
    initAudio();
    saveProfile();
    const name = myName();
    teamMode = 0;
    if (!me) { me = makeChar(name, chosenColor, false, 'p1'); }
    me.name = name; me.ownColor = chosenColor; setColor(me, chosenColor);
    // bots wear the other colors
    const others = COLORS.filter((c) => c !== chosenColor);
    bots.forEach((b, i) => setColor(b, others[i % others.length]));
    clearDecals();
    clearItems();
    balls.length = 0;
    alliances = {}; requests = {}; botAnswers = {};
    for (const c of chars) { c.kills = 0; c.deaths = 0; c.streak = 0; c.alive = false; c.blocks = 0; }
    for (const c of chars) spawn(c);
    feed.length = 0; feedEl.innerHTML = '';
    enterPlay();
  }
  // Paused: a solo game stops; a game with friends keeps going (you just can't move).
  function pause() {
    if (state !== 'play') return;
    state = 'pause';
    mouseDown = false; clearTouches(); for (const k in keys) keys[k] = false;
    if (panelOpen) { panelOpen = false; teamPanel.hidden = true; }
    if (locked) document.exitPointerLock();
    pauseEl.hidden = false; $('touch').hidden = true;
  }
  function resume() {
    if (state !== 'pause') return;
    state = 'play'; pauseEl.hidden = true; $('touch').hidden = !touchMode;
  }
  function toMenu() {
    state = 'menu';
    pauseEl.hidden = true; hud.hidden = true; $('touch').hidden = true; menuEl.hidden = false;
    setDeadUI(false);
    if (panelOpen) { panelOpen = false; teamPanel.hidden = true; }
    if (me) { me.alive = false; me.m.shadow.visible = false; }
    if (locked) document.exitPointerLock();
  }
  $('hostBtn').onclick = () => hostGame();
  $('joinBtn').onclick = () => joinGame();
  $('code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); });

  // ---------- Effects: every visible thing that happens is an event ----------
  // Solo and the host apply each event here; the host also sends it to friends, whose screens apply the same one.
  let outbox = [];
  const r2 = (v) => Math.round(v * 100) / 100;
  const byId = (id) => chars.find((c) => c.id === id);
  const nobody = (id) => ({ id, name: '?', color: '#ffffff', x: 0, y: 0, z: 0 });
  function fx(e) {
    applyFx(e);
    if (mode === 'host' && state !== 'lobby') outbox.push(e);
  }
  function applyFx(e) {
    const myId = me ? me.id : null;
    if (e.t === 'b') { // a paintball someone else's game fired (the host has the real one)
      if (mode !== 'client' || (e.o === myId && !e.s)) return; // your own shots are already on your screen
      const o = byId(e.o) || nobody(e.o), p = e.p;
      balls.push({ x: p[0], y: p[1], z: p[2], vx: p[3] * BALL_SPEED, vy: p[4] * BALL_SPEED, vz: p[5] * BALL_SPEED, life: BALL_LIFE, owner: o, color: e.c, dmg: 1, vis: true });
      if (me && me.alive && state !== 'menu') { const d = Math.hypot(p[0] - me.x, p[2] - me.z); if (d < 40) sfx.shot(0.45 * (1 - d / 40)); }
    } else if (e.t === 'hit') {
      const v = byId(e.v);
      if (v) paintSpot(v, e.x, e.y, e.z, e.c);
      burst(e.x, e.y, e.z, e.c, 12, 3.5);
      if (e.k === myId && !e.dead) { hitMarker(false); sfx.hit(); }
      if (e.v === myId) hurtFx({ x: e.fx, z: e.fz }, e.c);
    } else if (e.t === 'block') {
      burst(e.x, e.y + 0.5, e.z, '#ffffff', 6, 1.5);
      if (e.p === myId) { sfx.place(0.7); hudKey = ''; }
      else if (me && me.alive && state !== 'menu' && Math.hypot(e.x - me.x, e.z - me.z) < 20) sfx.place(0.3);
    } else if (e.t === 'gotblock') {
      if (e.p !== myId) return;
      hudKey = '';
      const n = $('blockPop');
      n.textContent = '+1 🧱';
      n.classList.remove('show'); void n.offsetWidth; n.classList.add('show');
      if (e.n === 1 && !brain.blockTip) { brain.blockTip = 1; toast(`<b>🧱 You earned a block!</b> ${touchMode ? 'Tap 🧱' : 'Press F'} to build where the green box shows · ${touchMode ? 'DUCK' : 'hold C'} to duck behind it`, '#ffd23d'); }
    } else if (e.t === 'pop') {
      burst(e.x, e.y, e.z, '#bff6ff', 8, 3);
    } else if (e.t === 'splat') {
      const v = byId(e.v) || nobody(e.v), k = byId(e.k) || nobody(e.k);
      if (mode === 'client' && v.m) { v.alive = false; v.deadT = 0; v.x = e.x; v.y = e.y; v.z = e.z; }
      burst(e.x, e.y + 0.9, e.z, e.c, 46, 6);
      burst(e.x, e.y + 0.9, e.z, v.color, 16, 4);
      floorDecal(e.x, e.z, e.c, 2.6);
      addFeed(k, v, e.how);
      if (e.k === myId && e.v !== myId) { hitMarker(true); sfx.kill(); splatPopup(v, e.st); }
      else if (me && me.alive) { const d = Math.hypot(e.x - me.x, e.z - me.z); if (d < 30) sfx.splat(0.8 * (1 - d / 30)); }
      if (e.v === myId) { sfx.splatted(); setDeadUI(true, k); }
    } else if (e.t === 'pick') {
      if (e.p !== myId) return;
      const P = POWERUPS[e.k];
      if (!P) return;
      sfx.pick();
      const how = !P.place ? '' : touchMode ? ' · tap it below to place it' : ` · press ${e.n} to place it`;
      toast(`<b>${P.icon} ${P.name}!</b> ${P.desc}${how}`, P.color);
      hudKey = '';
    } else if (e.t === 'place') {
      if (e.p === myId) { sfx.place(); hudKey = ''; }
      else if (me && me.alive && state !== 'menu' && Math.hypot(e.x - me.x, e.z - me.z) < 25) sfx.place(0.4);
    } else if (e.t === 'heal') {
      burst(e.x, e.y + 1, e.z, '#3dff8b', 14, 2.5);
      if (e.p === myId) { sfx.heal(); hudKey = ''; }
    } else if (e.t === 'boom') {
      burst(e.x, e.y + 0.3, e.z, e.c, 70, 8);
      floorDecal(e.x, e.z, e.c, 3.6);
      for (const [x, z] of e.s) floorDecal(x, z, e.c, rand(0.6, 1.1));
      if (me && state !== 'menu') { const dd = Math.hypot(e.x - me.x, e.z - me.z); if (dd < 40) sfx.boom(1 - dd / 40); }
    } else if (e.t === 'msg') {
      addNote(esc(e.s));
    } else if (e.t === 'team') {
      const a = byId(e.a), b = byId(e.b);
      if (!a || !b) return;
      const mine = e.a === myId || e.b === myId, other = e.a === myId ? b : a;
      const nm = (p) => `<b style="color:${p.color}">${p.id === myId ? 'You' : esc(p.name)}</b>`;
      if (e.e === 'ask' && e.a === myId) addNote(`You asked ${nm(b)} to team up`);
      else if (e.e === 'no' && e.b === myId) {
        addNote(e.why === 'busy' ? `${nm(a)} already has a teammate` : e.why === 'grudge' ? `${nm(a)} won't team up: you just splatted them!` : `${nm(a)} said no thanks`);
      } else if (e.e === 'join') {
        addNote(`${nm(a)} and ${nm(b)} teamed up 🤝`);
        if (mine) { toast(`<b>🤝 You and ${esc(other.name)} are a team!</b> Your paint can't hurt each other`, '#3dff8b'); sfx.pick(); }
      } else if (e.e === 'leaving' && mine) {
        toast(`<b>Team with ${esc(other.name)} ends in ${TEAM_BREAK_TIME}…</b> Get to cover!`, '#ff8a3d');
      } else if (e.e === 'over' && mine) addNote(`You and ${nm(other)} are no longer a team`);
    } else if (e.t === 'conq' && TEAM_INFO[e.w] && TEAM_INFO[e.l]) {
      const W = TEAM_INFO[e.w], L = TEAM_INFO[e.l];
      addNote(`<b style="color:${W.color}">Team ${W.name}</b> captured <b style="color:${L.color}">Team ${L.name}</b>'s base!`);
      toast(`<b>🏳 Team ${W.name} captured Team ${L.name}!</b> Everyone on Team ${L.name} is now on Team ${W.name}`, W.color);
      sfx.kill();
    } else if (e.t === 'over') {
      showGameOver(e.w);
    }
  }
  function paintSpot(c, x, y, z, color) { // a spot of paint on someone, where it hit
    if (c.spots >= 10 || !c.m) return;
    const lx = x - c.x, ly = y - (c.y + 0.85), lz = z - c.z;
    const cs = Math.cos(-c.yaw), sn = Math.sin(-c.yaw);
    _v.set(lx * cs + lz * sn, ly, -lx * sn + lz * cs).normalize();
    const s = new T.Mesh(shared.spot, paintMat(color));
    s.position.set(_v.x * 0.45, 0.85 + _v.y * 0.6, _v.z * 0.45);
    s.scale.set(1, 1, 0.45);
    s.lookAt(_v.x * 2, 0.85 + _v.y * 2, _v.z * 2);
    c.m.spots.add(s); c.spots++;
  }

  // ---------- Team-ups (any game without set teams) ----------
  // Two players (people or bots) can agree to be a team: their paint passes through each other.
  // A person can team up with several others (each pair agrees separately); a bot has at most one
  // teammate. Leaving takes 3 seconds, so nobody can turn on a teammate without warning.
  const TEAM_ASK_TIME = 20, TEAM_BREAK_TIME = 3;
  const teamCount = (p) => Object.keys(alliances).filter((k) => k.split('|').includes(p.id)).length;
  function teamAction(a, act, b, why) {
    if (!a || !b || a === b || teamMode) return;
    const k = pairKey(a, b), ids = { a: a.id, b: b.id };
    if (act === 'ask') {
      if (alliances[k] || requests[a.id + '>' + b.id]) return;
      if (requests[b.id + '>' + a.id]) { teamAction(a, 'accept', b); return; } // they already asked you
      requests[a.id + '>' + b.id] = TEAM_ASK_TIME;
      if (b.isBot) botAnswers[a.id + '>' + b.id] = rand(1, 2.5); // a bot thinks it over
      fx({ t: 'team', e: 'ask', ...ids });
    } else if (act === 'accept' && requests[b.id + '>' + a.id]) {
      delete requests[b.id + '>' + a.id];
      // a bot stays on a team for a few minutes, then moves on (people stay until they choose to leave)
      const life = a.isBot || b.isBot ? (a.isBot && b.isBot ? rand(90, 180) : rand(150, 300)) : 0;
      alliances[k] = { breakT: 0, life };
      if (a.target === b) a.target = null;
      if (b.target === a) b.target = null;
      fx({ t: 'team', e: 'join', ...ids });
    } else if (act === 'decline' && requests[b.id + '>' + a.id]) {
      delete requests[b.id + '>' + a.id];
      fx({ t: 'team', e: 'no', why: why || '', ...ids });
    } else if (act === 'cancel') {
      delete requests[a.id + '>' + b.id];
    } else if (act === 'break' && alliances[k] && !alliances[k].breakT) {
      alliances[k].breakT = TEAM_BREAK_TIME;
      fx({ t: 'team', e: 'leaving', ...ids });
    }
  }
  function updateTeams(dt) {
    for (const k of Object.keys(requests)) if ((requests[k] -= dt) <= 0) { delete requests[k]; delete botAnswers[k]; }
    for (const k of Object.keys(botAnswers)) { // bots answer requests sent to them
      if ((botAnswers[k] -= dt) > 0) continue;
      delete botAnswers[k];
      const [from, to] = k.split('>').map(byId);
      if (!from || !to || !requests[k]) continue;
      const g = to.grudge, angry = g && g.id === from.id && now - g.at < 30;
      if (teamCount(to) >= 1) teamAction(to, 'decline', from, 'busy');
      else if (angry) teamAction(to, 'decline', from, 'grudge');
      else if (Math.random() < 0.75) teamAction(to, 'accept', from);
      else teamAction(to, 'decline', from);
    }
    // every so often a bot without a teammate asks someone nearby (usually another bot)
    if (!teamMode && (botTeamT -= dt) <= 0) {
      botTeamT = rand(8, 16);
      const lonely = chars.filter((q) => q.isBot && q.alive && !q.target && teamCount(q) === 0);
      const bot = lonely.length ? pick(lonely) : null;
      if (bot) {
        const near = chars.filter((q) => q !== bot && q.alive && !q.awayUntil && !allied(q, bot) && Math.hypot(q.x - bot.x, q.z - bot.z) < 22 &&
          (q.isBot ? teamCount(q) === 0 : !(q.botAskedAt && now - q.botAskedAt < 45)) && // don't pester people
          !requests[bot.id + '>' + q.id] && !requests[q.id + '>' + bot.id]);
        const bs = near.filter((q) => q.isBot), people = near.filter((q) => !q.isBot);
        const pool = people.length && (Math.random() < 0.25 || !bs.length) ? people : bs;
        if (pool.length) { const who = pick(pool); if (!who.isBot) who.botAskedAt = now; teamAction(bot, 'ask', who); }
      }
    }
    for (const [k, v] of Object.entries(alliances)) {
      const [a, b] = k.split('|').map(byId);
      if (!a || !b) { delete alliances[k]; continue; }
      if (v.life > 0 && !v.breakT && (v.life -= dt) <= 0) { const bot = a.isBot ? a : b; teamAction(bot, 'break', bot === a ? b : a); }
      if (v.breakT > 0 && (v.breakT -= dt) <= 0) { delete alliances[k]; fx({ t: 'team', e: 'over', a: a.id, b: b.id }); }
    }
  }
  function dropTeamsOf(p) {
    for (const k of Object.keys(alliances)) if (k.split('|').includes(p.id)) delete alliances[k];
    for (const k of Object.keys(requests)) if (k.split('>').includes(p.id)) { delete requests[k]; delete botAnswers[k]; }
  }
  // your own taps: solo and the host act right away, a friend asks the host
  function requestTeam(act, other) {
    if (!me || !other) return;
    if (mode === 'client') sendHost({ t: 'team', act, with: other.id });
    else teamAction(me, act, other);
  }

  // ---------- Set teams and their bases (hosted games) ----------
  // Everyone spawns at their team's base. Get more of your team inside an enemy base than they have
  // defending it and a ring fills in your color (about 8 s, faster with a bigger edge). More defenders
  // drains it; a tie holds it. When it fills, that base is gone and its whole team switches to yours.
  const TEAM_INFO = [
    { name: 'Red', color: '#ff4d4d' }, { name: 'Blue', color: '#3da5ff' },
    { name: 'Yellow', color: '#ffd23d' }, { name: 'Purple', color: '#b03dff' },
  ];
  const BASE_R = 7, CAPTURE_TIME = 8;
  let bases = [], gameOver = null;
  const baseGeo = {
    ring: new T.TorusGeometry(BASE_R, 0.14, 6, 64).rotateX(Math.PI / 2),
    disc: new T.CircleGeometry(BASE_R, 48).rotateX(-Math.PI / 2),
    pole: new T.CylinderGeometry(0.09, 0.09, 5.5, 6).translate(0, 2.75, 0),
    flag: new T.BoxGeometry(1.8, 1.1, 0.06).translate(0.9, 0, 0),
  };
  function basePlaces(n) {
    if (n === 2) return [[-40, 0], [40, 0]];
    if (n === 4) return [[-40, 0], [40, 0], [0, -40], [0, 40]];
    return [0, 1, 2].map((i) => { const a = Math.PI + (i * 2 * Math.PI) / 3; return [Math.cos(a) * 38, Math.sin(a) * 38]; });
  }
  function clearBases() {
    for (const b of bases) { scene.remove(b.g); if (b.prog) b.prog.geometry.dispose(); }
    bases = [];
  }
  function buildBases(n) {
    clearBases();
    if (!n) return;
    basePlaces(n).forEach(([x, z], team) => {
      const col = TEAM_INFO[team].color, g = new T.Group();
      g.position.set(x, 0, z);
      const disc = new T.Mesh(baseGeo.disc, new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.18, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      disc.position.y = 0.02;
      const ring = new T.Mesh(baseGeo.ring, new T.MeshBasicMaterial({ color: col })); ring.position.y = 0.06;
      const pole = new T.Mesh(baseGeo.pole, shared.white);
      const flag = new T.Mesh(baseGeo.flag, new T.MeshLambertMaterial({ color: col })); flag.position.y = 4.9;
      const tc = canvasTex(256, (ctx) => {
        ctx.font = '900 46px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(16,22,36,0.85)'; ctx.strokeText(TEAM_INFO[team].name.toUpperCase() + ' BASE', 128, 128);
        ctx.fillStyle = col; ctx.fillText(TEAM_INFO[team].name.toUpperCase() + ' BASE', 128, 128);
      });
      const label = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(tc), depthWrite: false })); label.scale.set(4, 4, 1); label.position.y = 6.6;
      g.add(disc, ring, pole, flag, label);
      scene.add(g);
      const spots = navPoints.filter((p) => Math.hypot(p.x - x, p.z - z) < BASE_R - 1);
      bases.push({ team, x, z, alive: true, capTeam: null, cap: 0, g, flag, prog: null, progKey: '', spots });
    });
  }
  const activeTeams = () => bases.filter((b) => b.alive).map((b) => b.team);
  function updateBases(dt) {
    if (!teamMode || gameOver != null) return;
    for (const b of bases) {
      if (!b.alive) continue;
      const inside = chars.filter((p) => inPlay(p) && p.team != null && Math.hypot(p.x - b.x, p.z - b.z) < BASE_R && p.y < 4);
      const count = (t) => inside.filter((p) => p.team === t).length;
      const defenders = count(b.team);
      const attackers = [...new Set(inside.filter((p) => p.team !== b.team).map((p) => p.team))].sort((x, y) => count(y) - count(x));
      const lead = attackers[0];
      const edge = lead == null ? -1 : count(lead) - Math.max(defenders, ...attackers.slice(1).map(count));
      if (lead == null || edge < 0) {
        b.cap = Math.max(0, b.cap - (dt / CAPTURE_TIME) * (defenders > 0 ? 1.5 : 0.5));
      } else if (edge > 0) {
        if (b.capTeam !== lead && b.cap > 0) b.cap = Math.max(0, b.cap - dt / CAPTURE_TIME); // someone else's progress drains first
        else {
          b.capTeam = lead;
          b.cap += (dt / CAPTURE_TIME) * (1 + 0.25 * (Math.min(edge, 5) - 1));
          if (b.cap >= 1) { conquer(b, lead); continue; }
        }
      } // a tie: nothing moves
      if (b.cap === 0) b.capTeam = null;
    }
  }
  function conquer(base, winner) {
    base.alive = false; base.cap = 0; base.capTeam = null;
    const lost = base.team;
    for (const p of chars) if (p.team === lost) { setTeam(p, winner, false); if (p.alive) p.shield = Math.max(p.shield, 2); }
    fx({ t: 'conq', w: winner, l: lost });
    const left = activeTeams();
    if (left.length === 1) { gameOver = left[0]; fx({ t: 'over', w: gameOver }); }
  }
  function setTeam(p, team, respawn) {
    p.team = team;
    setColor(p, TEAM_INFO[team].color);
    p.target = null;
    for (const b of chars) if (b.target === p) b.target = null;
    if (p === me) myColorChanged();
    if (respawn && p.alive) spawn(p);
  }
  function updateBaseVisuals() {
    for (const b of bases) {
      b.g.visible = b.alive;
      b.flag.rotation.y = Math.sin(now * 2 + b.team) * 0.25;
      const key = b.alive && b.cap > 0 && TEAM_INFO[b.capTeam] ? b.capTeam + ':' + Math.round(b.cap * 60) : '';
      if (key === b.progKey) continue;
      b.progKey = key;
      if (b.prog) { b.g.remove(b.prog); b.prog.geometry.dispose(); b.prog = null; }
      if (!key) continue;
      const geo = new T.RingGeometry(BASE_R - 1.1, BASE_R - 0.25, 64, 1, Math.PI / 2, -Math.max(0.02, b.cap) * Math.PI * 2).rotateX(-Math.PI / 2);
      b.prog = new T.Mesh(geo, new T.MeshBasicMaterial({ color: TEAM_INFO[b.capTeam].color, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 }));
      b.prog.position.y = 0.04;
      b.g.add(b.prog);
    }
  }
  // bots in a team game: most attack the nearest enemy base, some guard home, and they all rush back when it's under attack
  function baseGoal(b) {
    if (!teamMode || gameOver != null) return null;
    const home = bases.find((x) => x.alive && x.team === b.team);
    const underAttack = home && home.cap > 0 && home.capTeam !== b.team;
    const enemies = bases.filter((x) => x.alive && x.team !== b.team).sort((x, y) => Math.hypot(x.x - b.x, x.z - b.z) - Math.hypot(y.x - b.x, y.z - b.z));
    return home && (b.role === 'defend' || underAttack || !enemies.length) ? home : enemies[0] || null;
  }
  function showGameOver(w) {
    const T0 = TEAM_INFO[w];
    if (!T0) return;
    $('goTitle').innerHTML = `🏆 <span style="color:${T0.color}">Team ${T0.name}</span> wins!`;
    $('goSub').textContent = me && me.team === w ? 'Your team took every base. Great job!' : 'Every base belongs to Team ' + T0.name + ' now.';
    $('goLobby').hidden = mode !== 'host';
    $('goWait').hidden = mode === 'host';
    const bs = brainScoreText();
    $('goBrain').hidden = !bs;
    $('goBrain').textContent = bs ? `Your Brain Boost: ${brain.ok} right out of ${brain.all}` + (brain.stars ? ` · ⭐ ${brain.stars} challenge${brain.stars === 1 ? '' : 's'}` : '') : '';
    $('gameover').hidden = false;
    if (locked) document.exitPointerLock();
  }

  // ---------- Playing with friends ----------
  // Peer-to-peer with PeerJS: the host's device runs the game and friends connect straight to it. Friends
  // send where they are and what they did; the host sends everyone the game 15 times a second.
  // NET_VER: the shape of the messages between games. Bump it only when an older game couldn't play with a newer
  // one; a small fix doesn't stop friends joining (right after an update, phones can get the new files a few minutes apart)
  const NET_VER = 1;
  // GAME_VER: shown on the start, pause and lobby screens, so you can tell which copy each device has.
  // Goes up with every update (it matches the ?v= in index.html)
  const GAME_VER = 9;
  document.querySelectorAll('.ver').forEach((el) => { el.textContent = `Version ${GAME_VER}`; });
  const PEER_PREFIX = 'pbw3d-jesse-', MAX_HUMANS = 8, MAX_PLAYERS = 30, CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const NO_SERVER = "Couldn't reach the multiplayer service. Check your internet connection and try again.";
  let mode = 'solo';                  // solo | host | client
  let peer = null, conns = [], hostConn = null, roomCode = '', connecting = false;
  let lobby = null, clientLobby = null, totalPlayers = NUM_BOTS + 1, myLobbyId = null;
  let snapT = 0, rosterT = 0, sendT = 0, lastSnap = 0, netGen = 0, sentBlockVer = -1;
  const clientOut = { shots: [], uses: [], blocks: [] };
  const netMsgEl = $('netmsg');
  const netMsg = (t) => { netMsgEl.textContent = t; };
  const cleanName = (n) => String(n || '').replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, 12) || 'Friend';
  const cleanColor = (c) => (COLORS.includes(c) ? c : COLORS[1]);
  const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
  function stopNet() {
    netGen++;
    for (const pr of [peer, basePeer]) { try { if (pr) pr.destroy(); } catch (e) { /* already closed */ } }
    peer = null; basePeer = null; conns = []; hostConn = null; connecting = false;
  }
  function sendHost(m) { if (hostConn && hostConn.open) { try { hostConn.send(m); } catch (e) { /* dropped */ } } }
  function newCode() { let c = ''; for (let i = 0; i < 4; i++) c += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]; return c; }
  function myName() { return cleanName(nameEl.value.trim() || 'Player'); }
  function saveProfile() { store.set('pbw3d-profile', { name: myName(), color: chosenColor }); }

  // ----- hosting -----
  // reopen = { gen, lobby? } after an update: the host comes back at CODE-gen (see "Update ready")
  function hostGame(code, tries = 0, reopen = null) {
    if (connecting) return;
    if (!window.Peer) { if (reopen) addNote("Couldn't reopen the room, so friends can't rejoin"); else netMsg(NO_SERVER); return; }
    if (!reopen) { initAudio(); saveProfile(); }
    connecting = true;
    code = code || newCode();
    if (!reopen) netMsg('Making a room…');
    const g = ++netGen, at = reopen ? reopen.gen : 1;
    const pr = peer = new window.Peer(PEER_PREFIX + code + (at > 1 ? '-' + at : ''));
    const timer = setTimeout(() => { if (netGen === g && connecting && !reopen) { stopNet(); netMsg(NO_SERVER); } }, 12000);
    pr.on('open', () => {
      if (netGen !== g) return;
      clearTimeout(timer);
      connecting = false;
      roomCode = code;
      mode = 'host';
      if (!reopen || reopen.lobby) {
        if (!reopen) roomGen = 1;
        lobby = { teams: reopen ? reopen.lobby.teams : 0, total: reopen ? reopen.lobby.total : NUM_BOTS + 1,
          people: [{ id: 'p1', name: myName(), color: chosenColor, team: null, host: true, gv: GAME_VER }] };
        if (lobby.teams) lobby.people[0].team = 0;
        myLobbyId = 'p1';
        openLobby();
      }
      if (at > 1) reclaimBase(code, 0);
    });
    pr.on('connection', setupHostConn);
    pr.on('error', (err) => {
      if (netGen !== g) return;
      clearTimeout(timer);
      if (reopen && !roomCode) { // keep trying the fresh address for about 2 minutes
        try { pr.destroy(); } catch (e) { /* already closed */ }
        peer = null; connecting = false;
        if (tries < 40) setTimeout(() => { if (!peer) hostGame(code, tries + 1, reopen); }, 3000);
        else addNote("Couldn't reopen the room, so friends can't rejoin");
        return;
      }
      if (err.type === 'unavailable-id' && !roomCode) { // that code is taken (or still reserved): pick another
        try { pr.destroy(); } catch (e) { /* already closed */ }
        peer = null; connecting = false;
        if (tries < 5) hostGame(null, tries + 1); else netMsg(NO_SERVER);
        return;
      }
      if (!roomCode) { stopNet(); netMsg(NO_SERVER); }
    });
  }
  // after an update: also take the plain room code back (it frees up within a minute) for anyone joining new
  function reclaimBase(code, tries) {
    if (mode !== 'host' || roomCode !== code || basePeer) return;
    const bp = basePeer = new window.Peer(PEER_PREFIX + code);
    bp.on('connection', setupHostConn);
    bp.on('error', () => {
      if (basePeer !== bp) return;
      try { bp.destroy(); } catch (e) { /* already closed */ }
      basePeer = null;
      if (tries < 100) setTimeout(() => reclaimBase(code, tries + 1), 3000);
    });
  }
  let nextPerson = 1;
  function setupHostConn(conn) {
    conns.push(conn);
    conn.lastIn = performance.now();
    conn.on('data', (m) => {
      if (!m || typeof m !== 'object' || mode !== 'host') return;
      conn.lastIn = performance.now();
      if (m.t === 'hello') hostHello(conn, m);
      else if (m.t === 'in' && conn.player) hostInput(conn.player, m);
      else if (m.t === 'team' && conn.player) {
        const other = byId(String(m.with));
        if (other && ['ask', 'accept', 'decline', 'cancel', 'break'].includes(m.act)) teamAction(conn.player, m.act, other);
      } else if (m.t === 'brain' && conn.player && (m.k == null || POWERUPS[m.k])) brainReward(conn.player, m.k);
      else if (m.t === 'bye') dropConn(conn, true);
    });
    conn.on('close', () => dropConn(conn, false));
    conn.on('error', () => dropConn(conn, false));
  }
  function hostNote(t) { // something the host should know about a friend joining
    const el = $('lNote');
    if (state === 'lobby') { el.textContent = t; el.hidden = false; } else addNote(esc(t));
  }
  function hostHello(conn, m) {
    if (conn.player || conn.person) return;
    if (updating) { conn.close(); return; } // about to reload: they'll retry and find the new page
    if ((m.nv || 1) !== NET_VER) { hostNote(`${cleanName(m.name)} couldn't join: they have ${m.gv ? 'version ' + m.gv : 'an older version'}, you have version ${GAME_VER}. They should reload the page.`); conn.send({ t: 'oldver', gv: GAME_VER }); setTimeout(() => conn.close(), 400); return; }
    const name = cleanName(m.name);
    if (state === 'lobby') {
      if (lobby.people.length >= MAX_HUMANS) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 400); return; }
      const taken = lobby.people.map((q) => q.color);
      let color = cleanColor(m.color);
      if (taken.includes(color)) color = COLORS.find((c) => !taken.includes(c)) || color;
      conn.person = { id: 'p' + ++nextPerson, name, color, gv: num(m.gv) || null, team: lobby.teams ? smallestLobbyTeam() : null };
      lobby.people.push(conn.person);
      lobby.total = Math.max(lobby.total, lobby.people.length);
      broadcastLobby();
      return;
    }
    // A friend coming back (dropped connection) gets their old player back, same team and score:
    // matched by the id their device remembers, or failing that by name.
    const people = chars.filter((p) => p.remote);
    const back = (m.rejoin && people.find((p) => p.id === m.rejoin)) || people.find((p) => p.awayUntil && p.name === name);
    if (back) {
      const old = conns.find((c) => c !== conn && c.player === back);
      if (old) { old.player = null; try { old.close(); } catch (e) { /* gone */ } }
      const wasAway = !!back.awayUntil;
      back.awayUntil = 0;
      if (back.alive) back.shield = Math.max(back.shield, SPAWN_SHIELD);
      conn.player = back;
      if (!back.alive) back.respawn = Math.min(back.respawn, 1);
      conn.send({ t: 'welcome', id: back.id, teams: teamMode, code: roomCode, gen: roomGen });
      if (wasAway) fx({ t: 'msg', s: `${back.name} is back` });
      return;
    }
    if (chars.filter((p) => !p.isBot).length >= MAX_HUMANS) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 400); return; }
    const taken = chars.filter((q) => !q.isBot).map((q) => q.ownColor);
    let color = cleanColor(m.color);
    if (taken.includes(color)) color = COLORS.find((c) => !taken.includes(c)) || color;
    const p = makeChar(name, color, false, 'p' + ++nextPerson);
    p.remote = true; p.ownColor = color;
    if (teamMode) setTeam(p, teamForNewcomer(), false); // a friend who joins mid-game goes to the smallest team
    conn.player = p;
    spawn(p);
    rebalanceBots(p.team);
    conn.send({ t: 'welcome', id: p.id, teams: teamMode, code: roomCode, gen: roomGen });
    fx({ t: 'msg', s: `${p.name} joined the game` });
    rosterT = 0;
  }
  function hostInput(p, m) {
    if (p.awayUntil) return;
    p.asking = !!m.ask; // a Brain Boost question is up: their respawn waits
    if (num(m.ss) === p.ss && p.alive) { // positions from before a respawn are stale
      const lim = HALF - PLAYER_R;
      p.x = clamp(num(m.x, p.x), -lim, lim); p.y = clamp(num(m.y, p.y), 0, 30); p.z = clamp(num(m.z, p.z), -lim, lim);
      p.yaw = num(m.yaw, p.yaw); p.pitch = clamp(num(m.pitch, p.pitch), -1.5, 1.5);
      p.vx = num(m.vx); p.vz = num(m.vz); p.onGround = !!m.og; p.crouch = !!m.cr;
      if (Array.isArray(m.blk)) for (const a of m.blk.slice(0, 4)) if (Array.isArray(a)) placeBlock(p, a[0], a[1]);
      if (Array.isArray(m.shots)) for (const s of m.shots.slice(0, 6)) {
        if (!Array.isArray(s) || s.length !== 6 || !s.every(Number.isFinite)) continue;
        launch(p, ...s);
        p.shield = 0; // shooting drops your spawn shield
      }
    }
    if (Array.isArray(m.uses)) for (const slot of m.uses.slice(0, 3)) placeItem(p, num(slot, -1));
  }
  function dropConn(conn, bye) {
    if (!conns.includes(conn)) return;
    conns = conns.filter((c) => c !== conn);
    try { conn.close(); } catch (e) { /* already closed */ }
    if (conn.person && lobby) {
      lobby.people = lobby.people.filter((q) => q !== conn.person);
      broadcastLobby();
    }
    const p = conn.player;
    if (!p || mode !== 'host' || updating) return; // during an update, friends drop off on purpose
    conn.player = null;
    if (bye) { // they left on purpose: a bot takes their spot
      fx({ t: 'msg', s: `${p.name} left the game` });
      removeChar(p);
      rebalanceBots(p.team);
    } else { // bad connection? keep their player (team, score) for 90 seconds in case they come back
      p.awayUntil = now + 90; p.alive = false;
      fx({ t: 'msg', s: `${p.name} lost connection, saving their spot…` });
    }
    rosterT = 0;
  }
  function smallestLobbyTeam() {
    const n = (t) => lobby.people.filter((q) => q.team === t).length;
    let best = 0;
    for (let t = 1; t < lobby.teams; t++) if (n(t) < n(best)) best = t;
    return best;
  }
  function teamForNewcomer() {
    const live = activeTeams();
    const count = (t, bot) => chars.filter((p) => p.team === t && (bot === undefined || p.isBot === bot)).length;
    let best = live[0];
    for (const t of live) if (count(t, false) < count(best, false) || (count(t, false) === count(best, false) && count(t) < count(best))) best = t;
    return best;
  }
  // Bots fill the game up to the chosen number of players. At the start of a team game they're spread
  // evenly; later (people joining or leaving) only the total is kept, so captured teams stay captured.
  function addBot(team) {
    const used = new Set(chars.map((p) => p.name));
    const name = shuffledNames.find((n) => !used.has(n)) || 'Bot';
    const usedColors = new Set(chars.map((p) => p.color));
    const color = team != null ? TEAM_INFO[team].color : COLORS.find((c) => !usedColors.has(c)) || pick(COLORS);
    const b = makeChar(name, color, true);
    b.team = team; b.ownColor = color;
    b.role = Math.random() < 0.7 ? 'attack' : 'defend';
    bots.push(b);
    spawn(b);
    return b;
  }
  function rebalanceBots(hint) {
    if (teamMode && state === 'play') {
      const live = activeTeams(), size = (t) => chars.filter((p) => p.team === t).length;
      while (chars.length > totalPlayers) {
        const t = live.includes(hint) && bots.some((b) => b.team === hint) ? hint : live.slice().sort((a, b) => size(b) - size(a))[0];
        const bot = bots.filter((b) => b.team === t).pop() || bots[bots.length - 1];
        if (!bot) break;
        removeChar(bot);
      }
      while (chars.length < totalPlayers && live.length) addBot(live.includes(hint) ? hint : live.slice().sort((a, b) => size(a) - size(b))[0]);
      return;
    }
    const groups = teamMode ? [...Array(teamMode).keys()] : [null];
    groups.forEach((t, i) => {
      // each team's share of the total (the first teams get any leftover spot)
      const size = teamMode ? Math.floor(totalPlayers / teamMode) + (i < totalPlayers % teamMode ? 1 : 0) : totalPlayers;
      const humans = chars.filter((p) => !p.isBot && p.team === t).length;
      const mine = bots.filter((b) => b.team === t);
      const want = Math.max(0, size - humans);
      while (mine.length > want) removeChar(mine.pop());
      for (let n = mine.length; n < want; n++) addBot(t);
    });
  }
  function removeChar(p) {
    const i = chars.indexOf(p);
    if (i < 0) return;
    chars.splice(i, 1);
    const bi = bots.indexOf(p);
    if (bi >= 0) bots.splice(bi, 1);
    scene.remove(p.m.g); scene.remove(p.m.shadow);
    if (p.m.ring) scene.remove(p.m.ring);
    p.m.bodyMat.dispose(); p.m.tag.material.map.dispose(); p.m.tag.material.dispose();
    for (const d of deploys.slice()) if (d.owner === p) removeDeploy(d, true);
    dropTeamsOf(p);
    for (const b of chars) if (b.target === p) b.target = null;
    seenOnMap.delete(p);
    p.alive = false;
  }
  function removeAllChars() { while (chars.length) removeChar(chars[0]); me = null; }

  function sendSnapshots(dt) {
    snapT -= dt; rosterT -= dt;
    if (snapT > 0) return;
    snapT = 1 / 15;
    const msg = {
      t: 's', tm: teamMode, go: gameOver == null ? -1 : gameOver,
      p: chars.map((c) => [c.id, r2(c.x), r2(c.y), r2(c.z), r2(c.yaw), r2(c.pitch), c.hp, c.maxHp, c.alive ? 1 : 0, r2(c.shield),
        c.kills, c.deaths, c.ss, Object.keys(c.buffs).join(','), c.magSize, c.items.join(','), c.team == null ? -1 : c.team,
        r2(c.vx), r2(c.vz), r2(c.respawn), c.awayUntil ? 1 : 0, c.streak, c.blocks || 0, c.crouch ? 1 : 0]),
      d: drops.map((d) => [d.id, d.type, r2(d.x), r2(d.y), r2(d.z), r2(d.ttl)]),
      dp: deploys.map((d) => [d.id, d.type, d.owner.id, d.color, r2(d.x), r2(d.y), r2(d.z), r2(d.yaw), d.w || 0, d.d || 0, r2(d.ttl), d.hp, r2(d.cool)]),
      bs: bases.map((b) => [b.alive ? 1 : 0, b.capTeam == null ? -1 : b.capTeam, r2(b.cap)]),
      al: Object.entries(alliances).map(([k, v]) => [k, r2(v.breakT)]), rq: Object.keys(requests),
      fx: outbox,
    };
    if (rosterT <= 0 || blockVer !== sentBlockVer) { sentBlockVer = blockVer; msg.bk = blockList(); } // blocks, when they change (and now and then)
    if (rosterT <= 0) { rosterT = 1; msg.r = chars.map((c) => [c.id, c.name, c.color, c.isBot ? 1 : 0]); } // names and colors, now and then
    outbox = [];
    for (const c of conns) if (c.player) { try { c.send(msg); } catch (e) { /* dropped */ } }
  }
  function hostStep() {
    // a friend whose device went quiet: treat it like a dropped connection
    const t = performance.now();
    for (const c of conns.slice()) if (c.player && t - c.lastIn > 8000) dropConn(c, false);
    for (const p of chars.filter((q) => q.awayUntil && now > q.awayUntil)) { removeChar(p); rebalanceBots(p.team); rosterT = 0; }
  }

  // ----- the lobby -----
  const lobbyEl = $('lobby');
  function openLobby() {
    state = 'lobby';
    menuEl.hidden = true; hud.hidden = true; $('gameover').hidden = true; $('touch').hidden = true; pauseEl.hidden = true;
    lobbyEl.hidden = false;
    renderLobby();
    broadcastLobby();
  }
  function broadcastLobby() {
    if (mode !== 'host' || !lobby) return;
    renderLobby();
    for (const c of conns) if (c.person) { try { c.send({ t: 'lobby', code: roomCode, teams: lobby.teams, total: lobby.total, people: lobby.people, you: c.person.id }); } catch (e) { /* dropped */ } }
  }
  function renderLobby() {
    const L = mode === 'host' ? lobby : clientLobby;
    if (!L) return;
    const host = mode === 'host';
    $('lCode').textContent = roomCode;
    $('lHint').textContent = host ? 'Friends: open this game, type this code and tap Join.' : 'Waiting for the host to start the game…';
    $('lHostOpts').hidden = !host;
    $('lShuffle').hidden = !host || !L.teams;
    $('lStart').hidden = !host;
    $('lWait').hidden = host;
    lobbyEl.querySelectorAll('#lTeams button').forEach((b) => b.classList.toggle('sel', +b.dataset.teams === L.teams));
    $('lTotal').textContent = L.total;
    const bots = Math.max(0, L.total - L.people.length);
    $('lBots').textContent = bots === 0 ? 'No bots' : bots === 1 ? '+ 1 bot' : `+ ${bots} bots`;
    $('lPeople').innerHTML = L.people.map((q) => {
      const chips = L.teams ? TEAM_INFO.slice(0, L.teams).map((T0, t) =>
        `<button class="chip${q.team === t ? ' sel' : ''}" data-id="${q.id}" data-team="${t}" style="--tc:${T0.color}" ${host ? '' : 'disabled'} aria-label="${T0.name}">${T0.name}</button>`).join('') : '';
      const dot = L.teams && q.team != null ? TEAM_INFO[q.team].color : q.color;
      return `<li><span class="d" style="background:${dot}"></span><span class="nm">${esc(q.name)}${q.host ? ' 👑' : ''}${q.id === myLobbyId ? ' (you)' : ''} <small class="muted">v${q.gv || '?'}</small></span><span class="chips">${chips}</span></li>`;
    }).join('');
  }
  lobbyEl.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || mode !== 'host' || !lobby) return;
    if (b.dataset.teams != null) {
      lobby.teams = +b.dataset.teams;
      lobby.people.forEach((q) => { q.team = null; });
      if (lobby.teams) lobby.people.forEach((q) => { q.team = smallestLobbyTeam(); });
    } else if (b.dataset.team != null) {
      const q = lobby.people.find((x) => x.id === b.dataset.id);
      if (q) q.team = +b.dataset.team;
    } else if (b.id === 'lMinus') lobby.total = Math.max(lobby.people.length, 2, lobby.total - 1);
    else if (b.id === 'lPlus') lobby.total = Math.min(MAX_PLAYERS, lobby.total + 1);
    else if (b.id === 'lShuffle') {
      const order = lobby.people.slice().sort(() => Math.random() - 0.5);
      order.forEach((q, i) => { q.team = i % lobby.teams; });
    } else return;
    broadcastLobby();
  });
  $('lStart').onclick = startHosted;
  $('lLeave').onclick = () => leaveGame();
  $('goLobby').onclick = backToLobby;

  function startHosted() {
    if (mode !== 'host' || state !== 'lobby') return;
    initAudio();
    teamMode = lobby.teams; totalPlayers = Math.max(lobby.total, lobby.people.length); gameOver = null;
    resetWorld();
    buildBases(teamMode);
    for (const q of lobby.people) {
      const p = makeChar(q.name, q.color, false, q.id);
      p.ownColor = q.color;
      if (teamMode) setTeam(p, q.team == null ? 0 : q.team, false);
      if (q.host) me = p;
      else { const c = conns.find((x) => x.person === q); if (c) { c.player = p; p.remote = true; c.person = null; } }
    }
    for (const c of conns) if (c.person) { c.person = null; } // anyone who arrived mid-click joins like a latecomer
    rebalanceBots();
    for (const c of chars) spawn(c);
    for (const c of conns) if (c.player) c.send({ t: 'welcome', id: c.player.id, teams: teamMode, code: roomCode, gen: roomGen });
    rosterT = 0; snapT = 0;
    lobbyEl.hidden = true;
    enterPlay();
  }
  function backToLobby() {
    if (mode !== 'host') return;
    // everyone still here goes back to the lobby list, then the host can start another round
    lobby.people = [{ id: me.id, name: me.name, color: me.ownColor || me.color, team: null, host: true }];
    for (const c of conns) {
      if (!c.player) continue;
      const p = c.player;
      c.person = { id: p.id, name: p.name, color: p.ownColor || p.color, team: null };
      c.player = null;
      lobby.people.push(c.person);
      try { c.send({ t: 'tolobby' }); } catch (e) { /* dropped */ }
    }
    if (lobby.teams) lobby.people.forEach((q) => { q.team = smallestLobbyTeam(); });
    myLobbyId = me.id;
    gameOver = null;
    $('gameover').hidden = true;
    resetWorld();
    makeBots();
    openLobby();
  }
  // Back to the start screen from any game. Leaving a hosted game ends it for everyone.
  function leaveGame(text) {
    if (mode === 'host') for (const c of conns) { try { c.send({ t: 'bye' }); } catch (e) { /* dropped */ } }
    if (mode === 'client') sendHost({ t: 'bye' });
    const wasMulti = mode !== 'solo';
    setTimeout(stopNet, 150); // let the goodbye go out first
    mode = 'solo'; roomCode = ''; lobby = null; clientLobby = null;
    $('netOverlay').hidden = true; $('gameover').hidden = true; lobbyEl.hidden = true; $('teamPanel').hidden = true;
    if (wasMulti) { teamMode = 0; gameOver = null; resetWorld(); makeBots(); }
    toMenu();
    netMsg(text || '');
  }

  // ----- joining -----
  // opts: { code, rejoin, tries } (rejoin: your player's id, after a dropped connection)
  function joinGame(opts = {}) {
    if (connecting) return;
    const code = (opts.code || $('code').value).trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) { netMsg("Type the 4-letter room code from the host's screen."); return; }
    if (!window.Peer) { netMsg(NO_SERVER); return; }
    if (!opts.rejoin) { initAudio(); saveProfile(); }
    connecting = true;
    const tries = opts.tries || 0, back = !!opts.rejoin;
    const maxTries = back ? 45 : 4; // about 90 seconds to get back in, a few seconds otherwise
    if (back) setNetOverlay(opts.updated ? `Updated! Rejoining room ${code}…` : `Connection lost. Reconnecting to room ${code}…`);
    else netMsg(tries ? `Looking for room ${code}…` : `Joining room ${code}…`);
    // A host who just updated is at CODE-gen (every third try also checks the plain code). Someone joining new
    // tries the plain code first, then CODE-2 and CODE-3 in case the host updated in the last minute.
    const at = opts.gen || roomGen || 1;
    const suffix = back ? (at > 1 && tries % 3 !== 2 ? '-' + at : '') : ['', '-2', '-3', ''][tries % 4];
    const gen = ++netGen;
    try { if (peer) peer.destroy(); } catch (e) { /* gone */ }
    const pr = peer = new window.Peer();
    let why = opts.why || ''; // what went wrong last, shown with the message (helps tell a bad code from a bad connection)
    const giveUp = (text) => {
      clearTimeout(timer);
      if (netGen !== gen) return;
      text += ` [version ${GAME_VER}${why ? ', ' + why : ''}]`;
      if (tries + 1 < maxTries) {
        stopNet();
        setTimeout(() => joinGame({ ...opts, code, tries: tries + 1, why }), 2000);
      } else if (back) leaveGame(`Couldn't get back into room ${code}. The host may have left the game.`);
      else { stopNet(); if (state !== 'menu') leaveGame(text); else netMsg(text); }
    };
    const timer = setTimeout(() => { if (!why || why === 'error') why = pr.open ? 'no answer from the host' : 'no matchmaking service'; giveUp(`Couldn't join room ${code}. Check the code, and that the host still has the game open.`); }, 12000);
    pr.on('open', () => {
      if (netGen !== gen) return;
      if (why === 'no matchmaking service') why = '';
      const conn = hostConn = pr.connect(PEER_PREFIX + code + suffix, { reliable: true });
      const last = tabStore.get('pbw3d-last') || {};
      conn.on('open', () => conn.send({ t: 'hello', v: pageVersion, nv: NET_VER, gv: GAME_VER, name: myName(), color: chosenColor, rejoin: opts.rejoin || (last.code === code ? last.id : undefined) }));
      conn.on('data', (m) => {
        if (!m || typeof m !== 'object' || netGen !== gen) return;
        if (m.t === 'lobby' && Array.isArray(m.people)) {
          clearTimeout(timer); connecting = false;
          mode = 'client'; roomCode = code; clientLobby = m; myLobbyId = m.you;
          if (state !== 'lobby') { resetWorld(); makeBots(); }
          openLobby();
        } else if (m.t === 'welcome') {
          clearTimeout(timer); connecting = false;
          const wasPlaying = mode === 'client' && me && me.id === m.id && state !== 'menu' && state !== 'lobby';
          mode = 'client'; roomCode = code; teamMode = num(m.teams); lastSnap = performance.now(); roomGen = num(m.gen, 1);
          tabStore.set('pbw3d-last', { code, id: m.id });
          setNetOverlay('');
          if (!wasPlaying) { resetWorld(); gameOver = null; clientWaitId = m.id; lobbyEl.hidden = true; menuEl.hidden = true; }
          if (pendingDecals) { restoreDecals(pendingDecals); pendingDecals = null; } // your paint, from before the update
          if (opts.updated) addNote('✨ Updated! Back in the game.');
        } else if (m.t === 's' && mode === 'client') {
          lastSnap = performance.now();
          applySnapshot(m);
        } else if (m.t === 'tolobby') { // the host's lobby message follows
          $('gameover').hidden = true; gameOver = null; clientWaitId = null;
          resetWorld(); makeBots(); openLobby();
        } else if (m.t === 'update') { // the host is updating everyone: save who we are and reload with them
          roomGen = num(m.gen, roomGen + 1);
          updating = true;
          saveState(serializeGame());
          stopNet();
          reloadFresh();
        } else if (m.t === 'bye') {
          leaveGame('The host ended the game.');
        } else if (m.t === 'full') {
          clearTimeout(timer); stopNet(); netMsg(`That game is full (${MAX_HUMANS} people).`); connecting = false;
        } else if (m.t === 'oldver') {
          clearTimeout(timer); stopNet(); connecting = false;
          if (opts.updated && (opts.fresh || 0) < 2) { // fetch a fresh copy of the game (twice at most), then keep trying
            updating = true;
            saveState({ ...serializeGame(), myId: opts.rejoin, gen: at, fresh: (opts.fresh || 0) + 1 });
            reloadFresh();
            return;
          }
          const text = `The host has ${m.gv ? 'version ' + m.gv : 'an older version'} and you have version ${GAME_VER}. Both of you reload the page, then try again.`;
          if (state === 'menu') netMsg(text); else leaveGame(text);
        }
      });
      conn.on('close', () => {
        if (netGen !== gen) return;
        if (mode === 'client' && me && state !== 'menu' && state !== 'lobby') { reconnect(); return; } // dropped mid-game
        if (state === 'lobby' && mode === 'client') { leaveGame('The host closed the room.'); return; }
        giveUp(`Couldn't join room ${code}.`);
      });
    });
    pr.on('error', (err) => {
      if (netGen !== gen) return;
      why = String((err && err.type) || 'error');
      if (err.type === 'peer-unavailable' && !back && tries + 1 >= maxTries) {
        clearTimeout(timer); stopNet(); connecting = false;
        netMsg(`No game found with code ${code}. Check the code, and that the host still has the game open. [version ${GAME_VER}]`);
        return;
      }
      if (mode === 'client' && hostConn && hostConn.open) return; // a hiccup; only a closed connection matters
      giveUp(err.type === 'peer-unavailable' ? `No game found with code ${code}.` : NO_SERVER);
    });
  }
  let clientWaitId = null;
  // the connection to the host dropped mid-game: keep playing on your own screen and try to get back in
  // as the same player for about 90 seconds (the host saves your spot that long)
  function reconnect() {
    if (!me || mode !== 'client') return;
    const code = roomCode, id = me.id;
    stopNet();
    joinGame({ code, rejoin: id, gen: roomGen, tries: 0 });
  }
  function setNetOverlay(text) {
    $('netOverlay').hidden = !text;
    $('netText').textContent = text;
  }
  $('netLeave').onclick = () => leaveGame();

  function applySnapshot(m) {
    if (!Array.isArray(m.p)) return;
    if (num(m.tm) !== teamMode || bases.length !== (num(m.tm) ? num(m.tm) : 0)) { teamMode = num(m.tm); buildBases(teamMode); }
    if (Array.isArray(m.r)) for (const [id, name, color, bot] of m.r) {
      let c = byId(id);
      if (!c) { c = makeChar(String(name), String(color), !!bot, id); c.alive = false; c.ss = -1; c.m.g.visible = false; }
      if (c.name !== name) { c.name = String(name); c.m.tagKey = ''; }
      if (c.color !== color) { setColor(c, String(color)); if (c === me) myColorChanged(); }
    }
    const seen = new Set();
    for (const a of m.p) {
      const [id, x, y, z, yaw, pitch, hp, maxHp, alive, shield, kills, deaths, ss, buffs, magSize, items, team, vx, vz, respawn, away, streak, nblocks, crouch] = a;
      const c = byId(id);
      if (!c) continue; // its name arrives with the next roster
      seen.add(c);
      const wasAlive = c.alive;
      Object.assign(c, { hp, maxHp, shield, kills, deaths, respawn, away: !!away, streak, team: team < 0 ? null : team, blocks: nblocks || 0 });
      if (c !== me) c.crouch = !!crouch;
      c.buffs = {}; for (const k of String(buffs).split(',')) if (k && POWERUPS[k]) c.buffs[k] = 1;
      c.items = String(items).split(',').filter((k) => DEPLOY[k]).slice(0, MAX_CARRY);
      c.sel = clamp(c.sel, 0, Math.max(0, c.items.length - 1));
      if (c.magSize !== magSize) { if (c === me && magSize > c.magSize) c.ammo = magSize; c.magSize = magSize; if (c.ammo > magSize) c.ammo = magSize; }
      c.alive = !!alive && !away;
      if (c === me) {
        if (ss !== c.ss) { // a fresh spawn: jump to where the host put you
          c.ss = ss; c.x = x; c.y = y; c.z = z; c.yaw = yaw; c.pitch = 0; c.vx = c.vy = c.vz = 0; c.onGround = true;
          c.ammo = c.magSize; c.reload = 0; c.stamina = STAMINA_MAX; c.deadT = 0;
          if (c.alive) { clearSpots(c); setDeadUI(false); sfx.spawn(); }
        }
        if (!c.alive && wasAlive && deadEl.hidden) setDeadUI(true, c.lastHitBy || nobody('?'));
      } else {
        if (ss !== c.ss) { c.ss = ss; c.x = x; c.y = y; c.z = z; c.yaw = yaw; clearSpots(c); c.m.g.scale.set(1, 1, 1); c.deadT = 0; }
        c.tx = x; c.ty = y; c.tz = z; c.tyaw = yaw; c.pitch = pitch; c.vx = vx; c.vz = vz;
        if (wasAlive && !c.alive) c.deadT = Math.max(c.deadT, 0);
      }
    }
    for (const c of chars.slice()) if (!seen.has(c) && c.id !== clientWaitId) { if (c === me) me = null; removeChar(c); }
    if (!me && clientWaitId) { const c = byId(clientWaitId); if (c) { me = c; c.ss = -1; enterPlay(); } }
    if (Array.isArray(m.d)) syncDrops(m.d);
    if (Array.isArray(m.bk)) syncBlocks(m.bk);
    if (Array.isArray(m.dp)) syncDeploys(m.dp);
    if (Array.isArray(m.bs) && m.bs.length === bases.length) m.bs.forEach(([alive, capTeam, cap], i) => Object.assign(bases[i], { alive: !!alive, capTeam: capTeam < 0 ? null : capTeam, cap }));
    if (Array.isArray(m.al)) { alliances = {}; for (const [k, breakT] of m.al) alliances[k] = { breakT }; }
    if (Array.isArray(m.rq)) { requests = {}; for (const k of m.rq) requests[k] = 1; }
    if (m.go >= 0 && gameOver == null) { gameOver = m.go; showGameOver(m.go); }
    if (m.go < 0) gameOver = null;
    if (Array.isArray(m.fx)) for (const e of m.fx) applyFx(e);
  }
  function syncDrops(list) {
    const ids = new Set(list.map((a) => a[0]));
    for (const d of drops.slice()) if (!ids.has(d.id)) removeDrop(d);
    for (const [id, type, x, y, z, ttl] of list) {
      let d = drops.find((q) => q.id === id);
      if (!d && POWERUPS[type]) { d = spawnDrop(x, y, z, type); d.id = id; }
      if (d) d.ttl = ttl;
    }
  }
  function syncDeploys(list) {
    const ids = new Set(list.map((a) => a[0]));
    for (const d of deploys.slice()) if (!ids.has(d.id)) removeDeploy(d, !DEPLOY[d.type].ttl && d.type !== 'mine');
    for (const [id, type, ownerId, color, x, y, z, yaw, w, dd, ttl, hp, cool] of list) {
      let d = deploys.find((q) => q.id === id);
      if (!d) {
        const owner = byId(ownerId);
        if (!owner || !DEPLOY[type]) continue;
        d = { id, type, owner, color, x, y, z, yaw, w, d: dd, ttl, hp, cool, flash: 0, alive: true, shield: 0, vx: 0, vz: 0, aimH: 0.75 };
        registerDeploy(d);
      }
      if (hp < d.hp) d.flash = 0.12;
      Object.assign(d, { yaw, ttl, hp, cool });
    }
  }
  function clientStep(dt) {
    if (state === 'lobby' || !me) return;
    if (performance.now() - lastSnap > 6000 && $('netOverlay').hidden) { reconnect(); } // backup for a host that vanished without a goodbye
    if (me.alive && state !== 'menu') updateMe(dt);
    if (me.shield > 0) me.shield -= dt;
    const k = Math.min(1, dt * 12);
    for (const c of chars) {
      if (c === me || c.tx === undefined) continue;
      c.x += (c.tx - c.x) * k; c.y += (c.ty - c.y) * k; c.z += (c.tz - c.z) * k;
      c.yaw += angDiff(c.yaw, c.tyaw) * k;
      c.onGround = true;
    }
    for (const d of drops) { d.ttl -= dt; animateDrop(d, dt); }
    updateBlocks(dt);
    for (const d of deploys) { if (DEPLOY[d.type].ttl) d.ttl -= dt; d.flash = Math.max(0, d.flash - dt); animateDeploy(d, dt); }
    updateBalls(dt);
    updateParts(dt);
    sendT -= dt;
    if (sendT <= 0) {
      sendT = 1 / 30;
      sendHost({ t: 'in', ss: me.ss, ask: brain.state !== 'off' ? 1 : 0, x: r2(me.x), y: r2(me.y), z: r2(me.z), yaw: r2(me.yaw), pitch: r2(me.pitch), vx: r2(me.vx), vz: r2(me.vz), og: me.onGround ? 1 : 0, cr: me.crouch ? 1 : 0, blk: clientOut.blocks.splice(0),
        shots: clientOut.shots.splice(0), uses: clientOut.uses.splice(0) });
    }
  }

  // ----- the Teams panel: team up (no set teams), or see and move teams (set teams) -----
  const teamPanel = $('teamPanel');
  let panelOpen = false, panelT = 0;
  function openTeams() {
    if (state !== 'play' || !me) return;
    panelOpen = true; teamPanel.hidden = false;
    if (locked) document.exitPointerLock();
    mouseDown = false; for (const k in keys) keys[k] = false;
    renderTeams();
  }
  function closeTeams() {
    if (!panelOpen) return;
    panelOpen = false; teamPanel.hidden = true;
    lockPointer();
  }
  function renderTeams() {
    const myId = me.id;
    const others = chars.filter((c) => c !== me);
    const nm = (c) => `<span class="d" style="background:${c.color}"></span><span class="nm">${esc(c.name)}${c.isBot ? ' 🤖' : ''}${c.away ? ' (away)' : ''}</span>`;
    let html = '';
    if (teamMode) {
      $('tpTitle').textContent = 'Teams';
      $('tpNote').textContent = mode === 'host' ? 'Tap a team color to move someone to that team.' : 'Only the host can move people between teams.';
      const live = activeTeams();
      for (const t of live) {
        const T0 = TEAM_INFO[t], members = chars.filter((c) => c.team === t);
        html += `<li class="th" style="color:${T0.color}">Team ${T0.name} · ${members.length}</li>`;
        for (const c of members) {
          const chips = mode === 'host' ? live.map((u) => `<button class="chip${u === t ? ' sel' : ''}" data-move="${c.id}" data-team="${u}" style="--tc:${TEAM_INFO[u].color}">${TEAM_INFO[u].name}</button>`).join('') : '';
          html += `<li>${nm(c)}${c === me ? ' <b>(you)</b>' : ''}<span class="chips">${chips}</span></li>`;
        }
      }
    } else {
      $('tpTitle').textContent = 'Team up';
      $('tpNote').textContent = "Teammates' paint can't hurt each other. Leaving a team takes 3 seconds.";
      for (const c of others) {
        const k = pairKey(me, c), al = alliances[k];
        let act;
        if (al) act = al.breakT > 0 ? `<span class="leaving">Leaving… ${Math.ceil(al.breakT)}</span>` : `<button class="tbtn alt" data-act="break" data-id="${c.id}">Leave team</button>`;
        else if (requests[c.id + '>' + myId]) act = `<button class="tbtn" data-act="accept" data-id="${c.id}">Accept</button><button class="tbtn alt" data-act="decline" data-id="${c.id}">No</button>`;
        else if (requests[myId + '>' + c.id]) act = `<span class="asked">Asked…</span><button class="tbtn alt" data-act="cancel" data-id="${c.id}">Cancel</button>`;
        else act = `<button class="tbtn" data-act="ask" data-id="${c.id}">Team up</button>`;
        html += `<li>${nm(c)}${al ? ' 🤝' : ''}<span class="chips">${c.alive || c.isBot || !c.away ? act : ''}</span></li>`;
      }
    }
    $('tpList').innerHTML = html;
  }
  teamPanel.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'tpClose') { closeTeams(); return; }
    if (b.dataset.act) requestTeam(b.dataset.act, byId(b.dataset.id));
    if (b.dataset.move && mode === 'host') { const c = byId(b.dataset.move); if (c && c.team !== +b.dataset.team) setTeam(c, +b.dataset.team, true); }
    renderTeams();
  });
  $('teamBtn').addEventListener('click', () => (panelOpen ? closeTeams() : openTeams()));
  // someone asked you to team up
  const askEl = $('teamAsk');
  let askFrom = null;
  function updateAsk() {
    const k = !teamMode && me ? Object.keys(requests).find((x) => x.endsWith('>' + me.id)) : null;
    const from = k ? byId(k.split('>')[0]) : null;
    if (from !== askFrom) {
      askFrom = from;
      askEl.hidden = !from;
      if (from) $('askText').innerHTML = `🤝 <b style="color:${from.color}">${esc(from.name)}</b> wants to team up!`;
    }
  }
  askEl.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && askFrom) requestTeam(b.dataset.ans, askFrom);
  });

  // ---------- Brain Boost: a question card when you're splatted ----------
  // Easy math or Spanish (Off / Math / Spanish / Mix, and Age 7-10, saved on each device). The respawn waits
  // while the question is up. Right: a reward screen, then "Let's go!" brings you back with a boost.
  // Wrong: you see the right answer and come back without a prize; nothing else happens.
  // About 1 in 4 is a ⭐ challenge a grade harder, for a super prize. 3 right in a row: pick your prize.
  // Two misses in a row: the next few are a grade easier.
  const brainEl = $('brain');
  const CHALLENGE_CHANCE = 0.25;
  const SUPER_PRIZES = ['golden', 'turret', 'triple', 'dome', 'mine'];
  const BRAIN_BOOSTS = ['rapid', 'speed', 'mag', 'triple', 'heart'];
  const ALL_PRIZES = ['rapid', 'speed', 'mag', 'triple', 'golden', 'wall', 'heal', 'dome', 'turret', 'heart', 'bush', 'mine'];
  const LEARN_MODES = ['off', 'math', 'spanish', 'mix'];
  let learnMode = LEARN_MODES.includes(store.get('pbw3d-learn')) ? store.get('pbw3d-learn') : 'mix';
  let brainAge = [7, 8, 9, 10].includes(store.get('pbw3d-age')) ? store.get('pbw3d-age') : 7;
  const brain = { ok: 0, all: 0, streak: 0, misses: 0, easy: 0, stars: 0, state: 'off', q: null, seen: null, force: null, opened: 0 };

  function nextQuestion() {
    let level = brainAge, challenge = false;
    const force = brain.force; brain.force = null; // tests can ask for a 'challenge' or a 'normal' one
    if (force === 'challenge') { level = brainAge + 1; challenge = true; }
    else if (brain.easy > 0) { brain.easy--; level = Math.max(6, brainAge - 1); } // after misses: a bit easier for a while
    else if (force !== 'normal' && Math.random() < CHALLENGE_CHANCE) { level = brainAge + 1; challenge = true; } // a grade harder, super prize
    const subject = learnMode === 'mix' ? pick(['math', 'spanish']) : learnMode;
    const q = window.BrainBank.makeQuestion(subject, level);
    q.challenge = challenge;
    return q;
  }
  function openBrain() {
    const q = brain.q = nextQuestion();
    brain.state = 'ask'; brain.opened = now;
    clearGoRows();
    const card = brainEl.querySelector('.bcard');
    card.classList.toggle('challenge', !!q.challenge);
    brainEl.querySelector('.btag').innerHTML = q.challenge ? '<span class="star">⭐ Challenge</span>' : '🧠 Brain Boost';
    $('bStreak').textContent = brain.streak ? `🔥 ${brain.streak} in a row` : '';
    const qEl = $('bQ');
    qEl.textContent = q.q;
    if (q.sayPrompt) {
      const b = document.createElement('button'); b.className = 'say'; b.textContent = '🔊'; b.setAttribute('aria-label', 'Hear it');
      b.onclick = () => window.BrainBank.sayEs(q.sayPrompt);
      qEl.appendChild(b);
    }
    const pic = $('bPic');
    pic.textContent = q.pic || '';
    if (q.swatch) { const sw = document.createElement('span'); sw.className = 'swatch'; sw.style.background = q.swatch; pic.appendChild(sw); }
    const opts = $('bOpts');
    opts.textContent = '';
    q.opts.forEach((o, i) => {
      const b = document.createElement('button');
      b.textContent = o.label;
      if (o.big) b.classList.add('big');
      if (o.color) { b.style.background = o.color; b.style.minHeight = '72px'; b.setAttribute('aria-label', `Color ${i + 1}`); }
      if (!touchMode) { const k = document.createElement('small'); k.textContent = `press ${i + 1}`; b.appendChild(k); }
      b.onclick = () => answerBrain(i);
      opts.appendChild(b);
    });
    const msg = $('bMsg');
    msg.className = 'bmsg';
    msg.textContent = q.challenge ? '⭐ Challenge question! Get it right for a SUPER prize!' : 'Answer right to win a prize!';
    $('bTimer').textContent = 'Take your time 🙂';
    brainEl.hidden = false;
    deadEl.hidden = true;
    if (locked) document.exitPointerLock(); // so you can click the answers
    mouseDown = false;
    if (q.sayPrompt) window.BrainBank.sayEs(q.sayPrompt);
  }
  function answerBrain(i) {
    const q = brain.q;
    if (brain.state !== 'ask' || !q) return;
    brain.state = 'answered';
    brain.all++;
    const buttons = [...$('bOpts').querySelectorAll('button')];
    buttons.forEach((b) => { b.disabled = true; });
    buttons[q.answer].classList.add('right');
    $('bTimer').textContent = '';
    const msg = $('bMsg');
    if (q.say) window.BrainBank.sayEs(q.say);
    if (i === q.answer) {
      brain.ok++; brain.streak++; brain.misses = 0;
      sfx.pick();
      msg.className = 'bmsg good'; msg.textContent = `✅ Yes! ${q.explain}`;
      if (q.challenge) { brain.stars++; msg.textContent = `⭐ Amazing! ${q.explain}`; setTimeout(() => showPrizes(true), 900); }
      else if (brain.streak % 3 === 0) setTimeout(() => showPrizes(false), 900);
      else setTimeout(() => showReward(pick(BRAIN_BOOSTS), q.explain), 900);
    } else {
      buttons[i].classList.add('wrong');
      brain.streak = 0;
      $('bStreak').textContent = '';
      if (!q.challenge && ++brain.misses >= 2) { brain.easy = 3; brain.misses = 0; } // a few easier ones next (challenges don't count)
      msg.className = 'bmsg oops'; msg.textContent = `Almost! ${q.explain}`;
      // take your time reading the answer, then jump back in (no prize, no penalty)
      continueButton('OK, back in! ▶', () => { claimPrize(null); closeBrain(); });
    }
  }
  // one big button under the card (also Enter or Space)
  function continueButton(text, go) {
    clearGoRows();
    const b = document.createElement('button');
    b.className = 'go'; b.textContent = text;
    b.onclick = () => { if (brain.state !== 'off') go(); };
    const row = document.createElement('div'); row.className = 'gorow'; row.appendChild(b);
    brainEl.querySelector('.bcard').appendChild(row);
    b.focus({ preventScroll: true });
  }
  function clearGoRows() { for (const row of brainEl.querySelectorAll('.gorow')) row.remove(); }
  // the success screen: what you got and what it does
  function showReward(k, explain) {
    if (brain.state === 'off') return;
    const fromChallenge = brain.state === 'prize' && brainEl.querySelector('.bcard').classList.contains('challenge');
    brain.state = 'reward';
    const P = POWERUPS[k];
    $('bQ').textContent = explain ? '✅ Correct!' : fromChallenge ? '⭐ Super prize!' : '🎁 Great pick!';
    const pic = $('bPic');
    pic.textContent = '';
    const icon = document.createElement('div'); icon.className = 'prize'; icon.textContent = P.icon;
    icon.style.background = P.color;
    pic.appendChild(icon);
    $('bOpts').textContent = '';
    const msg = $('bMsg');
    msg.className = 'bmsg good'; msg.textContent = '';
    const l1 = document.createElement('div'); l1.className = 'pname'; l1.textContent = `You got ${P.name}!`;
    const l2 = document.createElement('div'); l2.className = 'pdesc';
    l2.textContent = P.place ? `${P.desc}. Place it with ${touchMode ? 'its button at the bottom' : 'its number key or E'}.` : `${P.desc} until you get splatted.`;
    msg.append(l1, l2);
    if (explain) { const e = document.createElement('div'); e.className = 'pexp'; e.textContent = explain; msg.appendChild(e); }
    sfx.pick();
    continueButton("Let's go! ▶", () => { claimPrize(k); closeBrain(); });
  }
  // superPrize: after a challenge question, choose from the best items
  function showPrizes(superPrize) {
    if (brain.state !== 'answered') return;
    brain.state = 'prize';
    $('bQ').textContent = superPrize ? '⭐ Pick your SUPER prize!' : 'Pick your prize! 🎁';
    $('bStreak').textContent = brain.streak ? `🔥 ${brain.streak} in a row` : '';
    $('bPic').textContent = '';
    const opts = $('bOpts');
    opts.textContent = '';
    const choices = shuffleArr(superPrize ? SUPER_PRIZES : ALL_PRIZES).slice(0, 3);
    choices.forEach((k, i) => {
      const P = POWERUPS[k], b = document.createElement('button');
      b.className = 'pick'; b.dataset.k = k;
      b.innerHTML = `<span class="pi" style="background:${P.color}">${P.icon}</span><small>${P.name}${touchMode ? '' : ` · ${i + 1}`}</small>`;
      b.onclick = () => { if (brain.state === 'prize') showReward(k); };
      opts.appendChild(b);
    });
    $('bMsg').className = 'bmsg'; $('bMsg').textContent = '';
  }
  const shuffleArr = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  function brainKey(i) {
    const go = brainEl.querySelector('.go');
    if (go) { go.click(); return; }
    const b = $('bOpts').querySelectorAll('button')[i];
    if (b && !b.disabled) b.click();
  }
  function closeBrain() {
    clearGoRows();
    brainEl.hidden = true;
    const wasOpen = brain.state !== 'off';
    brain.state = 'off'; brain.q = null;
    if (me && !me.alive && state === 'play') deadEl.hidden = false;
    if (wasOpen && state === 'play' && !panelOpen) lockPointer();
  }
  // You're back in: right away in solo and hosting, or by asking the host. One prize per splat.
  function claimPrize(k) {
    if (mode === 'client') sendHost({ t: 'brain', k: k || null });
    else if (me) brainReward(me, k);
  }
  function brainReward(p, k) {
    if (p.brainDeath === p.deaths) return; // one prize per splat
    p.brainDeath = p.deaths;
    p.asking = false;
    if (!p.alive && !p.awayUntil) spawn(p);
    if (!k || !POWERUPS[k]) return;
    givePowerup(p, k);
    fx({ t: 'pick', p: p.id, k, n: p.items.length });
  }
  // watches for your own splat (the same in solo, hosting or joined games)
  function brainTick() {
    if (!me || state === 'menu' || state === 'lobby') return;
    if (me.alive) { brain.seen = me.deaths; if (brain.state !== 'off') closeBrain(); return; } // (back in after 2 minutes: the card goes)
    // one card per splat
    if (brain.state === 'off' && brain.seen !== me.deaths && learnMode !== 'off' && gameOver == null) { brain.seen = me.deaths; openBrain(); }
  }
  function brainScoreText() {
    return brain.all ? `🧠 ${brain.ok}/${brain.all}` + (brain.stars ? ` · ⭐ ${brain.stars}` : '') : '';
  }
  // the settings on the start screen
  function setLearnMode(v) {
    learnMode = LEARN_MODES.includes(v) ? v : 'mix';
    store.set('pbw3d-learn', learnMode);
    for (const b of document.querySelectorAll('#learnSeg button')) b.classList.toggle('sel', b.dataset.v === learnMode);
    $('ageRow').hidden = learnMode === 'off';
  }
  function setAge(a) {
    brainAge = [7, 8, 9, 10].includes(a) ? a : 7;
    brain.easy = 0;
    store.set('pbw3d-age', brainAge);
    for (const b of document.querySelectorAll('#ageSeg button')) b.classList.toggle('sel', +b.dataset.v === brainAge);
  }
  for (const b of document.querySelectorAll('#learnSeg button')) b.onclick = () => setLearnMode(b.dataset.v);
  for (const b of document.querySelectorAll('#ageSeg button')) b.onclick = () => setAge(+b.dataset.v);
  setLearnMode(learnMode);
  setAge(brainAge);

  // ---------- Update ready: get a newer version without losing your game ----------
  // Every 90 seconds the page checks whether its files changed online. If they did, a button appears: it
  // saves the game, reloads past any cached copy (?fresh=…) and puts everything back. A host's update takes
  // friends along: they reload too and rejoin the same room as the same players. Because the matchmaking
  // service can keep a room code reserved for up to a minute after a reload, the host comes back at a fresh
  // address (CODE-2, CODE-3, …) that friends already know, and reclaims the plain code for new joiners later.
  const SAVE_KEY = 'pbw3d-save', SAVE_FORMAT = 1, CHECK_EVERY = 90;
  const FILES = ['index.html', 'game.js', 'net.js', 'brain.js'];
  const updateBtn = $('update');
  let pageVersion = null, updateReady = false, updating = false, roomGen = 1, basePeer = null, pendingDecals = null;
  function hashText(t) {
    let h = 2166136261;
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }
  async function fetchVersion() {
    if (!/^https?:$/.test(location.protocol)) return null;
    const base = location.href.split(/[?#]/)[0].replace(/[^/]*$/, '');
    const texts = await Promise.all(FILES.map((f) => fetch(base + f, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : ''))));
    return hashText(texts.join('\u0000'));
  }
  async function checkForUpdate() {
    if (updateReady) return true;
    try {
      const v = await fetchVersion();
      if (!pageVersion) pageVersion = v;
      else if (v && v !== pageVersion) { updateReady = true; refreshUpdateButton(); }
    } catch (e) { /* offline: try again next time */ }
    return updateReady;
  }
  checkForUpdate();
  setInterval(checkForUpdate, CHECK_EVERY * 1000);
  const inAGame = () => state === 'play' || state === 'pause';
  function refreshUpdateButton() {
    updateBtn.hidden = !updateReady;
    if (!updateReady || updating) return;
    const friend = mode === 'client' && inAGame();
    updateBtn.disabled = friend;
    updateBtn.textContent = friend ? '✨ Update ready · the host can update everyone'
      : mode === 'host' ? '✨ Update ready · tap to update everyone'
      : inAGame() ? '✨ Update ready · tap to update (your game is saved)' : '✨ Update ready · tap to update';
  }
  updateBtn.onclick = () => {
    if (updating || !updateReady || (mode === 'client' && inAGame())) return;
    updating = true;
    updateBtn.textContent = 'Updating…';
    if (mode === 'host') {
      roomGen++;
      for (const c of conns) { try { c.send({ t: 'update', gen: roomGen }); } catch (e) { /* dropped */ } }
      setTimeout(saveAndReload, 500); // give friends a moment to hear it
    } else saveAndReload();
  };
  function saveState(save) {
    try { sessionStorage.setItem(SAVE_KEY, JSON.stringify(save)); }
    catch (e) { try { save.decals = null; sessionStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e2) { /* can't save */ } }
  }
  const CHAR_FIELDS = ['id', 'name', 'color', 'ownColor', 'isBot', 'remote', 'team', 'role', 'ss', 'x', 'y', 'z', 'yaw', 'pitch', 'hp', 'maxHp',
    'alive', 'respawn', 'shield', 'kills', 'deaths', 'streak', 'ammo', 'magSize', 'reload', 'buffs', 'items', 'sel', 'stamina', 'awayUntil', 'brainDeath', 'blocks', 'crouch'];
  function decalData() { // paint stays where it was
    const out = [], m = new T.Matrix4(), c = new T.Color();
    for (let i = 0; i < decals.count; i++) {
      decals.getMatrixAt(i, m); decals.getColorAt(i, c);
      out.push([...m.elements.map((v) => Math.round(v * 1000) / 1000), c.getHex()]);
    }
    return { list: out, next: decalNext };
  }
  function restoreDecals(d) {
    if (!d || !Array.isArray(d.list)) return;
    const m = new T.Matrix4(), c = new T.Color();
    d.list.slice(0, MAX_DECALS).forEach((a, i) => {
      m.fromArray(a.slice(0, 16)); decals.setMatrixAt(i, m); decals.setColorAt(i, c.setHex(a[16]));
      decalPos[i * 3] = a[12]; decalPos[i * 3 + 1] = a[13]; decalPos[i * 3 + 2] = a[14];
    });
    decals.count = Math.min(d.list.length, MAX_DECALS);
    decalNext = (d.next || 0) % MAX_DECALS;
    decals.instanceMatrix.needsUpdate = true; decals.instanceColor.needsUpdate = true;
  }
  function serializeGame() {
    const base = { f: SAVE_FORMAT, at: Date.now(), mode, name: myName(), color: chosenColor, roomCode, roomGen,
      brain: { ok: brain.ok, all: brain.all, streak: brain.streak, misses: brain.misses, easy: brain.easy, stars: brain.stars } };
    if (mode === 'client') return { ...base, myId: me && me.id, gen: roomGen, decals: inAGame() ? decalData() : null };
    if (state === 'lobby') return { ...base, lobby: { teams: lobby.teams, total: lobby.total } };
    if (!me || !inAGame()) return base;
    return { ...base, myId: me.id, now, teamMode, totalPlayers, gameOver, nextId, nextPerson, itemId,
      bases: bases.map((b) => [b.alive, b.capTeam, b.cap]),
      chars: chars.map((c) => Object.fromEntries(CHAR_FIELDS.map((k) => [k, c[k]]))),
      drops: drops.map((d) => [d.id, d.type, d.x, d.y, d.z, d.ttl]),
      deploys: deploys.map((d) => ({ id: d.id, type: d.type, owner: d.owner.id, color: d.color, x: d.x, y: d.y, z: d.z, yaw: d.yaw, w: d.w, d: d.d, ttl: d.ttl, hp: d.hp, cool: d.cool })),
      alliances, requests, decals: decalData(), blocks: blockList() };
  }
  function saveAndReload() {
    saveState(serializeGame());
    stopNet(); // let go of the room code right away so it's free again sooner
    if (basePeer) { try { basePeer.destroy(); } catch (e) { /* gone */ } basePeer = null; }
    reloadFresh();
  }
  // a one-off address skips any cached copy, so everyone lands on the newest version
  function reloadFresh() {
    const u = new URL(location.href);
    u.searchParams.set('fresh', Date.now().toString(36));
    location.replace(u.toString());
  }
  function restoreGame(sv) {
    if (!sv || sv.f !== SAVE_FORMAT || Date.now() - sv.at > 120000) return false;
    try {
      if (sv.name) nameEl.value = sv.name;
      if (COLORS.includes(sv.color)) { chosenColor = sv.color; colorsEl.querySelectorAll('button').forEach((b, i) => b.classList.toggle('sel', COLORS[i] === chosenColor)); }
      if (sv.brain) Object.assign(brain, sv.brain);
      if (sv.mode === 'client') {
        if (!sv.roomCode) return false;
        pendingDecals = sv.decals;
        joinGame({ code: sv.roomCode, rejoin: sv.myId, gen: sv.gen || 1, fresh: sv.fresh || 0, updated: true, tries: 0 });
        return true;
      }
      if (sv.mode === 'host' && sv.lobby) { // updated from the lobby: open it again, friends rejoin it
        roomGen = sv.roomGen || 1;
        hostGame(sv.roomCode, 0, { gen: roomGen, lobby: sv.lobby });
        return true;
      }
      if (!Array.isArray(sv.chars)) return false;
      resetWorld();
      mode = sv.mode === 'host' ? 'host' : 'solo';
      teamMode = sv.teamMode || 0; totalPlayers = sv.totalPlayers || NUM_BOTS + 1; gameOver = sv.gameOver == null ? null : sv.gameOver;
      now = sv.now || 0; nextId = sv.nextId || nextId; nextPerson = sv.nextPerson || nextPerson; itemId = sv.itemId || 0;
      buildBases(teamMode);
      if (Array.isArray(sv.bases)) sv.bases.forEach(([alive, capTeam, cap], i) => { if (bases[i]) Object.assign(bases[i], { alive, capTeam, cap }); });
      for (const o of sv.chars) {
        const c = makeChar(o.name, o.color, o.isBot, o.id);
        Object.assign(c, o);
        c.buffs = o.buffs || {}; c.items = Array.isArray(o.items) ? o.items : [];
        setColor(c, o.color);
        if (c.isBot) bots.push(c);
      }
      me = byId(sv.myId);
      if (!me) { resetWorld(); mode = 'solo'; makeBots(); return false; }
      for (const [id, type, x, y, z, ttl] of sv.drops || []) { const d = spawnDrop(x, y, z, type); d.id = id; d.ttl = ttl; }
      for (const o of sv.deploys || []) { const owner = byId(o.owner); if (owner && DEPLOY[o.type]) registerDeploy({ ...o, owner, flash: 0, alive: true, shield: 0, vx: 0, vz: 0, aimH: 0.75 }); }
      alliances = sv.alliances || {}; requests = sv.requests || {};
      for (const [id, i, j, y0, hp, ownerId, color] of sv.blocks || []) addBlock(i, j, y0, byId(ownerId) || nobody(ownerId), color, id, hp);
      restoreDecals(sv.decals);
      if (mode === 'host') {
        // friends are reloading too: keep their players safe and waiting for 90 seconds
        for (const c of chars) if (c.remote) { c.awayUntil = now + 90; c.shield = Math.max(c.shield, 3); }
        roomGen = sv.roomGen || 1;
        lobby = { teams: teamMode, total: totalPlayers, people: [] }; // for "Back to the lobby" later
        hostGame(sv.roomCode, 0, { gen: roomGen });
      }
      enterPlay();
      brain.seen = null;
      addNote('✨ Updated! Your game was saved.');
      if (!touchMode && !TEST) pause(); // click to grab the mouse again
      return true;
    } catch (e) {
      console.warn('Could not restore the saved game', e);
      return false;
    }
  }
  function startUp() {
    let sv = null;
    try { sv = JSON.parse(sessionStorage.getItem(SAVE_KEY)); sessionStorage.removeItem(SAVE_KEY); } catch (e) { /* no save */ }
    if (sv && restoreGame(sv)) return;
    menuEl.hidden = false;
  }

  // ---------- Drawing people ----------
  function updateModels(dt) {
    for (const c of chars) {
      const m = c.m;
      if (m.ring) m.ring.visible = false;
      if (c === me) { m.g.visible = false; m.shadow.visible = false; continue; }
      if (c.awayUntil || c.away) { m.g.visible = false; m.shadow.visible = false; continue; }
      if (!c.alive) {
        c.deadT += dt;
        // squash into a puddle, then vanish
        const k = clamp(c.deadT / 0.22, 0, 1);
        m.g.scale.set(1 + k * 0.6, 1 - k * 0.85, 1 + k * 0.6);
        m.g.visible = c.deadT < 0.35; m.shadow.visible = false; m.tag.visible = false;
        continue;
      }
      // back in play (a friend's screen never runs spawn(), so this is where others become visible there)
      if (!m.g.visible || c.deadT > 0) { m.g.visible = true; m.g.scale.set(1, 1, 1); c.deadT = 0; }
      const speed = Math.hypot(c.vx, c.vz);
      c.walkT += dt * (2 + speed * 1.6);
      const bob = c.onGround ? Math.abs(Math.sin(c.walkT)) * 0.06 * Math.min(1, speed / 3) : 0;
      m.g.position.set(c.x, c.y + bob, c.z);
      m.g.rotation.y = c.yaw;
      m.g.rotation.z = Math.sin(c.walkT) * 0.05 * Math.min(1, speed / 3);
      m.feet[0].position.z = Math.sin(c.walkT) * 0.18 * Math.min(1, speed / 3);
      m.feet[1].position.z = -m.feet[0].position.z;
      m.duckK += ((c.crouch ? 1 : 0) - m.duckK) * Math.min(1, dt * 12); // ducking: squash down to about 1 m
      m.up.scale.y = 1 - 0.34 * m.duckK;
      m.tag.position.y = 2.05 - 0.75 * m.duckK;
      m.bubble.position.y = 0.85 - 0.3 * m.duckK;
      m.bubble.visible = c.shield > 0;
      if (c.shield > 0) shared.bubbleMat.opacity = 0.18 + Math.sin(now * 8) * 0.07;
      m.shadow.position.set(c.x, heightAt(c.x, c.z, 0) + 0.02, c.z);
      m.shadow.visible = true;
      // name tags hide when someone is hiding (unless you're right next to them)
      const near = me && me.alive ? Math.hypot(c.x - me.x, c.z - me.z) : 99;
      m.tag.visible = !(concealed(c) && near > HIDE_NEAR);
      drawTag(c);
      // a green dashed ring around anyone you've teamed up with (orange while leaving)
      const al = me && !teamMode && alliances[pairKey(me, c)];
      if (al) {
        if (!m.ring) { m.ring = new T.Mesh(shared.ring, new T.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, color: 0x3dff8b })); scene.add(m.ring); }
        m.ring.visible = true;
        m.ring.position.set(c.x, heightAt(c.x, c.z, 0) + 0.04, c.z);
        m.ring.rotation.y = now * 0.6;
        m.ring.material.color.set(al.breakT > 0 ? '#ff8a3d' : '#3dff8b');
      }
    }
  }
  function updateCamera(dt) {
    if (state === 'menu' || state === 'lobby' || !me) { // slow fly-around behind the start screen
      const a = now * 0.06;
      camera.position.set(Math.sin(a) * 38, 16, Math.cos(a) * 38);
      camera.lookAt(0, 1, 0);
      return;
    }
    if (me.alive) {
      const speed = Math.hypot(me.vx, me.vz);
      bobT += dt * speed * 1.7;
      const bob = me.onGround ? Math.sin(bobT) * 0.04 * Math.min(1, speed / WALK) : 0;
      me.eyeH = me.eyeH == null ? EYE : me.eyeH + ((me.crouch ? EYE_DUCK : EYE) - me.eyeH) * Math.min(1, dt * 14);
      camera.position.set(me.x, me.y + me.eyeH + bob, me.z);
      camera.rotation.set(me.pitch, me.yaw, 0);
    } else { // float up and look down at the splat
      const k = clamp(me.deadT / 0.8, 0, 1);
      me.deadT += dt;
      camera.position.set(me.x, me.y + EYE + k * 2.5, me.z + k * 1.5);
      camera.rotation.set(-0.3 - k * 0.6, me.yaw, 0);
    }
  }
  function updateViewModel(dt) {
    recoil = Math.max(0, recoil - dt * 9);
    flashT -= dt;
    vm.flash.visible = flashT > 0;
    const speed = Math.hypot(me.vx, me.vz) / WALK;
    const rl = me.reload > 0 ? Math.sin((1 - me.reload / RELOAD_TIME) * Math.PI) : 0;
    vm.position.set(vm.base.x + Math.sin(bobT) * 0.012 * speed, vm.base.y + Math.abs(Math.cos(bobT)) * 0.012 * speed - rl * 0.08, vm.base.z + recoil * 0.05);
    vm.rotation.set(recoil * 0.12 + rl * 0.7, 0, rl * 0.3);
    vm.hop.scale.set(1, 0.9 + rl * 0.15 * Math.sin(now * 40), 1.3);
  }

  // ---------- Main loop ----------
  function resize() {
    const w = innerWidth, h = innerHeight, aspect = w / h;
    renderer.setSize(w, h, false);
    // keep at least ~80° across on tall phone screens
    const vfov = aspect < 1.1 ? clamp((2 * Math.atan(Math.tan((80 * Math.PI) / 360) / aspect) * 180) / Math.PI, 72, 100) : 72;
    camera.fov = vfov; camera.aspect = aspect; camera.updateProjectionMatrix();
    vmCamera.fov = Math.min(vfov, 80); vmCamera.aspect = aspect; vmCamera.updateProjectionMatrix();
    // hold the gun low and to the right, wherever that is on this screen shape
    const tv = Math.tan((vmCamera.fov * Math.PI) / 360), depth = 0.52;
    vm.base.set(clamp(0.62 * depth * tv * aspect, 0.06, 0.17), -0.55 * depth * tv, -depth);
    vm.scale.setScalar((touchMode ? 0.52 : 0.62) * clamp(aspect, 0.55, 1));
  }
  window.addEventListener('resize', () => { resize(); hudKey = ''; });
  resize();

  function step(dt) {
    now += dt;
    if (mode === 'client' && state !== 'lobby') { clientStep(dt); return; } // (in the lobby, the bots behind it play on their own)
    // you're in the game (a paused game with friends keeps going around you)
    const inGame = me && (state === 'play' || state === 'pause') && chars.includes(me);
    if (inGame && me.alive) updateMe(dt);
    for (const b of bots) if (b.alive) updateBot(b, dt);
    for (const c of chars) {
      if (c.alive && c.shield > 0) c.shield -= dt;
      if (!c.alive && !c.awayUntil && (c !== me || inGame)) {
        const asking = c === me ? brain.state !== 'off' : c.asking; // a Brain Boost question is up: wait (2 minutes at most)
        if (asking && (c.askT = (c.askT || 0) + dt) < 120) continue;
        c.respawn -= dt; if (c.respawn <= 0) spawn(c);
      }
    }
    separate();
    updateDrops(dt);
    updateDeploys(dt);
    updateBlocks(dt);
    updateTeams(dt);
    updateBases(dt);
    updateBalls(dt);
    updateParts(dt);
    if (mode === 'host' && state !== 'lobby') { hostStep(); sendSnapshots(dt); }
  }
  let last = performance.now(), updT = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    if ((updT -= 1) <= 0) { updT = 30; refreshUpdateButton(); }
    const dt = clamp((t - last) / 1000, 0, 0.05); // (the first frame's time can come out a hair negative)
    last = t;
    if (state !== 'pause' || mode !== 'solo') step(dt);
    updateModels(dt);
    updateBaseVisuals();
    updateGhost();
    updateCamera(dt);
    renderer.info.reset();
    renderer.clear();
    renderer.render(scene, camera);
    if (me && state !== 'menu' && state !== 'lobby') {
      updateHUD(dt);
      if (me.alive) { updateViewModel(dt); renderer.clearDepth(); renderer.render(vmScene, vmCamera); }
    }
  }
  makeBots();
  startUp(); // the start screen, or the game you had before an update
  requestAnimationFrame(frame);

  // Hooks for automated tests (and curious grown-ups in the console).
  window.PBW = {
    get state() { return state; }, get me() { return me; }, chars, bots, balls, solids, navPoints, hideZones,
    heightAt, concealed, canSee, keys, input, startGame, pause, resume, step, renderer, hit: hitChar,
    drops, deploys, spawnDrop, givePowerup, placeItem, fireBall, clearItems, POWERUPS, DEPLOY, MAX_CARRY,
    get decalCount() { return decals.count; },
    look(yaw, pitch) { if (me) { me.yaw = yaw; me.pitch = pitch; } },
    setTouchMode, hitsBody, paintCheck, blocks, placeBlock, blockTarget, useBlock, earnBlock, get blockTargetNow() { return myTarget; },
    brain, BrainBank: window.BrainBank, setLearnMode, setAge,
    get learnMode() { return learnMode; }, get brainAge() { return brainAge; },
    update: { check: checkForUpdate, get ready() { return updateReady; }, get version() { return pageVersion; } },
    get mode() { return mode; }, get teamMode() { return teamMode; }, get bases() { return bases; }, get gameOver() { return gameOver; },
    get alliances() { return alliances; }, get requests() { return requests; }, allied, friendly, teamAction, setTeam, requestTeam, byId,
    net: {
      host: hostGame, join: joinGame, start: startHosted, leave: leaveGame, toLobby: backToLobby,
      get code() { return roomCode; }, get lobby() { return mode === 'host' ? lobby : clientLobby; }, get conns() { return conns; },
      get totalPlayers() { return totalPlayers; }, rebalanceBots,
    },
  };
})();
