// Milestone 3 checks: hosting, joining, the lobby, teams and bases, team-ups, reconnecting.
// Two tabs of one browser play each other through the BroadcastChannel stand-in for PeerJS (net.js).
// Run:  node tests/multi.mjs     (see tests/lib.mjs)
import { SHOTS, check, open, newContext, finish } from './lib.mjs';

const T = { timeout: 20000 };
const wait = (page, fn, arg, t = T) => page.waitForFunction(fn, arg, t);
const allErrors = [];
async function tab(ctx, name, query = 'fakenet') {
  const t = await open({ context: ctx, query });
  t.name = name;
  allErrors.push(t);
  await t.page.evaluate(() => PBW.setLearnMode('off')); // Brain Boost has its own tests (brain.mjs)
  await t.page.fill('#name', name);
  return t;
}
const ev = (t, fn, arg) => t.page.evaluate(fn, arg);

console.log('Hosting and joining');
const ctx = await newContext({ viewport: { width: 960, height: 600 } });
const A = await tab(ctx, 'Dad');
await ev(A, () => window.fakenet.reset());
const B = await tab(ctx, 'Jesse');
await B.page.click('#colors button:nth-child(4)');

await A.page.click('#hostBtn');
await wait(A.page, () => !document.getElementById('lobby').hidden && PBW.net.code);
const code = await ev(A, () => PBW.net.code);
check(/^[A-Z]{4}$/.test(code), `Host a game opens the lobby with a 4-letter room code (${code})`);

await B.page.fill('#code', code.toLowerCase());
await B.page.click('#joinBtn');
await wait(B.page, () => !document.getElementById('lobby').hidden && PBW.net.lobby && PBW.net.lobby.people.length === 2);
await wait(A.page, () => PBW.net.lobby.people.length === 2);
const names = await ev(A, () => [...document.querySelectorAll('#lPeople .nm')].map((e) => e.textContent).join(', '));
check(/Dad/.test(names) && /Jesse/.test(names), `a friend joins with the code and shows up in the lobby (${names})`);

// host picks 2 teams, 6 players, Jesse on Blue
await A.page.click('#lTeams button[data-teams="2"]');
for (let i = 0; i < 3; i++) await A.page.click('#lMinus');
await A.page.click('#lPeople [data-id="p2"][data-team="1"]');
await wait(B.page, () => { const L = PBW.net.lobby; return L.teams === 2 && L.total === 6 && L.people.find((q) => q.id === 'p2').team === 1; });
const bLobby = await ev(B, () => [document.getElementById('lTotal').textContent, document.querySelector('#lPeople .chip.sel[data-id="p2"]').textContent, document.getElementById('lStart').hidden]);
check(bLobby.join() === '6,Blue,true', `the friend's lobby updates live: 2 teams, 6 players, Jesse on Blue, and only the host can start (${bLobby.join(', ')})`);
await A.page.screenshot({ path: `${SHOTS}/m3-1-lobby-host.png` });
await B.page.setViewportSize({ width: 390, height: 844 });
await B.page.screenshot({ path: `${SHOTS}/m3-2-lobby-phone.png` });
await B.page.setViewportSize({ width: 960, height: 600 });

// ----- a team game -----
console.log('Team game');
await A.page.click('#lStart');
await wait(B.page, () => PBW.state === 'play' && PBW.me && PBW.chars.length === 6 && PBW.me.alive);
const start = await ev(B, () => ({ n: PBW.chars.length, team: PBW.me.team, id: PBW.me.id, base: Math.hypot(PBW.me.x - 40, PBW.me.z), bases: PBW.bases.length,
  teams: [0, 1].map((t) => PBW.chars.filter((c) => c.team === t).length).join('/') }));
check(start.n === 6 && start.teams === '3/3' && start.bases === 2, `Start: 6 players (people + bots), 3 per team, 2 bases (${start.teams})`);
check(start.team === 1 && start.base < 8, `the friend spawns at the Blue base (${start.base.toFixed(1)} m from it)`);
const hostView = await ev(A, () => { const p = PBW.byId('p2'); return p && [p.team, p.color, p.remote].join(); });
check(hostView === '1,#3da5ff,true', `the host sees Jesse on Blue (${hostView})`);

// the friend can see everyone else: the host and the bots are drawn on their screen
await B.page.waitForTimeout(400);
const seen = await ev(B, () => { const o = PBW.chars.filter((c) => c !== PBW.me && c.alive); return [o.filter((c) => c.m.g.visible).length, o.length]; });
check(seen[1] >= 4 && seen[0] === seen[1], `the friend sees the other players and bots (${seen[0]} of ${seen[1]} drawn)`);
await B.page.screenshot({ path: `${SHOTS}/m3-friend-sees.png` });

