// Blocks and ducking: earn a block per splat, build like in Minecraft, duck behind it for cover.
// Run:  node tests/blocks.mjs     (see tests/lib.mjs)
import { SHOTS, check, open, newContext, finish } from './lib.mjs';

const T = { timeout: 20000 };
const errs = [];
// helpers in the page: open ground, you there facing -z, bots parked
const HELPERS = () => {
  window.H = {
    spot() {
      for (const [clear, r] of [[7, 0.6], [6, 0.6], [5, 0.6], [7, 0]]) for (const n of PBW.navPoints) {
        let ok = Math.abs(n.x) < 35 && Math.abs(n.z) < 35;
        for (let dx = -clear; ok && dx <= clear; dx += 1) for (let dz = -clear; ok && dz <= clear; dz += 1) {
          if (PBW.heightAt(n.x + dx, n.z + dz, r) > 0 || PBW.concealed({ x: n.x + dx, z: n.z + dz, y: 0 })) ok = false;
        }
        if (ok) return { x: Math.floor(n.x) + 0.5, z: Math.floor(n.z) + 0.5 };
      }
      throw new Error('no open spot');
    },
    fresh() {
      PBW.clearItems();
      for (const b of PBW.bots) { b.alive = false; b.respawn = 1e9; }
      const me = PBW.me, s = this.spot();
      Object.assign(me, { x: s.x, z: s.z, y: 0, vx: 0, vz: 0, vy: 0, yaw: 0, pitch: 0, onGround: true, alive: true, hp: 5, shield: 0, blocks: 0, crouch: false });
      PBW.keys.KeyC = false; PBW.input.duck = false;
      PBW.step(1 / 60);
      return s;
    },
    run(sec, each) { for (let i = 0; i < Math.round(sec * 60); i++) { if (each) each(i); PBW.step(1 / 60); } },
    put(c, x, z, yaw = 0) { Object.assign(c, { x, z, y: 0, vx: 0, vz: 0, vy: 0, onGround: true, yaw, alive: true, shield: 0, respawn: 0 }); if (!c.hp) c.hp = c.maxHp; },
  };
};

console.log('Blocks and ducking (desktop 1100x700)');
const t = await open({ viewport: { width: 1100, height: 700 } });
errs.push(t);
await t.page.evaluate(() => PBW.setLearnMode('off'));
await t.page.fill('#name', 'Jesse');
await t.page.click('#play');
await t.page.evaluate(HELPERS);

// ----- earning blocks -----
const earn = await t.page.evaluate(() => {
  const me = PBW.me, s = H.fresh(), b = PBW.bots[0], b2 = PBW.bots[1];
  H.put(b, s.x, s.z - 5); b.hp = 3;
  PBW.hit(b, me, b.x, 1, b.z, 3);
  const mine = me.blocks;
  H.put(b2, s.x + 3, s.z); b2.hp = 3; b2.blocks = 0;
  H.put(b, s.x + 3, s.z - 2); b.hp = 3;
  PBW.hit(b, b2, b.x, 1, b.z, 3);
  return { mine, bot: b2.blocks };
});
check(earn.mine === 1, `splatting someone earns you a block (${earn.mine} 🧱)`);
check(earn.bot === 0, "bots don't earn blocks");
await t.page.waitForTimeout(400);
const hud = await t.page.evaluate(() => [!document.getElementById('blocksHud').hidden, document.getElementById('blocksN').textContent, document.getElementById('toast').textContent]);
check(hud[0] && hud[1] === '1' && /earned a block/.test(hud[2]), `the HUD shows your blocks, and the first one explains how to build ("${hud[2].slice(0, 48)}…")`);

