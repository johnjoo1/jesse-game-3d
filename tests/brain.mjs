// Milestone 4 checks, part 1: Brain Boost questions when you're splatted.
// Run:  node tests/brain.mjs     (see tests/lib.mjs)
import { SHOTS, check, open, newContext, finish } from './lib.mjs';

const T = { timeout: 15000 };
const card = (page) => page.waitForFunction(() => !document.getElementById('brain').hidden && PBW.brain.state === 'ask', null, T);
// you, alive and alone (bots parked), then splatted by a bot
const SPLAT = (force) => {
  const me = PBW.me, b = PBW.bots[0];
  for (const x of PBW.bots) { x.alive = false; x.respawn = 1e9; }
  if (!me.alive) { me.respawn = 0; PBW.brain.state = 'off'; PBW.step(1 / 60); }
  me.shield = 0; me.alive = true; me.hp = 1; me.buffs = {}; me.items = []; me.maxHp = 5; me.magSize = 12;
  PBW.brain.force = force || 'normal';
  PBW.hit(me, b, me.x, me.y + 1, me.z, 1);
};

console.log('Brain Boost (desktop 1100x700)');
const ctx = await newContext({ viewport: { width: 1100, height: 700 } });
let t = await open({ context: ctx });
const errs = [t];
// settings, saved on each device
check(await t.page.isVisible('#learnSeg') && await t.page.evaluate(() => PBW.learnMode === 'mix' && PBW.brainAge === 7), 'the start screen has Brain Boost: Off / Math / Spanish / Mix and Age (Mix, age 7 to start)');
await t.page.click('#learnSeg [data-v="math"]');
await t.page.click('#ageSeg [data-v="9"]');
await t.page.reload();
await t.page.waitForFunction(() => window.PBW);
check(await t.page.evaluate(() => PBW.learnMode === 'math' && PBW.brainAge === 9 &&
  document.querySelector('#learnSeg .sel').dataset.v === 'math' && document.querySelector('#ageSeg .sel').dataset.v === '9'), 'the choice is remembered on this device (Math, age 9 after a reload)');

// the question bank
const bank = await t.page.evaluate(() => {
  let bad = 0, n = 0;
  for (const s of ['math', 'spanish']) for (let l = 6; l <= 11; l++) for (let i = 0; i < 150; i++) {
    const q = PBW.BrainBank.makeQuestion(s, l); n++;
    const labels = q.opts.map((o) => o.label + '|' + (o.color || ''));
    if (q.opts.length !== 3 || new Set(labels).size !== 3 || !(q.answer >= 0 && q.answer < 3) || !q.explain) bad++;
  }
  return { bad, n };
});
check(bank.bad === 0, `every question has 3 different answers and one right one (${bank.n} tried)`);

// Off: no questions, back in 3 seconds
await t.page.click('#learnSeg [data-v="off"]');
check(await t.page.isHidden('#ageRow'), 'Off hides the age choice');
await t.page.fill('#name', 'Jesse');
await t.page.click('#play');
await t.page.evaluate(SPLAT);
await t.page.waitForTimeout(400);
const off = await t.page.evaluate(() => { const shown = !document.getElementById('brain').hidden; for (let i = 0; i < 200; i++) PBW.step(1 / 60); return [shown, PBW.me.alive]; });
check(!off[0] && off[1], 'with Brain Boost off, no card: you come back after 3 seconds');