// moving: the host sees where the friend goes
await B.page.evaluate(() => { // face open ground, so the walk isn't stopped by a wall right in front
  const me = PBW.me;
  for (let k = 0; k < 16; k++) {
    const yaw = (k / 16) * Math.PI * 2, dx = -Math.sin(yaw), dz = -Math.cos(yaw);
    if ([1, 2, 3, 4, 5, 6].every((d) => PBW.heightAt(me.x + dx * d, me.z + dz * d, 0.6) === 0)) { me.yaw = yaw; return; }
  }
});
await A.page.evaluate(() => { for (const b of PBW.bots) { b.alive = false; b.respawn = 1e9; } }); // nobody to splat Jesse mid-walk
await B.page.waitForTimeout(300);
const p0 = await ev(A, () => { const p = PBW.byId('p2'); return [p.x, p.z]; });
const bp0 = await B.page.evaluate(() => [PBW.me.x, PBW.me.z, performance.now(), PBW.renderer.info.render.frame]);
await B.page.keyboard.down('KeyW'); await B.page.waitForTimeout(2500); await B.page.keyboard.up('KeyW');
const bp1 = await B.page.evaluate(() => [PBW.me.x, PBW.me.z, performance.now(), PBW.renderer.info.render.frame]);
console.log('       (friend moved', Math.hypot(bp1[0] - bp0[0], bp1[1] - bp0[1]).toFixed(1), 'm on their screen;', ((bp1[3] - bp0[3]) / ((bp1[2] - bp0[2]) / 1000)).toFixed(1), 'fps)');
await B.page.waitForTimeout(300);
const p1 = await ev(A, () => { const p = PBW.byId('p2'); return [p.x, p.z]; });
check(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 1, `the friend walks and the host sees it (${Math.hypot(p1[0] - p0[0], p1[1] - p0[1]).toFixed(1)} m)`);

// the host moves Jesse to Red and back
await ev(A, () => PBW.setTeam(PBW.byId('p2'), 0, true));
await wait(B.page, () => PBW.me.team === 0 && PBW.me.color === '#ff4d4d' && Math.hypot(PBW.me.x + 40, PBW.me.z) < 8);
check(true, 'the host can move someone to another team mid-game (they respawn at their new base)');
await ev(A, () => PBW.setTeam(PBW.byId('p2'), 1, true));
await wait(B.page, () => PBW.me.team === 1 && Math.hypot(PBW.me.x - 40, PBW.me.z) < 8);

// shooting across: put Dad (Red) in front of Jesse (Blue) on open ground, with the bots out of the way
const lane = await ev(A, () => PBW.navPoints.find((n) => Math.abs(n.x) < 30 && Math.abs(n.z) < 30 &&
  [0, 1, 2, 3, 4, 5, 6, 7].every((k) => PBW.heightAt(n.x, n.z + k, 0.7) === 0 && !PBW.concealed({ x: n.x, z: n.z + k, y: 0 }))));
const L = { x: lane.x, z: lane.z, z2: lane.z + 6 };
await ev(A, (L) => { for (const b of PBW.bots) { b.alive = false; b.respawn = 1e9; } Object.assign(PBW.me, { x: L.x, z: L.z2, y: 0, vx: 0, vz: 0, shield: 0, hp: 5, alive: true }); }, L);
await ev(B, (L) => { Object.assign(PBW.me, { x: L.x, z: L.z, y: 0, vx: 0, vz: 0, yaw: Math.PI, pitch: -0.08 }); }, L);
await B.page.waitForTimeout(400);
await ev(A, () => { PBW.me.shield = 0; });
await ev(B, () => { PBW.input.fire = true; });
await wait(A.page, () => PBW.balls.some((b) => b.owner.id === 'p2'));
check(true, "the friend's paintballs fly on the host's game");
await wait(A.page, (L) => { PBW.me.shield = 0; Object.assign(PBW.me, { x: L.x, z: L.z2 }); return PBW.me.deaths >= 1; }, L, { timeout: 20000 });
await ev(B, () => { PBW.input.fire = false; });
await B.page.waitForTimeout(500);
const feeds = [await ev(A, () => document.getElementById('feed').textContent), await ev(B, () => document.getElementById('feed').textContent)];
check(/Jesse splatted You/.test(feeds[0]) && /You splatted Dad/.test(feeds[1]), `splats count on the host and show in both kill feeds ("${feeds[1].slice(0, 30)}")`);
await B.page.screenshot({ path: `${SHOTS}/m3-3-friend-view.png` });

