// Session activities API for Sibaq (/activities/api/*), backed by D1 (binding DB).
//
//   GET  state?me=<token>   current activity, players, answer counts, my answer
//   POST join               {num, dn, fn, g, av, photo?, token?} -> {token, num}
//   POST answer             {token, val}
//   GET  photo/<num>        the player's photo
//   POST scores             {keys:{actKey: correctVal}} -> quiz leaderboard
//   POST admin              {pin, op, ...}  trainer controls; pin = secret ADMIN_PIN
//
// State lives in three tables: players, answers (one row per activity key and
// player) and kv (the trainer's current position, reveal flag, draws, race PIN).

let ready = false;
const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS players (num INTEGER PRIMARY KEY, dn TEXT, fn TEXT, g TEXT, av INTEGER, photo TEXT, token TEXT, t INTEGER)',
  'CREATE TABLE IF NOT EXISTS answers (act TEXT, num INTEGER, val TEXT, t INTEGER, PRIMARY KEY (act, num))',
  'CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)',
];
const DEF = { i: '0', key: 'a0', lock: '0', reveal: '0', odd: '0', oddUsed: '[]', drawn: '', drawAt: '0', used: '[]', race: '' };

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const bad = (m, s = 400) => json({ error: m }, s);

async function init(env) {
  if (ready) return;
  await env.DB.batch(SCHEMA.map(q => env.DB.prepare(q)));
  ready = true;
}

async function kv(env) {
  const { results } = await env.DB.prepare('SELECT k, v FROM kv').all();
  const o = { ...DEF };
  for (const r of results) o[r.k] = r.v;
  return {
    i: +o.i, key: o.key, lock: +o.lock, reveal: +o.reveal, odd: +o.odd,
    oddUsed: JSON.parse(o.oddUsed || '[]'), drawn: o.drawn ? +o.drawn : null, drawAt: +o.drawAt,
    used: JSON.parse(o.used || '[]'), race: /^\d{6}$/.test(o.race) ? o.race : null,
  };
}

async function put(env, obj) {
  await env.DB.batch(Object.entries(obj).map(([k, v]) =>
    env.DB.prepare('INSERT INTO kv (k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
      .bind(k, typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? ''))));
}

