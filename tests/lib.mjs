// Shared setup for the headless browser tests: a tiny web server, Chromium and some helpers.
// If cdnjs is blocked where you run the tests, point THREE_PATH at a local three.min.js (r128).
// Screenshots go to SHOTS (default: tests/shots).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

// use a local Playwright if there is one, otherwise the global install
let chromium;
try { ({ chromium } = await import('playwright')); } catch (e) {
  const req = createRequire(import.meta.url);
  ({ chromium } = req(req.resolve('playwright', { paths: [execSync('npm root -g').toString().trim()] })));
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SHOTS = process.env.SHOTS || path.join(root, 'tests', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
// bump() makes the server hand out a slightly different game.js, like a new version going online
let bumps = 0;
export const bump = () => { bumps++; };
const server = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  if (bumps && f.endsWith('game.js')) { res.end(fs.readFileSync(f, 'utf8') + `\n// update ${bumps}\n`); return; }
  fs.createReadStream(f).pipe(res);
}).listen(0);
const URL0 = `http://127.0.0.1:${server.address().port}/index.html?test`;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failures = 0;
export const check = (ok, msg) => { console.log((ok ? '  ok  ' : '  FAIL ') + msg); if (!ok) failures++; };

export const newContext = (opts) => browser.newContext(opts);
export async function open(opts = {}) {
  const { query, context, ...ctxOpts } = opts;
  const ctx = context || await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e) + (e.stack ? ' @ ' + e.stack.split('\n').slice(1, 3).join(' ').trim() : '')));
  if (process.env.THREE_PATH) {
    await page.route('**/cdnjs.cloudflare.com/**/three.min.js', (r) => r.fulfill({ path: process.env.THREE_PATH, contentType: 'text/javascript' }));
  }
  // multiplayer tests use the BroadcastChannel stand-in (net.js), not the real PeerJS
  await page.route(/(cdnjs\.cloudflare\.com|unpkg\.com).*peerjs/, (r) => r.fulfill({ body: '/* PeerJS left out in tests */', contentType: 'text/javascript' }));
  await page.goto(URL0 + (opts && opts.query ? '&' + opts.query : ''));
  await page.waitForFunction(() => window.PBW);
  return { ctx, page, errors };
}
// run the game simulation quickly from inside the page
export const sim = (page, seconds, fn) => page.evaluate(([s, src]) => {
  const f = src ? new Function('P', src) : null;
  for (let i = 0; i < s * 60; i++) { if (f) f(PBW); PBW.step(1 / 60); }
}, [seconds, fn || '']);

export async function finish() {
  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}