// capturing: Jesse alone in the Red base, nobody defending
await ev(A, () => { for (const c of PBW.chars) if (c.team === 0 && c !== PBW.me) { c.alive = false; c.respawn = 1e9; } Object.assign(PBW.me, { x: 0, z: 30 }); });
await ev(B, () => { Object.assign(PBW.me, { x: -40, z: 2, y: 0 }); });
// Dad stays out of his base
await wait(A.page, () => { if (PBW.me.alive) Object.assign(PBW.me, { x: 0, z: 30 }); return PBW.bases[0].cap > 0.3 && PBW.bases[0].capTeam === 1; });
await B.page.waitForTimeout(400);
const bar = await ev(B, () => [!document.getElementById('capBar').hidden, document.querySelector('#capBar span').textContent]);
check(bar[0] && /Capturing/.test(bar[1]), `standing in an enemy base fills the capture ring ("${bar[1]}")`);
const barA = await ev(A, () => document.querySelector('#capBar span').textContent);
check(/taking your base/.test(barA), `the defending team gets a warning ("${barA}")`);
await B.page.screenshot({ path: `${SHOTS}/m3-4-capture.png` });
await wait(A.page, () => { if (PBW.me.alive) Object.assign(PBW.me, { x: 0, z: 30 }); return PBW.gameOver != null; }, null, { timeout: 20000 });
await wait(B.page, () => !document.getElementById('gameover').hidden, null, { timeout: 15000 });
const over = await ev(B, () => [document.getElementById('goTitle').textContent, PBW.chars.every((c) => c.team === 1)]);
const overA = await ev(A, () => [document.getElementById('goTitle').textContent, PBW.me.team, !document.getElementById('goLobby').hidden]);
check(/Blue/.test(over[0]) && over[1] && overA[1] === 1, `the captured team joins the winners and the game ends when one team is left ("${over[0].trim()}")`);
check(overA[2], 'the host can take everyone back to the lobby');
await A.page.click('#goLobby');
await wait(B.page, () => PBW.state === 'lobby' && !document.getElementById('lobby').hidden && PBW.net.lobby.people.length === 2);
check(true, 'Back to the lobby brings the friend along');

// ----- a game without set teams: team-ups -----
console.log('Game without set teams');
await A.page.click('#lTeams button[data-teams="0"]');
await A.page.click('#lStart');
await wait(B.page, () => PBW.state === 'play' && PBW.me && PBW.me.alive && PBW.chars.length === 6);
await ev(A, () => { for (const b of PBW.bots) { b.alive = false; b.respawn = 1e9; } });
await B.page.keyboard.press('KeyT');
await wait(B.page, () => !document.getElementById('teamPanel').hidden && document.querySelector('#tpList [data-act="ask"][data-id="p1"]'));
await B.page.click('#tpList [data-act="ask"][data-id="p1"]');
await wait(A.page, () => !document.getElementById('teamAsk').hidden);
const ask = await ev(A, () => document.getElementById('askText').textContent);
check(/Jesse wants to team up/.test(ask), `asking someone to team up gives them a pop-up ("${ask.trim()}")`);
await A.page.keyboard.press('KeyY');
await wait(B.page, () => PBW.allied(PBW.me, PBW.byId('p1')));
check(await ev(A, () => PBW.allied(PBW.me, PBW.byId('p2'))), 'Y accepts: they are a team on both screens');
await B.page.click('#tpClose');
// teammates' paint passes through
await ev(A, (L) => { Object.assign(PBW.me, { x: L.x, z: L.z2, y: 0, shield: 0, hp: 5 }); }, L);
await ev(B, (L) => { Object.assign(PBW.me, { x: L.x, z: L.z, y: 0, yaw: Math.PI, pitch: -0.08 }); PBW.input.fire = true; }, L);
await wait(A.page, () => PBW.balls.filter((b) => b.owner.id === 'p2').length > 2);
await B.page.waitForTimeout(1500);
await ev(B, () => { PBW.input.fire = false; });
const mateHp = await ev(A, () => PBW.me.hp);
check(mateHp === 5, `a teammate's paint can't hurt you (health ${mateHp}/5)`);
// leaving takes 3 seconds
await B.page.keyboard.press('KeyT');
await wait(B.page, () => document.querySelector('#tpList [data-act="break"][data-id="p1"]'));
await B.page.click('#tpList [data-act="break"][data-id="p1"]');
await wait(A.page, () => { const al = Object.values(PBW.alliances)[0]; return al && al.breakT > 0; });
const t0 = Date.now();
await wait(A.page, () => !PBW.allied(PBW.me, PBW.byId('p2')));
const took = (Date.now() - t0) / 1000;
check(took > 1.8 && took < 5, `Leave team ends the team after a 3-second warning (${took.toFixed(1)} s)`);
await B.page.click('#tpClose');

