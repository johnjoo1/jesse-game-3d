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
  const PLAYER_R = 0.45, EYE = 1.5;
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
  function heightAt(x, z, r) {
    let h = 0;
    const i0 = cellOf(x - r), i1 = cellOf(x + r), j0 = cellOf(z - r), j1 = cellOf(z + r);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cell = grid[j * GN + i];
      for (let k = 0; k < cell.length; k++) {
        const o = cell[k];
        if (x + r <= o.x0 || x - r >= o.x1 || z + r <= o.z0 || z - r >= o.z1) continue;
        const oh = o.ramp ? rampHeight(o, x, z) : o.h;
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
      if (y < (o.ramp ? rampHeight(o, x, z) : o.h)) return o;
    }
    return null;
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
      const o = addSolid({ x0: cx - w * 0.42, x1: cx + w * 0.42, z0: cz - d * 0.42, z1: cz + d * 0.42, h, kind: 'rock' });
      markers.push(o);
      const g = 0.55 + rng() * 0.2;
      rockInst.push({ x: cx, z: cz, sx: w / 2, sy: h, sz: d / 2, ry: rng() * 6, color: new T.Color(g, g, g * 1.05) });
      take(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2); rocks++;
    }
    // Pine trees with low, thick branches you can hide in. Only the trunk is solid.
    tries = 0; let trees = 0;
    while (trees < 16 && tries++ < 600) {
      const cx = R(-HALF + 5, HALF - 5), cz = R(-HALF + 5, HALF - 5);
      if (!isFree(cx - 2, cx + 2, cz - 2, cz + 2, 1.5)) continue;
      addSolid({ x0: cx - 0.3, x1: cx + 0.3, z0: cz - 0.3, z1: cz + 0.3, h: 4, kind: 'trunk' });
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
    const rockGeo = new T.DodecahedronGeometry(1, 0);
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
  function hideDecalsIn(o) { // paint on something that just broke goes with it
    _m4.makeScale(0, 0, 0);
    for (let i = 0; i < decals.count; i++) {
      const x = decalPos[i * 3], y = decalPos[i * 3 + 1], z = decalPos[i * 3 + 2];
      if (x > o.x0 - 0.05 && x < o.x1 + 0.05 && z > o.z0 - 0.05 && z < o.z1 + 0.05 && y > 0.02 && y < o.h + 0.05) decals.setMatrixAt(i, _m4);
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
    white: new T.MeshLambertMaterial({ color: 0xffffff }),
    black: new T.MeshBasicMaterial({ color: 0x1c2230 }),
    dark: new T.MeshLambertMaterial({ color: 0x343b4f }),
    shadowMat: new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }),
    bubbleMat: new T.MeshBasicMaterial({ color: 0xaaf0ff, transparent: true, opacity: 0.25, depthWrite: false }),
  };
  const paintMats = new Map();
  function paintMat(color) {
    if (!paintMats.has(color)) paintMats.set(color, new T.MeshLambertMaterial({ color }));
    return paintMats.get(color);
  }
  function makeModel(color) {
    const g = new T.Group();
    const bodyMat = new T.MeshLambertMaterial({ color });
    const body = new T.Mesh(shared.body, bodyMat);
    body.scale.set(0.9, 1.25, 0.9); body.position.y = 0.85; g.add(body);
    const band = new T.Mesh(shared.band, shared.dark); band.position.y = 1.12; band.scale.set(0.98, 1, 0.98); g.add(band);
    for (const sx of [-1, 1]) {
      const e = new T.Mesh(shared.eye, shared.white); e.position.set(sx * 0.15, 1.13, -0.4); e.scale.z = 0.6; g.add(e);
      const p = new T.Mesh(shared.pupil, shared.black); p.position.set(sx * 0.15, 1.13, -0.47); g.add(p);
    }
    const feet = [];
    for (const sx of [-1, 1]) { const f = new T.Mesh(shared.foot, shared.dark); f.position.set(sx * 0.18, 0.1, 0); f.scale.set(1, 0.7, 1.4); g.add(f); feet.push(f); }
    const gun = new T.Mesh(shared.gun, shared.dark); gun.position.set(0.38, 0.75, -0.35); g.add(gun);
    const hop = new T.Mesh(shared.hopper, bodyMat); hop.position.set(0.38, 0.88, -0.25); g.add(hop);
    const bubble = new T.Mesh(shared.bubble, shared.bubbleMat); bubble.position.y = 0.85; bubble.visible = false; g.add(bubble);
    const spots = new T.Group(); g.add(spots);
    // name tag with health pips
    const tc = document.createElement('canvas'); tc.width = 256; tc.height = 72;
    const tag = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(tc), depthWrite: false }));
    tag.scale.set(2, 0.56, 1); tag.position.y = 2.05; g.add(tag);
    scene.add(g);
    const shadow = new T.Mesh(shared.shadow, shared.shadowMat); scene.add(shadow);
    return { g, body, bodyMat, hop, feet, bubble, spots, tag, tc, shadow, tagKey: '' };
  }
  function drawTag(p) {
    const key = p.name + '|' + p.color + '|' + p.hp + '/' + p.maxHp;
    if (key === p.m.tagKey) return;
    p.m.tagKey = key;
    const ctx = p.m.tc.getContext('2d');
    ctx.clearRect(0, 0, 256, 72);
    ctx.font = '900 30px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(16,22,36,0.85)'; ctx.strokeText(p.name, 128, 22);
    ctx.fillStyle = p.color; ctx.fillText(p.name, 128, 22);
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
  function makeChar(name, color, isBot) {
    const p = {
      id: nextId++, name, color, isBot, m: makeModel(color),
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
    let best = null, bestScore = -1;
    for (let k = 0; k < 14; k++) {
      const c = pick(navPoints);
      if (k < 13 && heightAt(c.x, c.z, 0.9) > 0) continue; // a barricade or turret is standing there
      let near = 99;
      for (const o of chars) if (o !== p && o.alive) near = Math.min(near, Math.hypot(o.x - c.x, o.z - c.z));
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
  function fireBall(owner, ox, oy, oz, dx, dy, dz, dmg = 1, color = owner.color, src = null) {
    if (balls.length >= MAX_BALLS) balls.shift();
    balls.push({ x: ox, y: oy, z: oz, vx: dx * BALL_SPEED, vy: dy * BALL_SPEED, vz: dz * BALL_SPEED, life: BALL_LIFE, owner, color, dmg, src });
  }
  // A shot from a person or bot: Triple Shot fans out 3 balls, the Golden Gun's count double.
  function launch(p, ox, oy, oz, dx, dy, dz) {
    const golden = !!p.buffs.golden;
    for (const a of p.buffs.triple ? [-TRIPLE_SPREAD, 0, TRIPLE_SPREAD] : [0]) {
      const cs = Math.cos(a), sn = Math.sin(a);
      fireBall(p, ox, oy, oz, dx * cs + dz * sn, dy, -dx * sn + dz * cs, golden ? 2 : 1, golden ? GOLD : p.color);
    }
  }
  function hitsBody(c, x, y, z) { // capsule around the blob body
    const ex = x - c.x, ez = z - c.z, h2 = ex * ex + ez * ez;
    if (h2 > 1) return false;
    const dy = y - clamp(y, c.y + 0.6, c.y + 1.1);
    return h2 + dy * dy < 0.36; // (0.5 + BALL_R)^2
  }
  function inBubble(c, x, y, z) { const dy = y - (c.y + 0.85); return (x - c.x) ** 2 + dy * dy + (z - c.z) ** 2 < 1.05; }
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
          if (!c.alive || friendly(c, b.owner)) continue; // your own paint passes through you
          if (c.shield > 0 && inBubble(c, b.x, b.y, b.z)) { burst(b.x, b.y, b.z, '#bff6ff', 8, 3); if (c === me || b.owner === me) sfx.block(); done = true; break; }
          if (hitsBody(c, b.x, b.y, b.z)) { hitChar(c, b.owner, b.x, b.y, b.z, b.dmg, b.color, b.src); done = true; break; }
        }
        if (done) break;
        // the fence
        if (Math.abs(b.x) > HALF || Math.abs(b.z) > HALF) {
          if (b.y < 3.2) {
            const onX = Math.abs(b.x) - HALF > Math.abs(b.z) - HALF;
            const nx = onX ? -Math.sign(b.x) : 0, nz = onX ? 0 : -Math.sign(b.z);
            splash(onX ? Math.sign(b.x) * HALF : b.x, b.y, onX ? b.z : Math.sign(b.z) * HALF, nx, 0, nz, b.color);
          }
          done = true; break;
        }
        // ground
        if (b.y <= 0) { splash(b.x, 0, b.z, 0, 1, 0, b.color); done = true; break; }
        // boxes and ramps
        const o = solidAtPoint(b.x, b.z, b.y);
        if (o) {
          // any paint wears a barricade down, its owner's included; turrets only take enemy paint
          if (o.dep && (o.dep.type === 'wall' || !friendly(o.dep.owner, b.owner))) hitDeploy(o.dep);
          if (o.ramp) {
            const top = rampHeight(o, px, pz);
            if (py >= top - 0.05) { // landed on the slope
              const L = o.axis === 'x' ? o.x1 - o.x0 : o.z1 - o.z0, k = (o.h / L) * o.dir;
              const len = Math.hypot(k, 1);
              const nx = o.axis === 'x' ? -k / len : 0, nz = o.axis === 'z' ? -k / len : 0;
              splash(b.x, rampHeight(o, b.x, b.z), b.z, nx, 1 / len, nz, b.color);
            } else sideSplash(o, px, pz, b);
          } else if (py >= o.h) splash(b.x, o.h, b.z, 0, 1, 0, b.color);
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
  function sideSplash(o, px, pz, b) {
    // which side of the box did it come from?
    const dx = px < o.x0 ? o.x0 - px : px > o.x1 ? px - o.x1 : 0;
    const dz = pz < o.z0 ? o.z0 - pz : pz > o.z1 ? pz - o.z1 : 0;
    if (dx >= dz) { const nx = px < o.x0 ? -1 : 1; splash(nx < 0 ? o.x0 : o.x1, b.y, b.z, nx, 0, 0, b.color); }
    else { const nz = pz < o.z0 ? -1 : 1; splash(b.x, b.y, nz < 0 ? o.z0 : o.z1, 0, 0, nz, b.color); }
  }
  function splash(x, y, z, nx, ny, nz, color) {
    addDecal(x, y, z, nx, ny, nz, color, rand(0.45, 0.8));
    burst(x + nx * 0.05, y + ny * 0.05, z + nz * 0.05, color, 5, 2.2);
    if (me && me.alive) { const d = Math.hypot(x - me.x, z - me.z); if (d < 14) sfx.splat(0.35 * (1 - d / 14)); }
  }

  // shooter gets the credit; src is the turret or mine that did it, if any
  function hitChar(c, shooter, x, y, z, dmg = 1, color = shooter.color, src = null) {
    if (!c.alive) return;
    if (c.shield > 0) { burst(x, y, z, '#bff6ff', 8, 3); return; }
    // a spot of paint on them, where it hit
    if (c.spots < 10) {
      const lx = x - c.x, ly = y - (c.y + 0.85), lz = z - c.z;
      const cs = Math.cos(-c.yaw), sn = Math.sin(-c.yaw);
      _v.set(lx * cs + lz * sn, ly, -lx * sn + lz * cs).normalize();
      const s = new T.Mesh(shared.spot, paintMat(color));
      s.position.set(_v.x * 0.45, 0.85 + _v.y * 0.6, _v.z * 0.45);
      s.scale.set(1, 1, 0.45);
      s.lookAt(_v.x * 2, 0.85 + _v.y * 2, _v.z * 2);
      c.m.spots.add(s); c.spots++;
    }
    burst(x, y, z, color, 12, 3.5);
    c.hp = Math.max(0, c.hp - dmg);
    c.lastHitBy = shooter;
    c.hurtBy = shooter; c.hurtT = 3;
    if (c.isBot) botHurt(c, src && src.alive ? src : shooter);
    if (c === me) hurtFx(src || shooter, color);
    if (c.hp <= 0) splatChar(c, shooter, src);
    else if (shooter === me) { hitMarker(false); sfx.hit(); }
  }
  function splatChar(c, killer, src) {
    c.alive = false; c.respawn = RESPAWN_TIME; c.deadT = 0; c.deaths++; c.streak = 0;
    if (killer && killer !== c) { killer.kills++; killer.streak++; }
    burst(c.x, c.y + 0.9, c.z, killer.color, 46, 6);
    burst(c.x, c.y + 0.9, c.z, c.color, 16, 4);
    addDecal(c.x, heightAt(c.x, c.z, 0) + 0.005, c.z, 0, 1, 0, killer.color, 2.6);
    addFeed(killer, c, src ? POWERUPS[src.type].icon : '');
    if (Math.random() < DROP_CHANCE) spawnDrop(c.x, heightAt(c.x, c.z, 0), c.z); // half of all splats drop something
    if (killer === me) { hitMarker(true); sfx.kill(); splatPopup(c); }
    else if (me && me.alive) { const d = Math.hypot(c.x - me.x, c.z - me.z); if (d < 30) sfx.splat(0.8 * (1 - d / 30)); }
    if (c === me) { sfx.splatted(); setDeadUI(true, killer); }
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
      const a = chars[i]; if (!a.alive) continue;
      for (let j = i + 1; j < chars.length; j++) {
        const b = chars[j]; if (!b.alive || Math.abs(a.y - b.y) > 1.4) continue;
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
  const friendly = (a, b) => a === b; // teams arrive with multiplayer

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
    const d = { type, x, y, z, ttl: DROP_LIFETIME, g, icon, ring, phase: Math.random() * 6 };
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
      d.icon.position.y = 0.9 + Math.sin(now * 3 + d.phase) * 0.12;
      d.ring.rotation.y += dt * 2;
      d.g.visible = d.ttl > 4 || Math.floor(d.ttl * 5) % 2 === 0; // blinks before it fades
      // with all 3 carry slots full, a defense stays on the ground for someone else
      const place = POWERUPS[d.type].place;
      const near = (p) => p.alive && Math.hypot(p.x - d.x, p.z - d.z) < 1.1 && Math.abs(p.y - d.y) < 1.4;
      const taker = chars.find((p) => near(p) && (!place || p.items.length < MAX_CARRY));
      if (!taker) {
        if (me && near(me) && fullNoteT <= 0) { fullNoteT = 3; toast('Your 3 defense slots are full. Place one to make room!', '#ffffff'); }
        continue;
      }
      givePowerup(taker, d.type);
      removeDrop(d);
      if (taker === me) {
        const P = POWERUPS[d.type];
        sfx.pick();
        const how = !place ? '' : touchMode ? ' · tap it below to place it' : ` · press ${me.items.length} to place it`;
        toast(`<b>${P.icon} ${P.name}!</b> ${P.desc}${how}`, P.color);
        hudKey = '';
      }
    }
  }

  // ----- placed defenses -----
  const deploys = [];
  function placeItem(p, slot = p.sel) {
    if (!p || !p.alive || !Number.isInteger(slot) || slot < 0 || slot >= p.items.length) return false;
    const type = p.items.splice(slot, 1)[0], cfg = DEPLOY[type];
    p.sel = clamp(p.sel, 0, Math.max(0, p.items.length - 1));
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), lim = HALF - 1;
    const d = { type, owner: p, color: p.color, ttl: cfg.ttl, hp: cfg.hp || 0, x: p.x, y: p.y, z: p.z, yaw: p.yaw, cool: 0, flash: 0,
      alive: true, shield: 0, vx: 0, vz: 0, born: now };
    if (type === 'wall') { d.x = p.x + fx * 1.7; d.z = p.z + fz * 1.7; }        // stands across your line of fire
    else if (type === 'turret') { d.x = p.x + fx * 1.3; d.z = p.z + fz * 1.3; d.aimH = 0.75; }
    else if (type === 'mine') d.cool = cfg.arm;                                     // arms after a moment
    d.x = clamp(d.x, -lim, lim); d.z = clamp(d.z, -lim, lim);
    if (type === 'wall' || type === 'turret') d.y = heightAt(d.x, d.z, 0);
    if (type === 'wall') {
      const across = Math.abs(fx) >= Math.abs(fz); // facing along x: the wall runs along z
      d.w = across ? 0.5 : 2.8; d.d = across ? 2.8 : 0.5;
      d.solid = addSolid({ x0: d.x - d.w / 2, x1: d.x + d.w / 2, z0: d.z - d.d / 2, z1: d.z + d.d / 2, h: d.y + 2, kind: 'barricade', dep: d });
    } else if (type === 'turret') {
      d.solid = addSolid({ x0: d.x - 0.3, x1: d.x + 0.3, z0: d.z - 0.3, z1: d.z + 0.3, h: d.y + 0.55, kind: 'turret', dep: d });
    } else if (type === 'bush') {
      d.zone = { x: d.x, z: d.z, r: cfg.r * 0.95, top: d.y + 1.75, kind: 'bush' }; hideZones.push(d.zone);
      d.leaf = { x: d.x, y: d.y + 0.75, z: d.z, r: cfg.r * 0.95 }; leafBalls.push(d.leaf);
    }
    buildDeployModel(d);
    deploys.push(d);
    if (!cfg.ttl) { // lasting defenses never time out, so cap how many each player has up at once
      const mine = deploys.filter((q) => q.owner === p && !DEPLOY[q.type].ttl);
      if (mine.length > MAX_LASTING) removeDeploy(mine[0], true);
    }
    if (p === me) { sfx.place(); hudKey = ''; }
    else if (me && me.alive && state === 'play' && Math.hypot(d.x - me.x, d.z - me.z) < 25) sfx.place(0.4);
    return true;
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
          burst(b.x, b.y, b.z, b.color, 8, 3); hitDeploy(d);
          if (b.owner === me) { hitMarker(false); sfx.hit(); }
          return true;
        }
      }
    }
    return false;
  }
  function boom(d) {
    removeDeploy(d, false);
    const R = DEPLOY.mine.r;
    burst(d.x, d.y + 0.3, d.z, d.color, 70, 8);
    addDecal(d.x, d.y + 0.006, d.z, 0, 1, 0, d.color, 3.6);
    for (let k = 0; k < 5; k++) {
      const a = Math.random() * 6.28, r = rand(1, R);
      const x = d.x + Math.cos(a) * r, z = d.z + Math.sin(a) * r;
      addDecal(x, heightAt(x, z, 0) + 0.006, z, 0, 1, 0, d.color, rand(0.6, 1.1));
    }
    if (me && state === 'play') { const dd = Math.hypot(d.x - me.x, d.z - me.z); if (dd < 40) sfx.boom(1 - dd / 40); }
    for (const q of chars) { // everyone nearby except the owner's side takes 2 hits, counted as the owner's
      if (!q.alive || friendly(q, d.owner) || Math.hypot(q.x - d.x, q.z - d.z) > R || Math.abs(q.y - d.y) > 2) continue;
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
          if (!q.alive || Math.hypot(q.x - d.x, q.z - d.z) >= cfg.r || Math.abs(q.y - d.y) > 2) continue;
          q.healT += dt;
          if (q.healT >= 1.5 && q.hp < q.maxHp) {
            q.healT = 0; q.hp++;
            burst(q.x, q.y + 1, q.z, '#3dff8b', 14, 2.5);
            if (q === me) { sfx.heal(); hudKey = ''; }
          }
        }
        if (Math.random() < dt * 6) burst(d.x + rand(-1.2, 1.2), d.y + 0.1, d.z + rand(-1.2, 1.2), '#9dffc0', 1, 1.2);
      } else if (d.type === 'mine') {
        if (d.cool > 0) d.cool -= dt;
        else if (chars.some((q) => q.alive && !friendly(q, d.owner) && Math.hypot(q.x - d.x, q.z - d.z) < cfg.trigger && Math.abs(q.y - d.y) < 1.2)) {
          boom(d);
          continue;
        }
      } else if (d.type === 'turret') {
        d.cool -= dt;
        let best = null, bestD = cfg.range;
        const hx = d.x, hy = d.y + 0.75, hz = d.z;
        for (const o of chars) {
          if (friendly(o, d.owner) || !o.alive || o.shield > 0) continue;
          const dd = Math.hypot(o.x - hx, o.z - hz);
          if (dd > bestD || (concealed(o) && dd > HIDE_NEAR) || !clearLine(hx, hy, hz, o.x, o.y + 0.9, o.z, dd > HIDE_NEAR)) continue;
          best = o; bestD = dd;
        }
        if (best) {
          const lead = (bestD / BALL_SPEED) * 0.5, tx = best.x + best.vx * lead, tz = best.z + best.vz * lead;
          const want = Math.atan2(-(tx - hx), -(tz - hz));
          d.yaw += clamp(angDiff(d.yaw, want), -6 * dt, 6 * dt);
          if (d.cool <= 0 && Math.abs(angDiff(d.yaw, want)) < 0.2) {
            d.cool = cfg.rate;
            const time = bestD / BALL_SPEED, a = d.yaw + rand(-0.06, 0.06);
            const pitch = Math.atan2(best.y + 0.85 - hy + 0.5 * BALL_GRAVITY * time * time, bestD) + rand(-0.03, 0.03), cp = Math.cos(pitch);
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
      g.visible = d.owner === me; // only you (and later your teammates) can see your mines
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
      d.g.visible = d.owner === me;
      d.lightMat.color.set(d.cool > 0 || Math.floor(now * 2) % 2 ? d.color : '#ffffff');
    }
  }
  function clearItems() {
    while (drops.length) removeDrop(drops[0]);
    while (deploys.length) removeDeploy(deploys[0], false);
  }

  // ---------- Bots ----------
  function botHurt(b, shooter) {
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
    return clearLine(b.x, b.y + EYE, b.z, o.x, o.y + 1.25, o.z, d > HIDE_NEAR) ||
      clearLine(b.x, b.y + EYE, b.z, o.x, o.y + 0.6, o.z, d > HIDE_NEAR);
  }
  function botPerceive(b) {
    let best = null, bestScore = Infinity;
    const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
    for (const o of chars) {
      if (o === b || !o.alive) continue;
      const dx = o.x - b.x, dz = o.z - b.z, d = Math.hypot(dx, dz);
      if (d > SIGHT) continue;
      const alert = (b.hurtBy === o && b.hurtT > 0) || o === b.target;
      if (!alert && d > 7 && (dx * fx + dz * fz) / (d || 1) < 0.2) continue; // outside its view
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
    } else if (b.target && (!b.target.alive || now - b.lastSeen > 3)) {
      if (b.target.alive) { b.goal = { x: b.seenX, z: b.seenZ }; b.goalT = 8; } // go look where they were
      b.target = null;
      if (b.mode === 'fight') b.mode = 'wander';
    }
    // put a defense down in a fight (a heal station only once hurt)
    if (b.target && b.items.length && b.react <= 0 && Math.random() < 0.1) {
      const slot = b.hp < b.maxHp && b.items.includes('heal') ? b.items.indexOf('heal') : b.items.findIndex((k) => k !== 'heal');
      if (slot >= 0) placeItem(b, slot);
    }
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
    const t = b.target && b.target.alive ? b.target : null;
    if (b.mode === 'cover' && b.cover) {
      const dx = b.cover.x - b.x, dz = b.cover.z - b.z, d = Math.hypot(dx, dz);
      if (d > 0.8) { [mx, mz] = steer(b, dx, dz); speed = BS * 1.2; }
      else { b.coverT -= dt; if (b.ammo < b.magSize) startReload(b); }
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
    const ox = b.x, oy = b.y + 1.0, oz = b.z;
    const tx = t.x, ty = t.y + (t.aimH || 0.85), tz = t.z;
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
    const cp = Math.cos(me.pitch), ex = me.x, ey = me.y + EYE, ez = me.z;
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
    useAmmo(me);
    sfx.shot(0.9);
    recoil = 1; flashT = 0.05;
  }
  // On touch screens, paint bends a little toward someone close to the crosshair.
  function aimAssist(ex, ey, ez, dx, dy, dz) {
    let best = null, bestA = 0.06;
    for (const c of chars) {
      if (c === me || !c.alive) continue;
      const tx = c.x - ex, ty = c.y + 0.85 - ey, tz = c.z - ez;
      const d = Math.hypot(tx, ty, tz);
      if (d > 35) continue;
      const a = Math.acos(clamp((tx * dx + ty * dy + tz * dz) / d, -1, 1));
      if (a < bestA && !(concealed(c) && d > HIDE_NEAR) && clearLine(ex, ey, ez, c.x, c.y + 0.85, c.z, false)) { bestA = a; best = [tx / d, ty / d, tz / d]; }
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
    const sprintWanted = (keys.ShiftLeft || keys.ShiftRight || input.sprintTouch) && fwd > 0.3;
    let speed = WALK * (me.buffs.speed ? 1.3 : 1);
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
    if (!locked && state === 'play' && !touchMode && !TEST) pause();
  });
  canvas.addEventListener('mousedown', (e) => {
    if (state !== 'play' || touchMode) return;
    if (!locked && !TEST) { lockPointer(); return; }
    if (e.button === 0) { initAudio(); mouseDown = true; }
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('mousedown', (e) => { if (e.button === 2 && state === 'play' && me && (locked || TEST)) placeItem(me, me.sel); });
  window.addEventListener('wheel', (e) => { if (state === 'play' && me && (locked || TEST)) cycleSlot(e.deltaY > 0 ? 1 : -1); }, { passive: true });
  function cycleSlot(dir) { if (me.items.length > 1) me.sel = (me.sel + dir + me.items.length) % me.items.length; }
  document.addEventListener('mousemove', (e) => {
    if (state !== 'play' || !me || !me.alive || (!locked && !TEST)) return;
    const mx = clamp(e.movementX, -250, 250), my = clamp(e.movementY, -250, 250);
    me.yaw -= mx * 0.0024; me.pitch = clamp(me.pitch - my * 0.0024, -1.45, 1.45);
  });
  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') { if (e.code === 'Enter') startGame(); return; }
    setTouchMode(false);
    keys[e.code] = true;
    if (state === 'play' && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (state === 'play' && e.code === 'KeyR' && me) startReload(me);
    if (state === 'play' && me) { // defenses: 1/2/3 place that slot, E the highlighted one, Tab moves the highlight
      const n = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (n >= 0) placeItem(me, n);
      if (e.code === 'KeyE') placeItem(me, me.sel);
      if (e.code === 'Tab') { e.preventDefault(); cycleSlot(1); }
    }
    if (state === 'play' && e.code === 'KeyP') pause();
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
    touches.clear(); input.fire = input.jump = input.sprintTouch = false; input.stickX = input.stickY = 0; stickEl.hidden = true;
    document.querySelectorAll('.tb.on').forEach((b) => b.classList.remove('on'));
  }

  // ---------- HUD ----------
  const hud = $('hud'), hitEl = $('hitmark'), splatEl = $('splat'), feedEl = $('feed'), boardEl = $('board');
  const heartsEl = $('hearts'), ammoN = $('ammoN'), ballsEl = $('balls'), reloadEl = $('reload'), stamEl = $('stam');
  const deadEl = $('dead'), buffsEl = $('buffs'), slotsEl = $('slots');
  slotsEl.addEventListener('click', (e) => { // touch: tap a carried defense to place it
    const b = e.target.closest('[data-slot]');
    if (b && state === 'play' && me) placeItem(me, +b.dataset.slot);
  });
  let hitAnim = null;
  function hitMarker(kill) {
    hitEl.classList.toggle('kill', kill);
    if (kill) hitEl.style.setProperty('--kc', me.color);
    if (hitAnim) hitAnim.cancel();
    hitAnim = hitEl.animate([{ opacity: 1, transform: 'scale(1.3)' }, { opacity: 1, transform: 'scale(1)', offset: 0.3 }, { opacity: 0, transform: 'scale(1)' }],
      { duration: kill ? 600 : 320, easing: 'ease-out' });
  }
  function splatPopup(victim) {
    splatEl.style.setProperty('--kc', me.color);
    splatEl.querySelector('.who').textContent = `You splatted ${victim.name}!` + (me.streak >= 3 ? `  🔥 ${me.streak} in a row` : '');
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
    const key = [me.hp, me.maxHp, me.ammo, me.magSize, me.reload > 0, me.color, Object.keys(me.buffs).join(), me.items.join(), me.sel, touchMode].join(',');
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
      const top = touchMode ? 3 : 5;
      let rows = sorted.slice(0, top);
      if (!rows.includes(me)) rows = [...rows, me];
      boardEl.innerHTML = '<div class="h">Splats</div>' + rows.map((p) =>
        `<div class="r${p === me ? ' me' : ''}"><span class="d" style="background:${p.color}"></span><span class="nm">${sorted.indexOf(p) + 1}. ${esc(p.name)}</span><span>${p.kills}</span></div>`).join('');
      updateSightings();
    }
    drawMap();
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
      if (d.type === 'mine' && d.owner !== me) continue; // only your own mines show
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
    for (const c of chars) {
      if (c === me || !c.alive) continue;
      if (now - (seenOnMap.get(c) || -99) > 1.5) continue;
      const dx = c.x - me.x, dz = c.z - me.z;
      const x = (dx * cs - dz * sn) * s + W / 2, y = (dx * sn + dz * cs) * s + W / 2;
      mctx.beginPath(); mctx.arc(x, y, 9, 0, 7); mctx.fillStyle = c.color; mctx.fill();
      mctx.lineWidth = 3; mctx.strokeStyle = '#1c2230'; mctx.stroke();
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
  $('quit').onclick = toMenu;
  $('pauseBtn').addEventListener('click', pause);
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') pause(); });

  const bots = [];
  function makeBots() {
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    for (let i = 0; i < NUM_BOTS; i++) { const b = makeChar(names[i], COLORS[(i + 1) % COLORS.length], true); bots.push(b); spawn(b); }
  }
  makeBots();

  function startGame() {
    if (state === 'play') return;
    initAudio();
    const name = (nameEl.value.trim() || 'Player').slice(0, 12);
    store.set('pbw3d-profile', { name, color: chosenColor });
    if (!me) { me = makeChar(name, chosenColor, false); me.m.g.visible = false; }
    me.name = name; setColor(me, chosenColor);
    vm.hopperMat.color.set(chosenColor); vm.flash.material.color.set(chosenColor);
    document.documentElement.style.setProperty('--me', chosenColor);
    // bots wear the other colors
    const others = COLORS.filter((c) => c !== chosenColor);
    bots.forEach((b, i) => setColor(b, others[i % others.length]));
    clearDecals();
    clearItems();
    balls.length = 0;
    for (const c of chars) { c.kills = 0; c.deaths = 0; c.streak = 0; c.alive = false; }
    for (const c of chars) spawn(c);
    feed.length = 0; feedEl.innerHTML = '';
    hudKey = '';
    menuEl.hidden = true; hud.hidden = false;
    if (document.activeElement) document.activeElement.blur();
    state = 'play';
    $('touch').hidden = !touchMode;
    $('stickHint').hidden = false;
    lockPointer();
  }
  function pause() {
    if (state !== 'play') return;
    state = 'pause';
    mouseDown = false; clearTouches(); for (const k in keys) keys[k] = false;
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
    if (me) { me.alive = false; me.m.shadow.visible = false; }
    if (locked) document.exitPointerLock();
  }

  // ---------- Drawing people ----------
  function updateModels(dt) {
    for (const c of chars) {
      const m = c.m;
      if (c === me) { m.g.visible = false; m.shadow.visible = false; continue; }
      if (!c.alive) {
        c.deadT += dt;
        // squash into a puddle, then vanish
        const k = clamp(c.deadT / 0.22, 0, 1);
        m.g.scale.set(1 + k * 0.6, 1 - k * 0.85, 1 + k * 0.6);
        m.g.visible = c.deadT < 0.35; m.shadow.visible = false; m.tag.visible = false;
        continue;
      }
      const speed = Math.hypot(c.vx, c.vz);
      c.walkT += dt * (2 + speed * 1.6);
      const bob = c.onGround ? Math.abs(Math.sin(c.walkT)) * 0.06 * Math.min(1, speed / 3) : 0;
      m.g.position.set(c.x, c.y + bob, c.z);
      m.g.rotation.y = c.yaw;
      m.g.rotation.z = Math.sin(c.walkT) * 0.05 * Math.min(1, speed / 3);
      m.feet[0].position.z = Math.sin(c.walkT) * 0.18 * Math.min(1, speed / 3);
      m.feet[1].position.z = -m.feet[0].position.z;
      m.bubble.visible = c.shield > 0;
      if (c.shield > 0) shared.bubbleMat.opacity = 0.18 + Math.sin(now * 8) * 0.07;
      m.shadow.position.set(c.x, heightAt(c.x, c.z, 0) + 0.02, c.z);
      m.shadow.visible = true;
      // name tags hide when someone is hiding (unless you're right next to them)
      const near = me && me.alive ? Math.hypot(c.x - me.x, c.z - me.z) : 99;
      m.tag.visible = !(concealed(c) && near > HIDE_NEAR);
      drawTag(c);
    }
  }
  function updateCamera(dt) {
    if (state === 'menu' || !me) { // slow fly-around behind the start screen
      const a = now * 0.06;
      camera.position.set(Math.sin(a) * 38, 16, Math.cos(a) * 38);
      camera.lookAt(0, 1, 0);
      return;
    }
    if (me.alive) {
      const speed = Math.hypot(me.vx, me.vz);
      bobT += dt * speed * 1.7;
      const bob = me.onGround ? Math.sin(bobT) * 0.04 * Math.min(1, speed / WALK) : 0;
      camera.position.set(me.x, me.y + EYE + bob, me.z);
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
    if (me && state === 'play') {
      if (me.alive) updateMe(dt);
      if (me.shield > 0) me.shield -= dt;
    }
    for (const b of bots) {
      if (b.alive) { updateBot(b, dt); if (b.shield > 0) b.shield -= dt; }
    }
    for (const c of chars) {
      if (!c.alive && (c !== me || state === 'play')) { c.respawn -= dt; if (c.respawn <= 0 && (c !== me || state === 'play')) spawn(c); }
    }
    separate();
    updateDrops(dt);
    updateDeploys(dt);
    updateBalls(dt);
    updateParts(dt);
  }
  let last = performance.now();
  function frame(t) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (state !== 'pause') step(dt);
    updateModels(dt);
    updateCamera(dt);
    renderer.info.reset();
    renderer.clear();
    renderer.render(scene, camera);
    if (me && state !== 'menu') {
      updateHUD(dt);
      if (me.alive) { updateViewModel(dt); renderer.clearDepth(); renderer.render(vmScene, vmCamera); }
    }
  }
  menuEl.hidden = false;
  requestAnimationFrame(frame);

  // Hooks for automated tests (and curious grown-ups in the console).
  window.PBW = {
    get state() { return state; }, get me() { return me; }, chars, bots, balls, solids, navPoints, hideZones,
    heightAt, concealed, canSee, keys, input, startGame, pause, resume, step, renderer, hit: hitChar,
    drops, deploys, spawnDrop, givePowerup, placeItem, fireBall, clearItems, POWERUPS, DEPLOY, MAX_CARRY,
    get decalCount() { return decals.count; },
    look(yaw, pitch) { if (me) { me.yaw = yaw; me.pitch = pitch; } },
    setTouchMode,
  };
})();