async function api(path, req, env, url) {
  const DB = env.DB;
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

  if (path === 'state') {
    const s = await kv(env), tok = url.searchParams.get('me') || '-';
    const [pl, cn, mi] = await DB.batch([
      DB.prepare('SELECT num, dn, g, av, CASE WHEN length(photo) > 0 THEN 1 ELSE 0 END AS ph, t FROM players ORDER BY num'),
      DB.prepare('SELECT val, COUNT(*) AS c FROM answers WHERE act = ?1 GROUP BY val').bind(s.key),
      DB.prepare('SELECT a.val FROM answers a JOIN players p ON p.num = a.num WHERE a.act = ?1 AND p.token = ?2').bind(s.key, tok),
    ]);
    const counts = {};
    let total = 0;
    for (const r of cn.results) { counts[r.val] = r.c; total += r.c; }
    delete s.oddUsed;
    return json({ ...s, players: pl.results, counts, total, mine: mi.results.length ? mi.results[0].val : null, now: Date.now() });
  }

  if (path === 'join') {
    const num = parseInt(body.num, 10);
    const dn = String(body.dn || '').trim().slice(0, 30), fn = String(body.fn || '').trim().slice(0, 80);
    const g = body.g === 'f' ? 'f' : 'm', av = Math.min(6, Math.max(1, parseInt(body.av, 10) || 1));
    const photo = typeof body.photo === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(body.photo) && body.photo.length < 400000 ? body.photo : '';
    if (!(num >= 1 && num <= 99) || !dn) return bad('invalid');
    const oldTok = typeof body.token === 'string' && body.token.length > 10 ? body.token : '';
    const ex = await DB.prepare('SELECT token FROM players WHERE num = ?1').bind(num).first();
    if (ex && ex.token !== oldTok) return bad('taken', 409);
    const token = oldTok || crypto.randomUUID(), t = Date.now();
    const stmts = [];
    if (oldTok) stmts.push(DB.prepare('DELETE FROM players WHERE token = ?1 AND num <> ?2').bind(token, num));
    if (ex) stmts.push(DB.prepare('UPDATE players SET dn = ?2, fn = ?3, g = ?4, av = ?5, photo = ?6, t = ?7 WHERE num = ?1 AND token = ?8').bind(num, dn, fn, g, av, photo, t, token));
    else stmts.push(DB.prepare('INSERT INTO players (num, dn, fn, g, av, photo, token, t) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)').bind(num, dn, fn, g, av, photo, token, t));
    try { await DB.batch(stmts); } catch (e) { return bad('taken', 409); }
    return json({ token, num });
  }

  if (path === 'answer') {
    const s = await kv(env);
    if (s.reveal) return bad('closed', 409);
    const p = await DB.prepare('SELECT num FROM players WHERE token = ?1').bind(String(body.token || '-')).first();
    if (!p) return bad('not joined', 401);
    const val = String(body.val ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!val) return bad('empty');
    const sql = s.lock
      ? 'INSERT OR IGNORE INTO answers (act, num, val, t) VALUES (?1, ?2, ?3, ?4)'
      : 'INSERT INTO answers (act, num, val, t) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(act, num) DO UPDATE SET val = excluded.val, t = excluded.t';
    await DB.prepare(sql).bind(s.key, p.num, val, Date.now()).run();
    const r = await DB.prepare('SELECT val FROM answers WHERE act = ?1 AND num = ?2').bind(s.key, p.num).first();
    return json({ ok: true, mine: r ? r.val : null });
  }

  if (path.startsWith('photo/')) {
    const r = await DB.prepare('SELECT photo FROM players WHERE num = ?1').bind(parseInt(path.slice(6), 10)).first();
    const m = r && /^data:(image\/[a-z]+);base64,(.+)$/.exec(r.photo || '');
    if (!m) return new Response('', { status: 404 });
    const bin = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
    return new Response(bin, { headers: { 'content-type': m[1], 'cache-control': 'public, max-age=600' } });
  }

  if (path === 'scores') {
    const keys = body.keys && typeof body.keys === 'object' ? body.keys : {};
    const acts = Object.keys(keys).slice(0, 50);
    if (!acts.length) return json({ scores: [] });
    const { results } = await DB.prepare('SELECT num, act, val FROM answers WHERE act IN (' + acts.map((_, k) => '?' + (k + 1)).join(',') + ')').bind(...acts).all();
    const pts = {};
    for (const r of results) if (String(keys[r.act]) === r.val) pts[r.num] = (pts[r.num] || 0) + 1000;
    return json({ scores: Object.entries(pts).map(([num, p]) => ({ num: +num, pts: p })).sort((a, b) => b.pts - a.pts) });
  }

  if (path === 'admin') {
    if (!env.ADMIN_PIN || String(body.pin || '') !== String(env.ADMIN_PIN)) return bad('pin', 403);
    const op = body.op, s = await kv(env);
    if (op === 'ping') return json({ ok: true });
    if (op === 'go') {
      const i = Math.max(0, parseInt(body.i, 10) || 0);
      await put(env, { i, key: String(body.key || 'a' + i).slice(0, 40), lock: body.lock ? 1 : 0, reveal: 0, drawn: '' });
    } else if (op === 'reveal') {
      await put(env, { reveal: body.v ? 1 : 0 });
    } else if (op === 'odd') {
      const n = Math.max(1, parseInt(body.n, 10) || 1);
      let used = [...new Set([...s.oddUsed, s.odd])].filter(k => k < n);
      let pool = [];
      for (let k = 0; k < n; k++) if (!used.includes(k)) pool.push(k);
      if (!pool.length) { used = []; for (let k = 0; k < n; k++) if (k !== s.odd || n === 1) pool.push(k); }
      const odd = pool[Math.floor(Math.random() * pool.length)];
      await put(env, { odd, oddUsed: used, key: 'odd' + odd, reveal: 0 });
    } else if (op === 'draw') {
      const { results } = await DB.prepare('SELECT num FROM players').all();
      const all = results.map(r => r.num);
      if (!all.length) return bad('no players', 409);
      let used = s.used.filter(n => all.includes(n)), pool = all.filter(n => !used.includes(n));
      if (!pool.length) { used = []; pool = all; }
      const pick = pool[Math.floor(Math.random() * pool.length)];
      await put(env, { drawn: pick, drawAt: Date.now(), used: [...used, pick] });
    } else if (op === 'drawReset') {
      await put(env, { drawn: '', used: [] });
    } else if (op === 'race') {
      const pin = String(body.race || '').replace(/\D/g, '');
      if (pin && pin.length !== 6) return bad('race pin', 400);
      await put(env, { race: pin });
    } else if (op === 'clear') {
      await DB.prepare('DELETE FROM answers WHERE act = ?1').bind(s.key).run();
    } else if (op === 'kick') {
      const n = parseInt(body.num, 10);
      await DB.batch([DB.prepare('DELETE FROM answers WHERE num = ?1').bind(n), DB.prepare('DELETE FROM players WHERE num = ?1').bind(n)]);
    } else if (op === 'roster') {
      const { results } = await DB.prepare('SELECT num, dn, fn, g, t FROM players ORDER BY num').all();
      return json({ players: results });
    } else if (op === 'resetAll') {
      await DB.batch([DB.prepare('DELETE FROM answers'), DB.prepare('DELETE FROM players'), DB.prepare('DELETE FROM kv')]);
    } else return bad('op');
    return json({ ok: true });
  }

  return bad('not found', 404);
}

export async function activitiesApi(path, req, env, url) {
  if (!env.DB) return bad('activities storage is not configured', 503);
  try {
    await init(env);
    return await api(path, req, env, url);
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500);
  }
}
