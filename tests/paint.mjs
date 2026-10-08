// Paint should stay on things: after the bots paint the arena for a while, look at the rim of every splat
// and check it rests on a surface (not hanging off an edge into the air).
// Run:  node tests/paint.mjs     (see tests/lib.mjs)
import { SHOTS, check, open, finish } from './lib.mjs';

const t = await open({ viewport: { width: 1000, height: 620 } });
await t.page.evaluate(() => PBW.setLearnMode('off'));
await t.page.click('#play');
const result = await t.page.evaluate(() => {
  const me = PBW.me;
  me.alive = false; me.respawn = 1e9; // just the bots, painting everything
  let worst = [];
  for (let i = 0; i < 60 * 120; i++) PBW.step(1 / 60);
  const out = PBW.paintCheck();
  me.respawn = 0;
  return out;
});
console.log(`       ${result.total} splats; floating: ${result.floating} (${result.kinds})`);
check(result.total > 150, `the bots painted plenty (${result.total} splats)`);
check(result.floating <= 2, `paint stays on things: ${result.floating} of ${result.total} splats hang over an edge`);
// a close look at a painted rock
await t.page.evaluate(() => {
  const r = PBW.solids.find((o) => o.ell && o.ell.ry > 1);
  const me = PBW.me, e = r.ell;
  for (let k = 0; k < 14; k++) { const a = k * 0.45; PBW.fireBall(PBW.bots[0], e.cx + Math.cos(a) * 3, 0.4 + (k % 4) * 0.3, e.cz + Math.sin(a) * 3, -Math.cos(a), 0, -Math.sin(a)); }
  for (let i = 0; i < 40; i++) PBW.step(1 / 60);
  Object.assign(me, { x: e.cx + 3.2, z: e.cz + 0.6, y: 0, yaw: Math.atan2(3.2, 0.6), pitch: -0.25, alive: true, shield: 9 });
});
await t.page.waitForTimeout(500);
await t.page.screenshot({ path: `${SHOTS}/paint-rock.png` });
await t.page.evaluate(() => { const s = PBW.paintCheck(true); if (s) { const me = PBW.me; Object.assign(me, { x: s.x + 2.5, z: s.z + 2.5, y: Math.max(0, s.y - 1), yaw: Math.atan2(2.5, 2.5), pitch: -0.3, alive: true }); } });
await t.page.waitForTimeout(500);
await t.page.screenshot({ path: `${SHOTS}/paint-check.png` });
check(t.errors.length === 0, 'no console errors' + (t.errors.length ? ': ' + t.errors.join(' | ') : ''));
await finish();