// ----- building -----
const build = await t.page.evaluate(() => {
  const me = PBW.me, s = H.fresh(), out = {};
  me.blocks = 10;
  me.pitch = -Math.atan(1.5 / 3); // look at the ground 3 m ahead
  PBW.step(1 / 60);
  const g = PBW.blockTarget(me);
  out.ghost = g && g.ok && g.y0 === 0 && Math.abs(g.j + 0.5 - (s.z - 3)) <= 1;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF' }));
  const b1 = PBW.blocks[0];
  out.placed = !!b1 && me.blocks === 9 && PBW.heightAt(b1.i + 0.5, b1.j + 0.5, 0.4) === 1;
  // stack: look at the top of it
  me.pitch = -Math.atan((1.5 - 1) / Math.abs(b1.j + 0.5 - me.z));
  const g2 = PBW.blockTarget(me);
  PBW.useBlock();
  out.stack = g2 && g2.i === b1.i && g2.j === b1.j && PBW.blocks.length === 2 && PBW.blocks[1].y0 === 1;
  out.tower = PBW.blocks.filter((b) => b.i === b1.i && b.j === b1.j).map((b) => b.y0).join(',');
  // the side of a block: the next one goes in front of it, on the ground
  me.pitch = -0.08;
  const g3 = PBW.blockTarget(me);
  out.side = g3 && g3.i === b1.i && g3.j === b1.j + 1 && g3.y0 === 0;
  // not inside yourself
  const self = PBW.blockTarget({ ...me, pitch: -1.45 });
  out.self = self && !self.ok;
  // no higher than 7 m
  for (let k = 0; k < 6; k++) PBW.placeBlock(me, b1.i, b1.j);
  out.top = Math.max(...PBW.blocks.filter((b) => b.i === b1.i && b.j === b1.j).map((b) => b.y0 + 1));
  out.cell = [b1.i, b1.j];
  return out;
});
check(build.ghost, 'a ghost block shows where yours will go');
check(build.placed, 'F puts the block there (one less to carry)');
check(build.stack && build.tower === '0,1', `look at the top of a block to stack on it, like in Minecraft (tower: ${build.tower})`);
check(build.side, "look at the side of a block (once it's taller than you can see over) to put the next one in front of it");
check(build.self, "you can't build inside yourself (the ghost turns red)");
check(build.top === 7, `towers go up to 7 m (${build.top} m)`);
await t.page.evaluate(() => { PBW.me.pitch = -0.2; PBW.me.blocks = 5; });
await t.page.waitForTimeout(500);
await t.page.screenshot({ path: `${SHOTS}/blocks-1-ghost.png` });

// walking into blocks, and climbing them
const climb = await t.page.evaluate(() => {
  const me = PBW.me, s = H.fresh();
  me.blocks = 3;
  PBW.placeBlock(me, Math.floor(s.x), Math.floor(s.z) - 2);
  PBW.keys.KeyW = true; H.run(1.5); PBW.keys.KeyW = false;
  const stopped = me.z > Math.floor(s.z) - 1 && me.y < 0.1;
  PBW.keys.KeyW = true; let top = 0;
  H.run(1.5, (i) => { PBW.keys.Space = i % 30 < 2; if (me.onGround) top = Math.max(top, me.y); });
  PBW.keys.KeyW = PBW.keys.Space = false;
  return { stopped, top };
});
check(climb.stopped && climb.top === 1, `blocks stop you, and you can jump up onto one (stood at ${climb.top} m)`);

