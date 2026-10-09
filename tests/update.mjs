// Milestone 4 checks, part 2: "Update ready" saves the game, reloads with the new version and puts it all back.
// The test server hands out a slightly different game.js after bump(), like a new version going online.
// Run:  node tests/update.mjs     (see tests/lib.mjs)
import { check, open, newContext, finish, bump } from './lib.mjs';

const T = { timeout: 30000 };
const all = [];
const tab = async (ctx, name, query) => { const t = await open({ context: ctx, query }); t.name = name; all.push(t); await t.page.fill('#name', name); return t; };
const ready = (t) => t.page.waitForFunction(() => PBW.update.version, null, T);
// after a reload the page is new: wait for the game to be back
const reloaded = (t, cond) => t.page.waitForFunction(cond || (() => window.PBW && PBW.state === 'play' && PBW.me), null, T);

// ----- solo -----
console.log('Updating a solo game');
{
  const ctx = await newContext({ viewport: { width: 900, height: 560 } });
  const t = await tab(ctx, 'Jesse');
  await t.page.evaluate(() => PBW.setLearnMode('off'));
  await t.page.click('#play');
  await ready(t);
  check(await t.page.isHidden('#update'), 'no update button while nothing changed');
  const before = await t.page.evaluate(() => {
    const me = PBW.me;
    me.kills = 4; me.deaths = 2;
    PBW.givePowerup(me, 'rapid'); PBW.givePowerup(me, 'turret'); PBW.givePowerup(me, 'wall');
    for (const b of PBW.bots) { b.alive = false; b.respawn = 1e9; }
    me.shield = 0; me.yaw = 0; me.pitch = -0.4; PBW.input.fire = true;
    for (let i = 0; i < 30; i++) PBW.step(1 / 60);
    PBW.input.fire = false;
    for (let i = 0; i < 60; i++) PBW.step(1 / 60);
    PBW.placeItem(me, 1); // the barricade
    PBW.spawnDrop(me.x + 4, 0, me.z + 4, 'golden');
    me.blocks = 5; PBW.placeBlock(me, Math.floor(me.x) + 2, Math.floor(me.z) + 2); PBW.placeBlock(me, Math.floor(me.x) + 2, Math.floor(me.z) + 2);
    return { blocks: PBW.blocks.map((b) => [b.i, b.j, b.y0].join(':')).join(), carried: me.blocks, x: me.x, z: me.z, kills: me.kills, paint: PBW.decalCount, deploys: PBW.deploys.map((d) => d.type).join(), drops: PBW.drops.length, items: me.items.join(), bots: PBW.bots.map((b) => b.name).join() };
  });
  bump();
  const found = await t.page.evaluate(() => PBW.update.check());
  await t.page.waitForTimeout(300);
  const label = await t.page.evaluate(() => !document.getElementById('update').hidden && document.getElementById('update').textContent);
  check(found && /your game is saved/.test(label), `a new version online: the "Update ready" button appears ("${label}")`);
  await Promise.all([t.page.waitForNavigation(), t.page.click('#update')]);
  check(/[?&]fresh=/.test(t.page.url()), 'it reloads past any cached copy (?fresh=…)');
  await reloaded(t);
  const after = await t.page.evaluate(() => {
    const me = PBW.me;
    return { blocks: PBW.blocks.map((b) => [b.i, b.j, b.y0].join(':')).join(), carried: me.blocks, x: me.x, z: me.z, kills: me.kills, paint: PBW.decalCount, deploys: PBW.deploys.map((d) => d.type).join(), drops: PBW.drops.length, items: me.items.join(),
      rapid: !!me.buffs.rapid, bots: PBW.bots.map((b) => b.name).join(), note: document.getElementById('feed').textContent };
  });
  check(Math.hypot(after.x - before.x, after.z - before.z) < 0.5 && after.kills === 4, `you're back where you were with your score (${after.kills} splats)`);
  check(after.rapid && after.items === before.items, `boosts and carried defenses come back (${after.items})`);
  check(after.deploys === before.deploys && after.drops === before.drops && after.bots === before.bots, `placed defenses, drops and the same bots come back (${after.deploys})`);
  check(after.blocks === before.blocks && after.carried === 3 && before.blocks.split(',').length === 2, `your blocks stay built, and you keep the ones you carry (${after.carried} 🧱)`);
  check(after.paint === before.paint && after.paint > 0, `the paint stays where it was (${after.paint} splats)`);
  check(/Updated/.test(after.note), 'a note says "Updated! Your game was saved."');
  check(await t.page.evaluate(() => PBW.update.ready === false && document.getElementById('update').hidden), 'and the button is gone (this is the newest version)');
  await ctx.close();
}

