/* Paintball Wars 3D: a stand-in for PeerJS, for testing multiplayer without the internet.
   The real game uses PeerJS (window.Peer, loaded from cdnjs). Add ?fakenet to the address and this file
   swaps in a look-alike built on BroadcastChannel, so two tabs of the same browser can play each other.
   ?fakenet=slow also keeps a room code reserved for a minute after its tab closes, the way the real
   matchmaking service sometimes does. ?lag=ms sets the delay of every message (default 20). */
(() => {
  'use strict';
  const q = new URLSearchParams(location.search);
  if (!q.has('fakenet')) return;
  const SLOW = q.get('fakenet') === 'slow';
  const HOLD_MS = 60000;            // slow mode: how long a closed tab's room code stays reserved
  const ALIVE_MS = 3000;            // a peer whose tab stops checking in for this long is gone
  const LAG = Number(q.get('lag') || 20);
  const KEY = 'pbw3d-fakenet-ids';
  const bc = new BroadcastChannel('pbw3d-fakenet');
  const peers = new Map();          // id -> FakePeer living in this tab
  const conns = new Map();          // connection id -> this tab's end of it

  const readIds = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  const writeIds = (r) => { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch (e) { /* storage blocked */ } };
  const live = (r) => r && r.live && Date.now() - r.seen < ALIVE_MS;
  const reserved = (r) => r && (live(r) || (SLOW && (r.until || r.seen + HOLD_MS) > Date.now()));
  const post = (m) => bc.postMessage(m);
  const later = (f) => setTimeout(f, LAG);

  class Emitter {
    constructor() { this._h = {}; }
    on(e, f) { (this._h[e] = this._h[e] || []).push(f); return this; }
    off(e, f) { this._h[e] = (this._h[e] || []).filter((g) => g !== f); return this; }
    emit(e, ...a) { for (const f of (this._h[e] || []).slice()) { try { f(...a); } catch (err) { setTimeout(() => { throw err; }); } } }
  }
  const fail = (target, type, text) => { const e = new Error(text); e.type = type; target.emit('error', e); };

  class FakeConn extends Emitter {
    constructor(owner, other, cid) {
      super();
      this.owner = owner; this.peer = other; this.cid = cid; this.open = false; this.ended = false;
      conns.set(cid, this);
    }
    send(data) { if (this.open) post({ k: 'data', cid: this.cid, to: this.peer, data }); }
    close() {
      if (this.ended) return;
      post({ k: 'close', cid: this.cid, to: this.peer });
      this._end();
    }
    _end() { if (this.ended) return; this.ended = true; this.open = false; conns.delete(this.cid); this.emit('close'); }
  }

  class FakePeer extends Emitter {
    constructor(id) {
      super();
      this.id = id || 'peer-' + Math.random().toString(36).slice(2, 10);
      this.open = false; this.destroyed = false;
      later(() => {
        if (this.destroyed) return;
        const ids = readIds();
        if (reserved(ids[this.id])) { fail(this, 'unavailable-id', `ID "${this.id}" is taken`); return; }
        ids[this.id] = { live: true, seen: Date.now() };
        writeIds(ids);
        peers.set(this.id, this);
        this.open = true;
        this.emit('open', this.id);
      });
    }
    connect(target) {
      const c = new FakeConn(this, target, 'c' + Math.random().toString(36).slice(2, 12));
      later(() => {
        if (this.destroyed) return;
        if (!live(readIds()[target])) { fail(this, 'peer-unavailable', `Could not connect to peer ${target}`); return; }
        post({ k: 'conn', to: target, from: this.id, cid: c.cid });
      });
      return c;
    }
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true; this.open = false;
      for (const c of [...conns.values()]) if (c.owner === this) c.close();
      peers.delete(this.id);
      release(this.id);
    }
  }
  function release(id) {
    const ids = readIds();
    if (!ids[id]) return;
    if (SLOW) ids[id] = { live: false, seen: Date.now(), until: Date.now() + HOLD_MS };
    else delete ids[id];
    writeIds(ids);
  }

  bc.onmessage = ({ data: m }) => later(() => {
    if (m.k === 'conn') {
      const p = peers.get(m.to);
      if (!p || p.destroyed) return;
      const c = new FakeConn(p, m.from, m.cid);
      c.open = true;
      p.emit('connection', c);
      post({ k: 'ok', cid: m.cid, to: m.from });
      setTimeout(() => c.emit('open'));
    } else {
      const c = conns.get(m.cid);
      if (!c || c.owner.id !== m.to) return;
      if (m.k === 'ok' && !c.open) { c.open = true; c.emit('open'); }
      else if (m.k === 'data' && c.open) c.emit('data', m.data);
      else if (m.k === 'close') c._end();
    }
  });
  // check in so other tabs know this one's peers are still here
  setInterval(() => {
    if (!peers.size) return;
    const ids = readIds();
    for (const id of peers.keys()) ids[id] = { live: true, seen: Date.now() };
    writeIds(ids);
  }, 1000);
  addEventListener('pagehide', () => { for (const p of [...peers.values()]) p.destroy(); });

  window.Peer = FakePeer;
  // test controls: drop() cuts this tab's connections without telling anyone (like walking out of wifi range)
  window.fakenet = {
    slow: SLOW,
    drop() { for (const c of [...conns.values()]) c._end(); },
    reset() { try { localStorage.removeItem(KEY); } catch (e) { /* storage blocked */ } },
  };
})();