// ----- ducking -----
const duck = await t.page.evaluate(() => {
  const me = PBW.me, s = H.fresh(), b = PBW.bots[2], out = {};
  PBW.keys.KeyC = true;
  PBW.keys.KeyW = true; H.run(1); PBW.keys.KeyW = false;
  out.speed = +Math.hypot(me.vx, me.vz).toFixed(2);
  out.crouch = me.crouch;
  // a paintball at 1.2 m goes over a ducking player, not a standing one
  out.overDuck = !PBW.hitsBody(me, me.x, 1.2, me.z);
  PBW.keys.KeyC = false; H.run(0.1);
  out.hitsStanding = PBW.hitsBody(me, me.x, 1.2, me.z);
  // ducking behind a 1 m block hides you from a bot on the other side
  H.fresh(); me.blocks = 1;
  const i = Math.floor(me.x), j = Math.floor(me.z) - 1;
  PBW.placeBlock(me, i, j);
  H.put(b, me.x, me.z - 9, Math.PI);
  PBW.keys.KeyC = true; H.run(0.2);
  out.hidden = !PBW.canSee(b, me);
  PBW.keys.KeyC = false; H.run(0.2);
  out.seen = PBW.canSee(b, me);
  b.alive = false; b.respawn = 1e9;
  return out;
});
check(duck.crouch && duck.speed > 2 && duck.speed < 3.2, `hold C to duck: you move slowly (${duck.speed} m/s, normally 6)`);
check(duck.overDuck && duck.hitsStanding, 'ducking makes you about 1 m tall: paint at 1.2 m goes over you');
check(duck.hidden && duck.seen, 'ducking behind a block hides you from a bot on the other side; standing up shows you again');
await t.page.evaluate(() => { PBW.keys.KeyC = true; PBW.me.pitch = -0.05; });
await t.page.waitForTimeout(600);
await t.page.screenshot({ path: `${SHOTS}/blocks-2-duck.png` });
const eye = await t.page.evaluate(() => [PBW.me.eyeH, (PBW.keys.KeyC = false)]);
check(eye[0] < 1, `your view drops down when you duck (eye at ${eye[0].toFixed(2)} m)`);

// ----- breaking -----
const brk = await t.page.evaluate(() => {
  const me = PBW.me, s = H.fresh();
  me.blocks = 3;
  const i = Math.floor(s.x), j = Math.floor(s.z) - 3;
  for (let k = 0; k < 3; k++) PBW.placeBlock(me, i, j);
  const bottom = PBW.blocks.find((b) => b.y0 === 0);
  const hp = [];
  for (let k = 0; k < 4; k++) { PBW.fireBall(me, i + 0.5, 0.5, j + 2.5, 0, 0.02, -1); H.run(0.3); hp.push(bottom.hp); }
  return { hp, left: PBW.blocks.filter((b) => b.i === i && b.j === j).map((b) => b.y0).join(','), height: PBW.heightAt(i + 0.5, j + 0.5, 0.2) };
});
check(brk.hp.join() === '3,2,1,0', `any paint wears a block down: 4 hits break it (${brk.hp.join(' → ')})`);
check(brk.left === '0,1' && brk.height === 2, `the blocks above drop down, so nothing floats (left: ${brk.left})`);
const keep = await t.page.evaluate(() => {
  const me = PBW.me; H.fresh(); me.blocks = 6;
  PBW.hit(me, PBW.bots[0], me.x, 1, me.z, 9);
  H.run(3.5);
  return [me.alive, me.blocks];
});
check(keep[0] && keep[1] === 6, `you keep your blocks when you're splatted (${keep[1]})`);
check(t.errors.length === 0, 'no console errors' + (t.errors.length ? ': ' + t.errors.join(' | ') : ''));
await t.ctx.close();

