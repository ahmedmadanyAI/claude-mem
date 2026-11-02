// Sibaq on Cloudflare: one site with two parts.
//
//   /                          the quiz race (static page in public/)
//   /activities/               session activities: participant phone page
//   /activities/screen         session activities: room screen
//   /activities/admin          session activities: trainer controls (PIN)
//
//   GET  /api/health           -> {"ok":true}
//   GET  /api/room/<name>      -> WebSocket into that race room's Durable Object
//   *    /activities/api/*     -> activities API on D1 (see activities.js)
//
// Race room protocol (JSON text frames)
//   client -> server  {t:"presence", p:{...}}          set my presence (<= 4 KB)
//                     {t:"emit", topic:"state", data, key}   host broadcast (<= 4 KB)
//                     {t:"ping"}
//   server -> client  {t:"welcome", you, peers:[{peer,presence}]}
//                     {t:"joined", peer, presence} | {t:"left", peer}
//                     {t:"presence", peer, presence}
//                     {t:"msg", topic, data, peer}
//                     {t:"error", code, topic} | {t:"pong"}
//
// Only "state" may be emitted, and only by the host: the first tab to emit
// claims the room with a random key; other keys are refused for 6 hours.

import { DurableObject } from 'cloudflare:workers';
import { activitiesApi } from './activities.js';

const ROOM_NAME = /^[a-z0-9][a-z0-9_.-]{0,47}$/;
const MAX_BYTES = 4096;
const HOST_TTL = 6 * 3600e3;
const RATE_PER_SEC = 40;

// Clean URLs -> files in public/. Everything else is served as a file as-is.
const PAGES = {
  '/': '/index.html',
  '/activities/': '/activities/index.html',
  '/activities/screen': '/activities/screen.html',
  '/activities/admin': '/activities/admin.html',
};
// Short links, so /screen or /admin typed in the address bar still land.
const SHORT = { '/activities': '/activities/', '/screen': '/activities/screen', '/admin': '/activities/admin', '/join': '/activities/' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (p === '/api/health') return Response.json({ ok: true });
    const m = p.match(/^\/api\/room\/([^/]+)$/);
    if (m) {
      const name = decodeURIComponent(m[1]);
      if (!ROOM_NAME.test(name)) return new Response('Bad room name', { status: 400 });
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket upgrade', { status: 426 });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(name));
      return stub.fetch(request);
    }
    if (p.startsWith('/activities/api/')) return activitiesApi(p.slice('/activities/api/'.length), request, env, url);
    if (p.startsWith('/api/')) return new Response('Not found', { status: 404 });
    if (SHORT[p]) return Response.redirect(url.origin + SHORT[p] + url.search, 301);
    const file = PAGES[p] || p;
    return env.ASSETS.fetch(new Request(new URL(file, url.origin), request));
  }
};

const size = v => new TextEncoder().encode(JSON.stringify(v ?? null)).length;

export class Room extends DurableObject {
  async fetch() {
    const { 0: client, 1: server } = new WebSocketPair();
    const peer = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ peer, presence: {}, w: Date.now(), n: 0 });
    const peers = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === server) continue;
      const a = ws.deserializeAttachment();
      if (a) peers.push({ peer: a.peer, presence: a.presence });
    }
    server.send(JSON.stringify({ t: 'welcome', you: peer, peers }));
    this.broadcast({ t: 'joined', peer, presence: {} }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(msg, except) {
    const s = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try { ws.send(s); } catch { /* socket closing */ }
    }
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 3 * MAX_BYTES) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const a = ws.deserializeAttachment();
    if (!a || !m || typeof m !== 'object') return;

    const now = Date.now();
    if (now - a.w > 1000) { a.w = now; a.n = 0; }
    a.n++;
    if (a.n > RATE_PER_SEC) { ws.serializeAttachment(a); return; }

    if (m.t === 'presence') {
      if (!m.p || typeof m.p !== 'object' || Array.isArray(m.p) || size(m.p) > MAX_BYTES) { ws.serializeAttachment(a); return; }
      a.presence = m.p;
      ws.serializeAttachment(a);
      this.broadcast({ t: 'presence', peer: a.peer, presence: a.presence }, ws);
      return;
    }
    ws.serializeAttachment(a);

    if (m.t === 'emit') {
      if (m.topic !== 'state' || size(m.data) > MAX_BYTES || typeof m.key !== 'string' || m.key.length < 16 || m.key.length > 64) {
        ws.send(JSON.stringify({ t: 'error', code: 'not_permitted', topic: m.topic }));
        return;
      }
      const host = await this.ctx.storage.get('host');
      if (host && host.key !== m.key && now - host.at < HOST_TTL) {
        ws.send(JSON.stringify({ t: 'error', code: 'not_permitted', topic: 'state' }));
        return;
      }
      if (!host || host.key !== m.key || now - host.at > 60e3) await this.ctx.storage.put('host', { key: m.key, at: now });
      this.broadcast({ t: 'msg', topic: 'state', data: m.data, peer: a.peer }, ws);
      return;
    }
    if (m.t === 'ping') ws.send('{"t":"pong"}');
  }

  async webSocketClose(ws, code) {
    this.drop(ws, code);
  }

  async webSocketError(ws) {
    this.drop(ws, 1011);
  }

  drop(ws, code) {
    const a = ws.deserializeAttachment();
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye'); } catch { /* already closed */ }
    if (a) this.broadcast({ t: 'left', peer: a.peer }, ws);
  }
}