// Math, age 7: a question, and the respawn waits
await t.page.evaluate(() => { PBW.setLearnMode('math'); PBW.setAge(7); });
await t.page.evaluate(SPLAT);
await card(t.page);
const q1 = await t.page.evaluate(() => ({ q: document.getElementById('bQ').textContent, n: document.querySelectorAll('#bOpts button').length, level: PBW.brain.q.level }));
await t.page.screenshot({ path: `${SHOTS}/m4-1-question.png` });
const waits = await t.page.evaluate(() => { for (let i = 0; i < 60 * 8; i++) PBW.step(1 / 60); return !PBW.me.alive; });
check(q1.n === 3 && q1.level === 7, `splatted: a math question at age 7's level ("${q1.q}")`);
check(waits, 'the respawn waits while the question is up (still down after 8 s)');
// right answer: reward screen, then Let's go
await t.page.evaluate(() => document.querySelectorAll('#bOpts button')[PBW.brain.q.answer].click());
await t.page.waitForFunction(() => PBW.brain.state === 'reward' && document.querySelector('#brain .go'), null, T);
const reward = await t.page.evaluate(() => [document.getElementById('bQ').textContent, document.querySelector('#brain .pname').textContent, document.querySelector('#brain .go').textContent]);
await t.page.screenshot({ path: `${SHOTS}/m4-2-reward.png` });
check(/Correct/.test(reward[0]) && /You got/.test(reward[1]) && /Let's go/.test(reward[2]), `right answer: a reward screen shows what you won ("${reward[1]}")`);
await t.page.click('#brain .go');
const back1 = await t.page.evaluate(() => ({ alive: PBW.me.alive, boost: Object.keys(PBW.me.buffs).join() || (PBW.me.maxHp > 5 ? 'heart' : '') }));
check(back1.alive && back1.boost, `"Let's go!" brings you back with the boost (${back1.boost})`);
check(await t.page.isHidden('#brain'), 'and the card goes away');

// wrong answer: see the right one, come back with no prize
await t.page.evaluate(SPLAT);
await card(t.page);
await t.page.evaluate(() => { const q = PBW.brain.q; document.querySelectorAll('#bOpts button')[(q.answer + 1) % 3].click(); });
const wrong = await t.page.evaluate(() => [document.querySelector('#bOpts .right') !== null, document.getElementById('bMsg').textContent, document.querySelector('#brain .go').textContent]);
await t.page.screenshot({ path: `${SHOTS}/m4-3-wrong.png` });
check(wrong[0] && /Almost/.test(wrong[1]), `wrong answer: it shows the right answer ("${wrong[1]}")`);
await t.page.click('#brain .go');
const back2 = await t.page.evaluate(() => [PBW.me.alive, Object.keys(PBW.me.buffs).length, PBW.me.maxHp, PBW.me.kills]);
check(back2[0] && back2[1] === 0 && back2[2] === 5, '"OK, back in!" brings you back without a prize, and nothing else changes');

// keys: 1/2/3 answer, Enter goes on
await t.page.evaluate(SPLAT);
await card(t.page);
const ans = await t.page.evaluate(() => PBW.brain.q.answer);
await t.page.keyboard.press(`Digit${ans + 1}`);
await t.page.waitForFunction(() => document.querySelector('#brain .go'), null, T);
await t.page.keyboard.press('Enter');
check(await t.page.evaluate(() => PBW.me.alive), 'on a keyboard: 1, 2 or 3 answers and Enter goes on');

// 3 right in a row: pick your prize
await t.page.evaluate(() => { PBW.brain.streak = 2; });
await t.page.evaluate(SPLAT);
await card(t.page);
await t.page.evaluate(() => document.querySelectorAll('#bOpts button')[PBW.brain.q.answer].click());
await t.page.waitForFunction(() => PBW.brain.state === 'prize', null, T);
const picks = await t.page.evaluate(() => [document.getElementById('bQ').textContent, [...document.querySelectorAll('#bOpts .pick')].map((b) => b.dataset.k)]);
await t.page.screenshot({ path: `${SHOTS}/m4-4-pick.png` });
check(/Pick your prize/.test(picks[0]) && picks[1].length === 3, `3 right in a row: pick your prize (${picks[1].join(', ')})`);
await t.page.click('#bOpts .pick:nth-child(1)');
await t.page.click('#brain .go');
const got = await t.page.evaluate((k) => { const P = PBW.POWERUPS[k], me = PBW.me; return P.place ? me.items.includes(k) : k === 'heart' ? me.maxHp === 6 : k === 'mag' ? me.magSize === 24 : !!me.buffs[k]; }, picks[1][0]);
check(got, `you get the one you picked (${picks[1][0]})`);

// a challenge question: a grade harder, super prize
await t.page.evaluate(SPLAT, 'challenge');
await card(t.page);
const ch = await t.page.evaluate(() => [document.querySelector('#brain .bcard').classList.contains('challenge'), PBW.brain.q.level, document.querySelector('#brain .btag').textContent]);
await t.page.screenshot({ path: `${SHOTS}/m4-5-challenge.png` });
check(ch[0] && ch[1] === 8 && /Challenge/.test(ch[2]), `⭐ challenge questions are a grade harder (level ${ch[1]} at age 7)`);
await t.page.evaluate(() => document.querySelectorAll('#bOpts button')[PBW.brain.q.answer].click());
await t.page.waitForFunction(() => PBW.brain.state === 'prize', null, T);
const sup = await t.page.evaluate(() => [document.getElementById('bQ').textContent, [...document.querySelectorAll('#bOpts .pick')].map((b) => b.dataset.k)]);
check(/SUPER/.test(sup[0]) && sup[1].every((k) => ['golden', 'turret', 'triple', 'dome', 'mine'].includes(k)), `…and a right answer picks a SUPER prize (${sup[1].join(', ')})`);
await t.page.click('#bOpts .pick:nth-child(2)');
await t.page.click('#brain .go');

// two misses in a row: the next few are easier
await t.page.evaluate(() => { PBW.brain.misses = 0; PBW.brain.easy = 0; });
for (let i = 0; i < 2; i++) {
  await t.page.evaluate(SPLAT);
  await card(t.page);
  await t.page.evaluate(() => { const q = PBW.brain.q; document.querySelectorAll('#bOpts button')[(q.answer + 1) % 3].click(); });
  await t.page.click('#brain .go');
}
const easyCount = await t.page.evaluate(() => PBW.brain.easy);
await t.page.evaluate(SPLAT);
await card(t.page);
const easier = await t.page.evaluate(() => PBW.brain.q.level);
check(easyCount === 3 && easier === 6, `two misses in a row: the next 3 questions are a grade easier (level ${easier} at age 7)`);
await t.page.evaluate(() => document.querySelectorAll('#bOpts button')[PBW.brain.q.answer].click());
await t.page.waitForFunction(() => document.querySelector('#brain .go') || PBW.brain.state === 'prize', null, T);
await t.page.evaluate(() => { const p = document.querySelector('#bOpts .pick'); if (p) p.click(); });
await t.page.click('#brain .go');

// Spanish: 🔊 reads it aloud
await t.page.evaluate(() => {
  window.SPOKEN = [];
  window.speechSynthesis.speak = (u) => window.SPOKEN.push([u.text, u.lang]);
  window.speechSynthesis.cancel = () => {};
  PBW.setLearnMode('spanish'); PBW.setAge(7);
});
let said = null;
for (let i = 0; i < 25 && !said; i++) {
  await t.page.evaluate(SPLAT);
  await card(t.page);
  if (await t.page.evaluate(() => !!document.querySelector('#bQ .say'))) {
    await t.page.evaluate(() => { window.SPOKEN.length = 0; });
    await t.page.click('#bQ .say');
    said = await t.page.evaluate(() => window.SPOKEN[0]);
    await t.page.screenshot({ path: `${SHOTS}/m4-6-spanish.png` });
  }
  await t.page.evaluate(() => document.querySelectorAll('#bOpts button')[PBW.brain.q.answer].click());
  await t.page.waitForFunction(() => document.querySelector('#brain .go') || PBW.brain.state === 'prize', null, T);
  await t.page.evaluate(() => { const p = document.querySelector('#bOpts .pick'); if (p) p.click(); });
  await t.page.click('#brain .go');
}
check(said && said[1] === 'es-MX', `🔊 reads the Spanish aloud ("${said && said[0]}", ${said && said[1]})`);
const score = await t.page.evaluate(() => document.querySelector('#board .bscore').textContent);
check(/🧠 \d+\/\d+/.test(score), `your score shows in the corner (${score})`);
await ctx.close();

// ----- on a phone -----
console.log('Brain Boost on a phone 844x390');
const ph = await open({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
errs.push(ph);
await ph.page.tap('#play');
await ph.page.evaluate(SPLAT, 'challenge');
await card(ph.page);
await ph.page.waitForTimeout(300);
await ph.page.screenshot({ path: `${SHOTS}/m4-7-phone.png` });
const fits = await ph.page.evaluate(() => { const r = document.querySelector('#brain .bcard').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth; });
check(fits, 'the card fits on a phone held sideways');
const a = await ph.page.evaluate(() => PBW.brain.q.answer);
await ph.page.tap(`#bOpts button:nth-child(${a + 1})`);
await ph.page.waitForFunction(() => PBW.brain.state === 'prize', null, T);
await ph.page.tap('#bOpts .pick:nth-child(1)');
await ph.page.waitForFunction(() => document.querySelector('#brain .go'), null, T);
await ph.page.tap('#brain .go');
check(await ph.page.evaluate(() => PBW.me.alive), 'tapping works the same');
await ph.ctx.close();

// ----- playing with friends: the friend's question holds their respawn on the host -----
console.log('Brain Boost with friends');
const mctx = await newContext({ viewport: { width: 900, height: 560 } });
const A = await open({ context: mctx, query: 'fakenet' }), B = await open({ context: mctx, query: 'fakenet' });
errs.push(A, B);
await A.page.evaluate(() => { window.fakenet.reset(); PBW.setLearnMode('off'); });
await B.page.evaluate(() => { PBW.setLearnMode('math'); PBW.setAge(8); });
await A.page.fill('#name', 'Dad'); await B.page.fill('#name', 'Jesse');
await A.page.click('#hostBtn');
await A.page.waitForFunction(() => PBW.net.code, null, T);
await B.page.fill('#code', await A.page.evaluate(() => PBW.net.code));
await B.page.click('#joinBtn');
await A.page.waitForFunction(() => PBW.net.lobby.people.length === 2, null, T);
await A.page.click('#lStart');
await B.page.waitForFunction(() => PBW.state === 'play' && PBW.me && PBW.me.alive, null, T);
await A.page.evaluate(() => { for (const b of PBW.bots) { b.alive = false; b.respawn = 1e9; } const p = PBW.byId('p2'); p.shield = 0; PBW.hit(p, PBW.me, p.x, p.y + 1, p.z, 9); });
await B.page.evaluate(() => { PBW.brain.force = 'normal'; });
await card(B.page);
await A.page.waitForTimeout(5000);
const held = await A.page.evaluate(() => [!PBW.byId('p2').alive, PBW.byId('p2').asking]);
check(held[0] && held[1], "a friend's question: the host holds their respawn while it's up");
await B.page.evaluate(() => document.querySelectorAll('#bOpts button')[PBW.brain.q.answer].click());
await B.page.waitForFunction(() => document.querySelector('#brain .go') || PBW.brain.state === 'prize', null, T);
await B.page.evaluate(() => { const p = document.querySelector('#bOpts .pick'); if (p) p.click(); });
const prize = await B.page.evaluate(() => document.querySelector('#brain .pname').textContent);
await B.page.click('#brain .go');
await B.page.waitForFunction(() => PBW.me.alive, null, T);
const onHost = await A.page.evaluate(() => { const p = PBW.byId('p2'); return [p.alive, Object.keys(p.buffs).join() || p.items.join() || (p.maxHp > 5 ? 'heart' : '')]; });
check(onHost[0] && onHost[1], `"Let's go!" asks the host, who brings them back with the prize (${prize} → ${onHost[1]})`);

for (const x of errs) check(x.errors.length === 0, 'no console errors' + (x.errors.length ? ': ' + x.errors.slice(0, 3).join(' | ') : ''));
await finish();