// ----- on a phone -----
for (const [w, h] of [[844, 390], [390, 844]]) {
  console.log(`On a phone ${w}x${h}`);
  const ph = await open({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  errs.push(ph);
  await ph.page.evaluate(() => PBW.setLearnMode('off'));
  await ph.page.tap('#play');
  await ph.page.evaluate(HELPERS);
  await ph.page.evaluate(() => { H.fresh(); const me = PBW.me; me.blocks = 4; me.pitch = -0.45; for (const k of ['wall', 'heal']) PBW.givePowerup(me, k); PBW.step(1 / 60); });
  await ph.page.waitForTimeout(500);
  await ph.page.screenshot({ path: `${SHOTS}/blocks-3-phone-${w}x${h}.png` });
  const boxes = await ph.page.evaluate(() => [...document.querySelectorAll('#tFire, #tJump, #tReload, #tBlock, #tDuck, #slots .slot, #health, #ammo')].map((e) => {
    const r = e.getBoundingClientRect(); return { id: e.id || e.className, l: r.left, t: r.top, r: r.right, b: r.bottom };
  }));
  const overlap = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b) overlap.push(`${a.id}/${b.id}`);
  }
  check(!overlap.length, 'the 🧱 and DUCK buttons fit without covering other controls' + (overlap.length ? ': ' + overlap.join(', ') : ''));
  const cdp = await ph.ctx.newCDPSession(ph.page);
  const tap = async (sel) => { const b = await ph.page.locator(sel).boundingBox(); const p = [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 0 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: p }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
  await tap('#tBlock');
  const placed = await ph.page.evaluate(() => [PBW.blocks.length, PBW.me.blocks]);
  check(placed[0] === 1 && placed[1] === 3, `tapping 🧱 builds a block (${placed[1]} left)`);
  await tap('#tDuck');
  const ducked = await ph.page.evaluate(() => { PBW.step(1 / 60); return PBW.me.crouch; });
  await tap('#tDuck');
  const stood = await ph.page.evaluate(() => { PBW.step(1 / 60); return !PBW.me.crouch; });
  check(ducked && stood, 'DUCK switches ducking on and off');
  await ph.ctx.close();
}

// ----- with friends -----
console.log('Blocks with friends');
const ctx = await newContext({ viewport: { width: 900, height: 560 } });
const A = await open({ context: ctx, query: 'fakenet' }), B = await open({ context: ctx, query: 'fakenet' });
errs.push(A, B);
for (const x of [A, B]) await x.page.evaluate(() => PBW.setLearnMode('off'));
await A.page.evaluate(() => window.fakenet.reset());
await A.page.fill('#name', 'Dad'); await B.page.fill('#name', 'Jesse');
await A.page.click('#hostBtn');
await A.page.waitForFunction(() => PBW.net.code, null, T);
await B.page.fill('#code', await A.page.evaluate(() => PBW.net.code));
await B.page.click('#joinBtn');
await A.page.waitForFunction(() => PBW.net.lobby.people.length === 2, null, T);
await A.page.click('#lStart');
await B.page.waitForFunction(() => PBW.state === 'play' && PBW.me && PBW.me.alive, null, T);
await A.page.evaluate(() => { for (const b of PBW.bots) { b.alive = false; b.respawn = 1e9; } PBW.byId('p2').blocks = 3; });
await B.page.waitForFunction(() => PBW.me.blocks === 3, null, T);
await B.page.evaluate(() => { PBW.me.pitch = -0.5; });
await B.page.waitForTimeout(300);
await B.page.keyboard.press('KeyF');
await A.page.waitForFunction(() => PBW.blocks.length === 1 && PBW.blocks[0].owner.id === 'p2', null, T);
await B.page.waitForFunction(() => PBW.blocks.length === 1 && PBW.me.blocks === 2, null, T);
check(true, "a friend's block goes up on the host's game and their own (the host checks it)");
await A.page.evaluate(() => { const b = PBW.blocks[0]; for (let k = 0; k < 4; k++) { PBW.fireBall(PBW.me, b.i + 0.5, 0.5, b.j + 2.5, 0, 0.02, -1); for (let s = 0; s < 20; s++) PBW.step(1 / 60); } });
await B.page.waitForFunction(() => PBW.blocks.length === 0, null, T);
check(true, 'when it breaks on the host, it breaks for the friend too');
await B.page.keyboard.down('KeyC');
await A.page.waitForFunction(() => PBW.byId('p2').crouch, null, T);
await B.page.keyboard.up('KeyC');
await A.page.waitForFunction(() => !PBW.byId('p2').crouch, null, T);
check(true, "a friend ducking ducks on everyone's screen (and their smaller target counts on the host)");

for (const x of errs) check(x.errors.length === 0, 'no console errors' + (x.errors.length ? ': ' + x.errors.slice(0, 3).join(' | ') : ''));
await finish();
