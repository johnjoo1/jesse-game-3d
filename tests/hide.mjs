// Hiding in trees: a bot that can't see you shouldn't know exactly where you are.
// Run:  node tests/hide.mjs     (see tests/lib.mjs)
import { SHOTS, check, open, finish } from './lib.mjs';

const t = await open({ viewport: { width: 1000, height: 620 } });
await t.page.evaluate(() => PBW.setLearnMode('off'));
await t.page.click('#play');
const r = await t.page.evaluate(() => {
  const me = PBW.me, [b, ...rest] = PBW.bots;
  for (const o of rest) { o.alive = false; o.respawn = 1e9; }
  const trees = PBW.hideZones.filter((h) => h.kind === 'tree');
  // a tree with open ground 12 m away, where the bot can see someone standing just outside it
  let tree = null, spot = null;
  for (const h of trees) {
    for (let k = 0; k < 24 && !spot; k++) {
      const a = (k / 24) * Math.PI * 2, sx = h.x + Math.cos(a) * 12, sz = h.z + Math.sin(a) * 12;
      if (Math.abs(sx) > 45 || Math.abs(sz) > 45 || PBW.heightAt(sx, sz, 0.6) > 0) continue;
      Object.assign(b, { x: sx, z: sz, y: 0 });
      me.y = 0;
      const ex = h.x + Math.cos(a) * (h.r + 0.8), ez = h.z + Math.sin(a) * (h.r + 0.8);
      Object.assign(me, { x: ex, z: ez });
      if (!PBW.concealed(me) && PBW.canSee(b, me)) spot = { sx, sz, ex, ez, a };
    }
    if (spot) { tree = h; break; }
  }
  if (!spot) return null;
  const shotsBy = () => PBW.balls.filter((x) => x.owner === b).length;
  const reset = (yaw) => {
    Object.assign(b, { x: spot.sx, z: spot.sz, y: 0, vx: 0, vz: 0, hp: 99, maxHp: 99, alive: true, shield: 0, target: null, lastSeen: -99, mode: 'wander', goal: { x: spot.sx, z: spot.sz }, goalT: 99, cover: null, ammo: 99, magSize: 99 });
    b.yaw = yaw;
    Object.assign(me, { alive: true, shield: 0, hp: 99, maxHp: 99, vx: 0, vz: 0, y: 0 });
    PBW.input.fire = false;
  };
  const out = {};
  // 1. you paint a bot from inside the tree: it shouldn't fire straight back
  let fired = 0;
  for (let n = 0; n < 6; n++) {
    reset(Math.atan2(spot.sx - tree.x, spot.sz - tree.z) + (n % 2 ? Math.PI : 0)); // facing you, or away
    Object.assign(me, { x: tree.x - Math.sin(spot.a) * 1.1, z: tree.z + Math.cos(spot.a) * 1.1 }); // in the leaves, beside the trunk
    PBW.hit(b, me, b.x, 1, b.z);
    for (let i = 0; i < 90; i++) { const before = shotsBy(); PBW.step(1 / 60); fired += Math.max(0, shotsBy() - before); }
  }
  out.fired = fired; out.hiddenCheck = PBW.concealed(me);
  // 2. seen going into the tree, then sneaking off to another tree: it doesn't follow the real you
  reset(Math.atan2(spot.sx - tree.x, spot.sz - tree.z));
  Object.assign(me, { x: spot.ex, z: spot.ez });
  for (let i = 0; i < 40 && b.target !== me; i++) PBW.step(1 / 60);
  out.saw = b.target === me;
  const other = trees.find((h) => h !== tree && Math.hypot(h.x - b.x, h.z - b.z) > 10 && Math.hypot(h.x - b.x, h.z - b.z) < 30 &&
    Math.abs(Math.atan2(h.x - b.x, h.z - b.z) - Math.atan2(tree.x - b.x, tree.z - b.z)) > 1);
  Object.assign(me, { x: other.x + 1.1, z: other.z, y: 0 });
  const ang = (x, z) => { const want = Math.atan2(-(x - b.x), -(z - b.z)); return Math.abs(Math.atan2(Math.sin(b.yaw - want), Math.cos(b.yaw - want))); };
  for (let i = 0; i < 90; i++) PBW.step(1 / 60);
  out.hid2 = PBW.concealed(me) && !PBW.canSee(b, me);
  out.offOld = ang(spot.ex, spot.ez); out.offNew = ang(other.x, other.z);
  return out;
});
check(!!r, 'found a tree with open ground around it');
check(r.hiddenCheck && r.fired === 0, `paint a bot from inside a tree: it can't see you to shoot back (${r.fired} shots back in 6 tries)`);
check(r.saw && r.hid2 && r.offOld < r.offNew && r.offNew > 0.5, `slip into a tree and sneak to another: the bot keeps looking where you went in (${r.offOld.toFixed(2)} rad off it, ${r.offNew.toFixed(2)} rad off the real you)`);
check(t.errors.length === 0, 'no console errors' + (t.errors.length ? ': ' + t.errors.join(' | ') : ''));
await finish();