// ----- reconnecting -----
console.log('Dropped connections');
await ev(A, () => { PBW.byId('p2').kills = 3; });
await ev(B, () => window.fakenet.drop()); // the friend's wifi blinks
await wait(B.page, () => !document.getElementById('netOverlay').hidden, null, { timeout: 5000 }).catch(() => {});
await wait(B.page, () => document.getElementById('netOverlay').hidden && PBW.mode === 'client' && performance.now() - 0 > 0 && PBW.me && PBW.me.kills === 3);
const sameB = await ev(B, () => [PBW.me.id, PBW.chars.length].join());
check(sameB === 'p2,6', `after a dropped connection the friend reconnects by themselves as the same player, score kept (${sameB})`);

// the friend's tab closes: the host saves their spot, and they come back with the same name
await B.page.close();
await wait(A.page, () => { const p = PBW.byId('p2'); return p && p.awayUntil > 0; });
const lost = await ev(A, () => document.getElementById('feed').textContent);
check(/Jesse lost connection/.test(lost), 'a closed tab: the host keeps the player for 90 seconds ("…lost connection, saving their spot…")');
const C = await tab(ctx, 'Jesse');
await C.page.fill('#code', code);
await C.page.click('#joinBtn');
await wait(C.page, () => PBW.state === 'play' && PBW.me && PBW.me.alive);
const back = await ev(C, () => [PBW.me.id, PBW.me.kills].join());
check(back === 'p2,3', `opening the game again and joining the same room brings them back as themselves (${back})`);
const backNote = await ev(A, () => document.getElementById('feed').textContent);
check(/Jesse is back/.test(backNote), 'the host sees "Jesse is back"');

// a new friend mid-game takes a bot's spot
const D = await tab(ctx, 'Mia');
await D.page.fill('#code', code);
await D.page.click('#joinBtn');
await wait(D.page, () => PBW.state === 'play' && PBW.me && PBW.me.alive);
const mid = await ev(A, () => [PBW.chars.length, PBW.chars.filter((c) => !c.isBot).length].join('/'));
check(mid === '6/3', `a friend who joins mid-game takes a bot's spot (players/people: ${mid})`);
// someone away for more than 90 seconds is replaced by a bot
await D.page.close();
await wait(A.page, () => { const p = PBW.chars.find((c) => c.name === 'Mia'); return p && p.awayUntil > 0; });
await ev(A, () => { PBW.chars.find((c) => c.name === 'Mia').awayUntil = 1e-6; });
await wait(A.page, () => !PBW.chars.some((c) => c.name === 'Mia') && PBW.chars.length === 6);
check(true, 'after 90 seconds away, their spot goes to a bot');
// leaving on purpose
await C.page.click('#pauseBtn').catch(() => {});
await ev(C, () => PBW.net.leave());
await wait(A.page, () => !PBW.chars.some((c) => c.id === 'p2') && PBW.chars.length === 6);
check(await ev(C, () => PBW.state === 'menu' && PBW.mode === 'solo'), 'Leave game takes a friend back to the start screen and a bot fills their spot');
// the host leaving ends it for everyone
const E = await tab(ctx, 'Sam');
await E.page.fill('#code', code);
await E.page.click('#joinBtn');
await wait(E.page, () => PBW.state === 'play' && PBW.me);
await ev(A, () => PBW.net.leave());
await wait(E.page, () => PBW.state === 'menu' && /host ended/.test(document.getElementById('netmsg').textContent));
check(true, 'when the host leaves, friends go back to the start screen ("The host ended the game.")');

// ----- slow mode: a room code stays reserved for a minute after its tab closes -----
console.log('Slow matchmaking (?fakenet=slow)');
const ctx2 = await newContext({ viewport: { width: 800, height: 500 } });
const S1 = await tab(ctx2, 'Host1', 'fakenet=slow');
await ev(S1, () => window.fakenet.reset());
await ev(S1, () => PBW.net.host('ZZZZ'));
await wait(S1.page, () => PBW.net.code === 'ZZZZ');
await S1.page.close();
const S2 = await tab(ctx2, 'Host2', 'fakenet=slow');
await ev(S2, () => PBW.net.host('ZZZZ'));
await wait(S2.page, () => PBW.net.code);
const c2 = await ev(S2, () => PBW.net.code);
check(c2 !== 'ZZZZ' && /^[A-Z]{4}$/.test(c2), `a code still reserved after its host closed: hosting picks a fresh one (${c2})`);
const S3 = await tab(ctx2, 'Kid', 'fakenet=slow');
await S3.page.fill('#code', 'ZZZZ');
await S3.page.click('#joinBtn');
await wait(S3.page, () => /No game found/.test(document.getElementById('netmsg').textContent), null, { timeout: 25000 });
check(true, 'joining a code whose host is gone says "No game found…" instead of hanging');

for (const t of allErrors) check(t.errors.length === 0, `no console errors (${t.name})` + (t.errors.length ? ': ' + t.errors.slice(0, 3).join(' | ') : ''));
await finish();