// ----- hosting: the update takes friends along. Slow mode: the old room code stays reserved for a minute -----
console.log('Updating a hosted game (slow matchmaking)');
{
  const ctx = await newContext({ viewport: { width: 900, height: 560 } });
  const A = await tab(ctx, 'Dad', 'fakenet=slow'), B = await tab(ctx, 'Jesse', 'fakenet=slow');
  await A.page.evaluate(() => { window.fakenet.reset(); PBW.setLearnMode('off'); });
  await B.page.evaluate(() => PBW.setLearnMode('off'));
  await A.page.click('#hostBtn');
  await A.page.waitForFunction(() => PBW.net.code, null, T);
  const code = await A.page.evaluate(() => PBW.net.code);
  await B.page.fill('#code', code);
  await B.page.click('#joinBtn');
  await A.page.waitForFunction(() => PBW.net.lobby.people.length === 2, null, T);
  await A.page.click('#lTeams button[data-teams="2"]');
  await A.page.click('#lPeople [data-id="p2"][data-team="1"]');
  await A.page.click('#lStart');
  await B.page.waitForFunction(() => PBW.state === 'play' && PBW.me && PBW.me.alive, null, T);
  await ready(A); await ready(B);
  // (bots parked, so nobody splats Jesse and her boost stays)
  await A.page.evaluate(() => { for (const b of PBW.bots) { b.alive = false; b.respawn = 1e9; } const p = PBW.byId('p2'); p.kills = 5; PBW.givePowerup(p, 'speed'); PBW.me.kills = 2; });
  await B.page.waitForFunction(() => PBW.me.kills === 5, null, T);
  bump();
  await A.page.evaluate(() => PBW.update.check()); await B.page.evaluate(() => PBW.update.check());
  await A.page.waitForTimeout(300);
  const labels = [await A.page.evaluate(() => document.getElementById('update').textContent),
    await B.page.evaluate(() => [document.getElementById('update').textContent, document.getElementById('update').disabled])];
  check(/update everyone/.test(labels[0]), `the host's button updates everyone ("${labels[0]}")`);
  check(labels[1][1] && /host can update/.test(labels[1][0]), `a friend's button says the host can do it ("${labels[1][0]}")`);
  const t0 = Date.now();
  await Promise.all([A.page.waitForNavigation(), B.page.waitForNavigation(), A.page.click('#update')]);
  check(true, "the host's update reloads the friend's game too");
  await reloaded(A);
  await reloaded(B, () => window.PBW && PBW.state === 'play' && PBW.me && PBW.mode === 'client' && document.getElementById('netOverlay').hidden);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const back = await B.page.evaluate(() => [PBW.me.id, PBW.me.kills, PBW.me.team, !!PBW.me.buffs.speed, PBW.chars.length].join());
  check(back === 'p2,5,1,true,' + (await A.page.evaluate(() => PBW.chars.length)), `the friend rejoins as the same player: score, team and boosts kept (${back}; back in ${secs} s)`);
  check(Number(secs) < 25, 'without waiting a minute for the old room code (the host came back at a fresh address)');
  check(await A.page.evaluate((c) => PBW.net.code === c && PBW.me.kills === 2 && PBW.mode === 'host', code), 'the host keeps the same room code and score');
  // someone new joins with the plain code while it's still reserved: they find the host at its fresh address
  const C = await tab(ctx, 'Mia', 'fakenet=slow');
  await C.page.fill('#code', code);
  await C.page.click('#joinBtn');
  await C.page.waitForFunction(() => PBW.state === 'play' && PBW.me && PBW.me.alive, null, T);
  check(await A.page.evaluate(() => PBW.chars.some((c) => c.name === 'Mia' && c.remote)), 'a new friend can still join with the same 4-letter code');
  await ctx.close();
}

// ----- updating from the lobby -----
console.log('Updating from the lobby');
{
  const ctx = await newContext({ viewport: { width: 900, height: 560 } });
  const A = await tab(ctx, 'Dad', 'fakenet'), B = await tab(ctx, 'Jesse', 'fakenet');
  await A.page.evaluate(() => window.fakenet.reset());
  await A.page.click('#hostBtn');
  await A.page.waitForFunction(() => PBW.net.code, null, T);
  const code = await A.page.evaluate(() => PBW.net.code);
  await B.page.fill('#code', code);
  await B.page.click('#joinBtn');
  await A.page.waitForFunction(() => PBW.net.lobby.people.length === 2, null, T);
  await A.page.click('#lTeams button[data-teams="3"]');
  await ready(A);
  bump();
  await A.page.evaluate(() => PBW.update.check());
  await A.page.waitForTimeout(300);
  await Promise.all([A.page.waitForNavigation(), B.page.waitForNavigation(), A.page.click('#update')]);
  await A.page.waitForFunction(() => window.PBW && PBW.state === 'lobby' && PBW.net.lobby && PBW.net.lobby.people.length === 2, null, T);
  const l = await A.page.evaluate(() => [PBW.net.code, PBW.net.lobby.teams].join());
  check(l === code + ',3', `an update in the lobby: the host comes back to the same lobby and the friend rejoins it (${l})`);
  await ctx.close();
}

// ----- a friend whose phone got a newer copy of the game than the host's can still join -----
console.log('Joining with a slightly different version');
{
  const ctx = await newContext({ viewport: { width: 900, height: 560 } });
  const A = await tab(ctx, 'Dad', 'fakenet');
  await A.page.evaluate(() => { window.fakenet.reset(); PBW.setLearnMode('off'); });
  await ready(A);
  bump(); // new files go online after the host loaded the game
  const B = await tab(ctx, 'Jesse', 'fakenet');
  await B.page.evaluate(() => PBW.setLearnMode('off'));
  await ready(B);
  const vs = [await A.page.evaluate(() => PBW.update.version), await B.page.evaluate(() => PBW.update.version)];
  await A.page.click('#hostBtn');
  await A.page.waitForFunction(() => PBW.net.code, null, T);
  await B.page.fill('#code', await A.page.evaluate(() => PBW.net.code));
  await B.page.click('#joinBtn');
  await A.page.waitForFunction(() => PBW.net.lobby.people.length === 2, null, T);
  await A.page.click('#lStart');
  await B.page.waitForFunction(() => PBW.state === 'play' && PBW.me && PBW.me.alive, null, T);
  check(vs[0] !== vs[1], `host and friend have different copies of the files (${vs.join(' / ')}) and the friend still gets in`);
  await ctx.close();
}

for (const t of all) check(t.errors.length === 0, `no console errors (${t.name})` + (t.errors.length ? ': ' + t.errors.slice(0, 3).join(' | ') : ''));
await finish();
