// Network adapter for the self-hosted Sibaq page.
// The game page talks to claude.ai's runtime through `window.claude.use(name)`.
// Off claude.ai there is no such runtime, so this file provides the one
// capability the game needs for live races, `room`, backed by the Worker's
// WebSocket rooms (/api/room/<name>). `db` and `sample` resolve null, which the
// page already handles: quizzes save on the device and AI drafting is hidden.
(() => {
  if (window.claude) return;
  const BASE = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/room/';
  const NAME = /^[a-z0-9][a-z0-9_.-]{0,47}$/;

  function hostKey(name) {
    const k = 'sibaq-hostkey-' + name;
    let v = null;
    try { v = sessionStorage.getItem(k); } catch {}
    if (!v) {
      v = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()) + Date.now()).replace(/[^a-z0-9]/gi, '');
      try { sessionStorage.setItem(k, v); } catch {}
    }
    return v;
  }

  const rooms = {};

  function join(name) {
    if (typeof name !== 'string' || !NAME.test(name)) return Promise.reject({ code: 'invalid_argument', message: 'Bad room name' });
    if (rooms[name]) return rooms[name].ready;

    const R = { ws: null, you: null, peers: new Map(), mine: {}, topics: {}, peerFns: new Set(), connFns: new Set(), up: false, closed: false, tries: 0 };
    rooms[name] = R;

    const peerObj = (peer, presence) => ({ peer, presence: presence || {}, isMe: peer === R.you, sameTab: peer === R.you, kind: 'viewer', guest: false, by: null, updatedAt: Date.now() });
    const all = () => [peerObj(R.you, R.mine), ...[...R.peers].map(([p, pr]) => peerObj(p, pr))];
    const fire = (joined = [], left = [], updated = []) => {
      if (!joined.length && !left.length && !updated.length) return;
      const change = { peers: all(), joined, left, updated };
      R.peerFns.forEach(f => { try { f(change); } catch (e) { console.error(e); } });
    };
    const setUp = up => {
      if (R.up === up) return;
      R.up = up;
      R.connFns.forEach(f => { try { f(up); } catch (e) { console.error(e); } });
    };
    const send = m => { if (R.ws && R.ws.readyState === 1) R.ws.send(JSON.stringify(m)); };

    let resolveReady, rejectReady;
    R.ready = new Promise((res, rej) => { resolveReady = res; rejectReady = rej; });

    const api = {
      name,
      emit(topic, data) {
        if (!R.ws || R.ws.readyState !== 1) return Promise.reject({ code: 'unavailable', message: 'Not connected' });
        R.ws.send(JSON.stringify({ t: 'emit', topic, data, key: hostKey(name) }));
        return Promise.resolve();
      },
      on(topic, fn) {
        (R.topics[topic] = R.topics[topic] || new Set()).add(fn);
        return () => R.topics[topic].delete(fn);
      },
      presence(patch) {
        R.mine = Object.assign({}, R.mine, patch);
        for (const k of Object.keys(R.mine)) if (R.mine[k] === null) delete R.mine[k];
        send({ t: 'presence', p: R.mine });
        return Promise.resolve();
      },
      peers: () => all(),
      onPeers(fn) {
        R.peerFns.add(fn);
        queueMicrotask(() => { if (R.peerFns.has(fn)) { const p = all(); fn({ peers: p, joined: p, left: [], updated: [] }); } });
        return () => R.peerFns.delete(fn);
      },
      connected: () => R.up,
      onConnection(fn) { R.connFns.add(fn); return () => R.connFns.delete(fn); },
      leave() {
        R.closed = true; delete rooms[name]; clearInterval(R.ping);
        try { R.ws && R.ws.close(1000, 'leave'); } catch {}
        return Promise.resolve();
      }
    };

    function connect() {
      let ws;
      try { ws = R.ws = new WebSocket(BASE + encodeURIComponent(name)); }
      catch { return retry(); }
      ws.onmessage = ev => {
        let m;
        try { m = JSON.parse(ev.data); } catch { return; }
        if (m.t === 'welcome') {
          const first = !R.you;
          const before = new Map(R.peers);
          R.you = m.you;
          R.peers = new Map((m.peers || []).map(p => [p.peer, p.presence || {}]));
          R.tries = 0;
          if (Object.keys(R.mine).length) send({ t: 'presence', p: R.mine });
          if (first) { setUp(true); resolveReady(api); return; }
          fire((m.peers || []).filter(p => !before.has(p.peer)).map(p => peerObj(p.peer, p.presence)),
               [...before.keys()].filter(p => !R.peers.has(p)).map(p => peerObj(p, before.get(p))));
          setUp(true);
        } else if (m.t === 'joined') {
          R.peers.set(m.peer, m.presence || {});
          fire([peerObj(m.peer, m.presence)]);
        } else if (m.t === 'presence') {
          const isNew = !R.peers.has(m.peer);
          R.peers.set(m.peer, m.presence || {});
          isNew ? fire([peerObj(m.peer, m.presence)]) : fire([], [], [peerObj(m.peer, m.presence)]);
        } else if (m.t === 'left') {
          const had = R.peers.get(m.peer);
          if (R.peers.delete(m.peer)) fire([], [peerObj(m.peer, had)]);
        } else if (m.t === 'msg') {
          const msg = { topic: m.topic, data: m.data, peer: m.peer, isMe: false, sameTab: false, kind: 'viewer', guest: false, by: null };
          (R.topics[m.topic] || []).forEach(f => { try { f(msg); } catch (e) { console.error(e); } });
        }
      };
      ws.onclose = () => { if (R.ws === ws) { setUp(false); retry(); } };
    }
    function retry() {
      if (R.closed) return;
      if (!R.you && R.tries >= 3) { delete rooms[name]; clearInterval(R.ping); rejectReady({ code: 'upstream_error', message: 'Could not reach the live server' }); return; }
      const delay = Math.min(8000, 500 * 2 ** R.tries++) + Math.random() * 300;
      setTimeout(() => { if (!R.closed) connect(); }, delay);
    }

    connect();
    R.ping = setInterval(() => send({ t: 'ping' }), 25000);
    return R.ready;
  }

  const room = { join };
  window.claude = { use: name => Promise.resolve(name === 'room' ? room : null) };
})();
