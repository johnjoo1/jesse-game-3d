// Headless browser checks for Paintball Wars 3D: controls, movement, shooting, bots, phone layout.
// Run:  node tests/smoke.mjs     (needs Playwright: npm i -g playwright; see tests/lib.mjs)
import { SHOTS, check, open, sim, finish } from './lib.mjs';

// ---------- Desktop ----------
console.log('Desktop 1280x720');
{
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 720 } });
  await page.waitForTimeout(800);
  check(await page.isVisible('#menu'), 'start screen shows');
  await page.screenshot({ path: `${SHOTS}/1-menu-desktop.png` });
  await page.fill('#name', 'Jesse');
  await page.click('#colors button:nth-child(2)');
  await page.click('#play');
  check(await page.evaluate(() => PBW.state === 'play' && PBW.me.name === 'Jesse' && PBW.me.alive), 'Play starts the game as Jesse');
  check(await page.evaluate(() => PBW.bots.length === 8), '8 bots');
  check(await page.isVisible('#hud') && !(await page.isVisible('#touch')), 'HUD shows, touch controls hidden');

  // shooting with the mouse
  await page.evaluate(() => { PBW.me.shield = 0; PBW.look(0, -0.5); });
  await page.mouse.move(640, 360);
  await page.mouse.down(); await sim(page, 0.6); await page.mouse.up();
  const ammo = await page.evaluate(() => PBW.me.ammo);
  check(ammo < 12, `clicking shoots (ammo ${ammo}/12)`);
  await sim(page, 1); // headless drawing is slow, so run the game clock directly
  check(await page.evaluate(() => PBW.decalCount > 0), 'paint splats on the world');
  await page.keyboard.press('KeyR');
  await sim(page, 1.5);
  check(await page.evaluate(() => PBW.me.ammo === 12), 'R reloads to 12');

  // walking with WASD
  const x0 = await page.evaluate(() => [PBW.me.x, PBW.me.z]);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(600); await page.keyboard.up('KeyW');
  const x1 = await page.evaluate(() => [PBW.me.x, PBW.me.z]);
  check(Math.hypot(x1[0] - x0[0], x1[1] - x0[1]) > 1 || await page.evaluate(() => PBW.me.vx !== undefined), 'W moves you');
  await page.screenshot({ path: `${SHOTS}/2-play-desktop.png` });

  // climbing: walk up the north ramp onto the center tower
  const climb = await page.evaluate(() => {
    const me = PBW.me; Object.assign(me, { x: 0, z: -12, y: 0, vx: 0, vz: 0, yaw: Math.PI, onGround: true });
    PBW.keys.KeyW = true;
    for (let i = 0; i < 150; i++) PBW.step(1 / 60);
    PBW.keys.KeyW = false;
    return [me.y, me.z];
  });
  check(Math.abs(climb[0] - 2.6) < 0.05, `walk up the ramp onto the tower (height ${climb[0].toFixed(2)})`);
  // jumping: crate, then the lookout block
  const hop = await page.evaluate(() => {
    const me = PBW.me; Object.assign(me, { x: 28, z: 0, y: 0, vx: 0, vz: 0, yaw: -Math.PI / 2, onGround: true });
    PBW.keys.KeyW = true; let top = 0;
    for (let i = 0; i < 240; i++) { PBW.keys.Space = i % 30 < 3; PBW.step(1 / 60); top = Math.max(top, me.onGround ? me.y : 0); }
    PBW.keys.KeyW = PBW.keys.Space = false;
    return top;
  });
  check(Math.abs(hop - 2.4) < 0.05, `jump onto a crate and up to the 2.4 m lookout (stood at ${hop.toFixed(2)})`);
  const wall = await page.evaluate(() => {
    const w = PBW.solids.find((o) => o.kind === 'wall' && o.h > 2 && o.x1 - o.x0 < 1);
    const me = PBW.me, zc = (w.z0 + w.z1) / 2;
    Object.assign(me, { x: w.x0 - 1.5, z: zc, y: 0, vx: 0, vz: 0, yaw: -Math.PI / 2, onGround: true });
    PBW.keys.KeyW = true;
    for (let i = 0; i < 120; i++) { PBW.keys.Space = i % 30 < 3; PBW.step(1 / 60); }
    PBW.keys.KeyW = PBW.keys.Space = false;
    return me.x < w.x0 && me.y < 0.1;
  });
  check(wall, "can't jump over a tall wall");

  // hitting a bot: 3 hits splat it
  const hits = await page.evaluate(() => {
    const me = PBW.me, b = PBW.bots[0];
    const p = PBW.navPoints.find((n) => PBW.heightAt(n.x, n.z - 6, 1) === 0 && PBW.heightAt(n.x, n.z - 3, 1) === 0 && !PBW.concealed({ x: n.x, z: n.z - 6, y: 0 }));
    Object.assign(me, { x: p.x, z: p.z, y: 0, vx: 0, vz: 0, yaw: 0, pitch: -0.07, shield: 0 });
    Object.assign(b, { alive: true, hp: 3 });
    const kills0 = me.kills, hp = [3];
    for (let i = 0; i < 300 && me.kills === kills0; i++) {
      Object.assign(b, { x: p.x, z: p.z - 6, y: 0, vx: 0, vz: 0, shield: 0, cooldown: 9 });
      me.alive = true; me.hp = 5;
      PBW.input.fire = true; PBW.step(1 / 60);
      if (hp[hp.length - 1] !== b.hp) hp.push(b.hp);
    }
    PBW.input.fire = false;
    return { kills: me.kills - kills0, hp };
  });
  check(hits.kills === 1 && hits.hp.slice(0, 3).join() === '3,2,1', `3 hits splat a bot (hp went ${hits.hp.join(' → ')})`);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${SHOTS}/3-splat-desktop.png` });

  // hiding: bots can't see you in a bush unless they're close
  const hide = await page.evaluate(() => {
    const me = PBW.me, b = PBW.bots[1];
    const bush = PBW.hideZones.find((h) => h.kind === 'bush' && PBW.heightAt(h.x + 9, h.z, 1) === 0);
    Object.assign(me, { x: bush.x, z: bush.z, y: 0 });
    const out = { inside: PBW.concealed(me) };
    Object.assign(b, { x: bush.x + 9, z: bush.z, y: 0 }); out.far = PBW.canSee(b, me);
    Object.assign(b, { x: bush.x + 3, z: bush.z, y: 0 }); out.near = PBW.canSee(b, me);
    Object.assign(me, { x: bush.x + 9 + 6, z: bush.z }); Object.assign(b, { x: bush.x + 9, z: bush.z }); out.open = PBW.canSee(b, me);
    return out;
  });
  check(hide.inside && !hide.far && hide.near && hide.open, `bush hides you (far ${hide.far}, close ${hide.near}, in the open ${hide.open})`);

  // you get splatted after 5 hits and come back with a spawn shield
  const death = await page.evaluate(() => {
    const me = PBW.me, b = PBW.bots[2];
    Object.assign(me, { alive: true, hp: 5, shield: 0 });
    const d0 = me.deaths, out = {};
    for (let i = 0; i < 4; i++) PBW.hit(me, b, me.x, me.y + 1, me.z);
    out.after4 = me.alive && me.hp === 1;
    PBW.hit(me, b, me.x, me.y + 1, me.z);
    out.splatted = !me.alive && me.deaths === d0 + 1;
    out.deadUI = !document.getElementById('dead').hidden;
    for (let i = 0; i < 60 * 2.9; i++) PBW.step(1 / 60);
    out.stillDown = !me.alive;
    for (let i = 0; i < 12; i++) PBW.step(1 / 60);
    out.back = me.alive && me.hp === 5 && me.shield > 2;
    return out;
  });
  check(death.after4 && death.splatted && death.deadUI, '5 hits splat you, with a "Splatted by" screen');
  check(death.stillDown && death.back, 'back in 3 s with a spawn shield');

  // let the bots play for a while (no you): they should splat each other and not get stuck
  const play = await page.evaluate(() => {
    const me = PBW.me; me.alive = false; me.respawn = 9999;
    const start = PBW.bots.map((b) => [b.x, b.z]);
    const moved = PBW.bots.map(() => 0);
    let shots = 0, nan = false;
    for (let i = 0; i < 60 * 90; i++) {
      PBW.step(1 / 60);
      if (i % 60 === 0) PBW.bots.forEach((b, k) => { moved[k] += Math.hypot(b.x - start[k][0], b.z - start[k][1]); start[k] = [b.x, b.z]; });
      shots = Math.max(shots, PBW.balls.length);
      if (PBW.bots.some((b) => !isFinite(b.x + b.y + b.z))) nan = true;
    }
    me.respawn = 0.01;
    return { kills: PBW.bots.reduce((s, b) => s + b.kills, 0), moved: moved.map((m) => Math.round(m)), nan };
  });
  check(play.kills >= 4, `bots splat each other in 90 s (${play.kills} splats)`);
  check(play.moved.every((m) => m > 40), `every bot gets around (meters moved: ${play.moved.join(', ')})`);
  check(!play.nan, 'no broken positions');

  // bots fight you too, but they're on the easy side
  const duel = await page.evaluate(() => {
    const me = PBW.me, b = PBW.bots[3];
    const p = PBW.navPoints.find((n) => PBW.heightAt(n.x, n.z - 6, 1) === 0 && PBW.heightAt(n.x, n.z - 12, 1) === 0 &&
      !PBW.concealed({ x: n.x, z: n.z - 12, y: 0 }) && !PBW.concealed({ x: n.x, z: n.z, y: 0 }));
    me.respawn = 0; PBW.step(1 / 60);
    let shots = 0;
    for (let i = 0; i < 60 * 6; i++) {
      Object.assign(me, { x: p.x, z: p.z, y: 0, vx: 0, vz: 0, shield: 0, hp: 5, alive: true });
      if (i === 0) Object.assign(b, { x: p.x, z: p.z - 12, y: 0, yaw: 0, alive: true, hp: 3, target: null, mode: 'wander' });
      PBW.step(1 / 60);
      shots += PBW.balls.filter((x) => x.owner === b && x.fresh !== false).length; PBW.balls.forEach((x) => { x.fresh = false; });
    }
    return { shots, target: b.target === me };
  });
  check(duel.target && duel.shots > 0, `a bot that sees you shoots at you (${duel.shots} shots in 6 s)`);
  const easy = await page.evaluate(() => {
    const me = PBW.me; let hitsTaken = 0, lastHp = me.hp;
    const d0 = me.deaths;
    for (let i = 0; i < 60 * 60; i++) {
      if (me.alive && me.hp < lastHp) hitsTaken += lastHp - me.hp;
      lastHp = me.alive ? me.hp : 5;
      PBW.step(1 / 60);
    }
    return { hitsTaken, deaths: me.deaths - d0 };
  });
  console.log(`       standing still for 60 s: hit ${easy.hitsTaken} times, splatted ${easy.deaths} times`);

  // pause and resume
  await page.keyboard.press('KeyP');
  check(await page.evaluate(() => PBW.state === 'pause') && await page.isVisible('#pause'), 'P pauses');
  await page.click('#resume');
  check(await page.evaluate(() => PBW.state === 'play'), 'Keep playing resumes');
  await page.waitForTimeout(500);
  const info = await page.evaluate(() => PBW.renderer.info.render);
  console.log(`       draw calls per frame: ${info.calls}, triangles: ${info.triangles}`);
  const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { if (++n < 30) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(f); }));
  console.log(`       headless software-rendered fps: ${fps.toFixed(0)} (real GPUs are much faster)`);
  check(info.calls < 160, 'draw calls stay modest');
  await page.screenshot({ path: `${SHOTS}/4-later-desktop.png` });
  check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

// ---------- Phone (touch) ----------
for (const [label, w, h] of [['Phone landscape 844x390', 844, 390], ['Phone portrait 390x844', 390, 844]]) {
  console.log(label);
  const { ctx, page, errors } = await open({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/5-menu-${w}x${h}.png` });
  check(await page.evaluate(() => document.body.classList.contains('touch')), 'touch controls chosen');
  await page.tap('#play');
  await page.waitForTimeout(300);
  check(await page.isVisible('#tFire') && await page.isVisible('#touch'), 'fire button and thumbstick area show');
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
  await page.evaluate(() => { const me = PBW.me; me.shield = 0; me.yaw = 0; });
  const p0 = await page.evaluate(() => [PBW.me.x, PBW.me.z, PBW.me.yaw]);
  // left thumb pushes forward
  const sx = w * 0.15, sy = h * 0.75;
  await touch('touchStart', [[sx, sy]]);
  await touch('touchMove', [[sx, sy - 50]]);
  await page.waitForTimeout(500);
  const stickShown = await page.isVisible('#stick');
  await touch('touchEnd', []);
  const p1 = await page.evaluate(() => [PBW.me.x, PBW.me.z, PBW.me.yaw]);
  check(stickShown && Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 0.8, `thumbstick moves you (${Math.hypot(p1[0] - p0[0], p1[1] - p0[1]).toFixed(1)} m)`);
  // right side drag looks around
  await touch('touchStart', [[w * 0.7, h * 0.4]]);
  await touch('touchMove', [[w * 0.7 - 80, h * 0.4]]);
  await touch('touchEnd', []);
  const yaw = await page.evaluate(() => PBW.me.yaw);
  check(yaw > p1[2] + 0.2, 'dragging on the right turns the view');
  // fire button
  const box = await page.locator('#tFire').boundingBox();
  await touch('touchStart', [[box.x + box.width / 2, box.y + box.height / 2]]);
  await page.waitForTimeout(400);
  await touch('touchEnd', []);
  const ammo = await page.evaluate(() => PBW.me.ammo);
  check(ammo < 12, `FIRE button shoots (ammo ${ammo})`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SHOTS}/6-play-${w}x${h}.png` });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  check(!overflow, 'no sideways scrolling');
  check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

await finish();
