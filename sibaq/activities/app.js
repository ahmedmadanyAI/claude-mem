(function () {
  'use strict';
  var PAGE = document.body.getAttribute('data-page');
  var app = document.getElementById('app');
  var ACTS = window.ACTS || [], ODD = window.ODD || [], MAXN = window.MAX_NUM || 30;
  var KIND = { join: ['الانضمام', 'var(--a3)'], quiz: ['اختبار', 'var(--a1)'], poll: ['استطلاع', 'var(--a3)'], scale: ['مقياس', 'var(--a2)'], cloud: ['سحابة كلمات', 'var(--good)'], odd: ['لحظة غريبة', 'var(--a2)'], draw: ['سحب رقم', 'var(--a0)'], star: ['نجم اليوم', 'var(--signal)'], race: ['سباق', 'var(--signal)'] };
  var COURSE = window.COURSE || {};
  var K_ME = 'sibaq-act-me', K_TOK = 'sibaq-act-tok', K_PIN = 'sibaq-act-pin';
  var LET = 'أبجدهوزحطي';
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  function api(path, body) {
    var opt = body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' };
    return fetch('api/' + path, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || ('HTTP ' + r.status)); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function avSrc(p) { return p && p.ph ? 'api/photo/' + p.num + '?v=' + p.t : 'avatars/' + (p && p.g === 'f' ? 'f' : 'm') + ((p && p.av) || 1) + '.svg'; }
  function joinUrl() { return new URL('./', location.href).href; }
  var qrCache = {};
  function qrSrc(u, s) {
    var k = s + '|' + u;
    if (qrCache[k]) return qrCache[k];
    try {
      var box = document.createElement('div');
      new window.QRCode(box, { text: u, width: s, height: s, colorDark: '#12141A', colorLight: '#FFFFFF', correctLevel: window.QRCode.CorrectLevel.M });
      var c = box.querySelector('canvas');
      if (c) return (qrCache[k] = c.toDataURL('image/png'));
    } catch (e) {}
    return 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  }
  function raceUrl(pin) { return new URL('../', location.href).href + (pin ? '#join-' + pin : ''); }
  function shortUrl(u) { return u.replace(/^https?:\/\//, '').replace(/\/$/, ''); }
  function brand(extra) {
    return '<div class="brand"><span class="flag" aria-hidden="true"></span><span class="word">SIBAQ</span><span class="ar">سباق</span>' +
      (COURSE.name ? '<span class="sep" aria-hidden="true"></span>' + (COURSE.logo ? '<img class="clogo" src="' + esc(COURSE.logo) + '" alt="">' : '') + '<span class="cname">' + esc(COURSE.name) + '</span>' : '') +
      (extra ? '<span class="sep" aria-hidden="true"></span><span class="cname">' + extra + '</span>' : '') + '</div>';
  }
  function view(st) {
    var A = ACTS[st.i] || ACTS[0] || { type: 'join', title: '', q: '' };
    if (A.type === 'odd' && ODD.length) {
      var k = ((st.odd % ODD.length) + ODD.length) % ODD.length, O = ODD[k], perm = [0, 1, 2].map(function (j) { return (j + k) % 3; });
      return { A: A, type: 'odd', q: O.q, opts: perm.map(function (x) { return O.o[x]; }), correct: perm.indexOf(0), graded: true, fact: O.f, link: O.l };
    }
    return { A: A, type: A.type, q: A.q || A.title || '', opts: A.opts || [], correct: A.correct, graded: A.type === 'quiz' };
  }
  function keyFor(i, odd) { return ACTS[i] && ACTS[i].type === 'odd' ? 'odd' + odd : 'a' + i; }
  function loop(fn, ms) {
    (async function () {
      for (;;) {
        try { await fn(); document.body.classList.remove('offline'); } catch (e) { document.body.classList.add('offline'); }
        await sleep(ms);
      }
    })();
  }

  /* ---------- participant phone ---------- */
  function phone() {
    var me = null;
    try { me = JSON.parse(localStorage.getItem(K_ME) || 'null'); } catch (e) {}
    var st = null, sig = '', busy = false;
    var d = { step: 1, dn: '', fn: '', g: null, num: null, photo: null, av: null, err: '', own: null };
    var fileIn = document.createElement('input');
    fileIn.type = 'file'; fileIn.accept = 'image/*'; fileIn.setAttribute('capture', 'user'); fileIn.style.display = 'none';
    document.body.appendChild(fileIn);
    fileIn.addEventListener('change', function () {
      var f = fileIn.files && fileIn.files[0]; if (!f) return;
      shrink(f).then(function (u) { d.photo = u; d.av = null; d.err = ''; force(); }, function () { d.err = 'تعذّر قراءة الصورة. جرّب صورة أخرى.'; force(); });
      fileIn.value = '';
    });
    function shrink(file) {
      return new Promise(function (res, rej) {
        var img = new Image(), url = URL.createObjectURL(file);
        img.onload = function () {
          var S = 256, c = document.createElement('canvas'); c.width = c.height = S;
          var x = c.getContext('2d'), m = Math.min(img.width, img.height);
          x.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, S, S);
          URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = rej; img.src = url;
      });
    }
    function force() { sig = ''; render(); }
    async function poll() {
      st = await api('state' + (me ? '?me=' + encodeURIComponent(me.token) : ''));
      if (me && !st.players.some(function (p) { return p.num === me.num; })) { me = null; localStorage.removeItem(K_ME); d.step = 1; sig = ''; }
      render();
    }
    function render() {
      if (!st) { if (sig !== 'load') { sig = 'load'; app.innerHTML = '<div class="ph"><div class="mut" style="text-align:center;padding:60px 0">جارٍ الاتصال…</div></div>'; } return; }
      var s = me ? joinedSig() : joinSig();
      if (s === sig) return;
      sig = s;
      app.innerHTML = '<div class="ph">' + (me ? joinedHTML() : joinHTML()) + '</div>';
    }
    function head(t, sub) { return brand() + '<div><div class="ruq k">' + t + '</div>' + (sub ? '<div class="mut">' + sub + '</div>' : '') + '</div>'; }
    function dots() { return '<div class="dots">' + [1, 2, 3].map(function (k) { return '<span class="' + (k <= d.step ? 'on' : '') + '"></span>'; }).join('') + '</div>'; }
    function joinSig() { return ['J', d.step, d.g, d.num, d.photo ? d.photo.length : '', d.av, d.err, busy, d.step === 2 ? st.players.map(function (p) { return p.num; }).join(',') : ''].join('|'); }
    function joinHTML() {
      var err = d.err ? '<div class="note bad">' + esc(d.err) + '</div>' : '';
      if (d.step === 1) {
        return head('أهلاً بك', 'ثلاث خطوات وتكون في القاعة') + dots() +
          '<label class="lb">الاسم الذي نناديك به<input class="in" data-f="dn" maxlength="30" value="' + esc(d.dn) + '" placeholder="مثال: أبو فهد"></label>' +
          '<label class="lb">اسمك الكامل للشهادة<input class="in" data-f="fn" maxlength="80" value="' + esc(d.fn) + '" placeholder="كما تريده أن يُكتب في الشهادة"></label>' +
          '<div class="lb">الجنس<div class="seg"><button class="opt' + (d.g === 'm' ? ' on' : '') + '" data-a="g" data-v="m">ذكر</button><button class="opt' + (d.g === 'f' ? ' on' : '') + '" data-a="g" data-v="f">أنثى</button></div></div>' +
          err + '<button class="btn" data-a="next1">التالي</button>';
      }
      if (d.step === 2) {
        var taken = {}, g = '';
        st.players.forEach(function (p) { if (p.num !== d.own) taken[p.num] = 1; });
        for (var n = 1; n <= MAXN; n++) g += '<button class="n' + (d.num === n ? ' on' : '') + '" data-a="num" data-v="' + n + '"' + (taken[n] ? ' disabled' : '') + '>' + n + '</button>';
        return head('اختر رقمك', 'الرقم الذي ستحمله طوال الأيام الثلاثة') + dots() + '<div class="grid">' + g + '</div><div class="note blue">احفظ رقمك. الأرقام الباهتة اختارها زملاؤك.</div>' + err + '<button class="btn ghost" data-a="back">رجوع</button>';
      }
      var av = d.photo || ('avatars/' + d.g + (d.av || 1) + '.svg'), gal = '';
      for (var k = 1; k <= 6; k++) gal += '<button class="avb' + (!d.photo && d.av === k ? ' on' : '') + '" data-a="av" data-v="' + k + '"><img src="avatars/' + d.g + k + '.svg" alt=""></button>';
      return head('صورتك', 'رقم ' + d.num + ' · ' + esc(d.dn)) + dots() +
        '<div style="display:flex;justify-content:center"><img class="av" src="' + av + '" style="width:150px;height:150px" alt=""></div>' +
        '<div class="note or">نحتاج صورة لوجهك لتظهر على شاشة القاعة عند سحب رقمك، وفي التصويت لنجم اليوم.</div>' +
        '<button class="btn orange" data-a="photo">التقط صورة أو اخترها</button><div class="mut" style="text-align:center">أو اختر شخصية كرتونية</div><div class="gal">' + gal + '</div>' + err +
        '<div class="seg"><button class="btn ghost" data-a="back">رجوع</button><button class="btn" data-a="join"' + (busy ? ' disabled' : '') + '>' + (busy ? 'لحظة…' : 'ادخل القاعة') + '</button></div>';
    }
    function joinedSig() {
      var V = view(st);
      return ['M', st.key, st.reveal, st.mine, st.drawn, st.race, me.num, V.type === 'star' ? st.players.map(function (p) { return p.num + ':' + p.t; }).join(',') : '', (st.players.find(function (p) { return p.num === me.num; }) || {}).t].join('|');
    }
    function joinedHTML() {
      var V = view(st), K = KIND[V.type] || KIND.join, my = st.players.find(function (p) { return p.num === me.num; }) || {}, closed = !!st.reveal;
      var h = '<div class="top"><img class="av" src="' + avSrc(my) + '" style="width:54px;height:54px" alt=""><div style="flex:1;min-width:0"><b style="font-size:19px">' + esc(my.dn || me.dn) + '</b><div class="mut">رقمك ' + me.num + '</div></div><button class="lnk" data-a="edit">تعديل</button></div>';
      h += '<span class="tag" style="color:' + K[1] + '">' + K[0] + '</span>';
      if (V.type === 'join') return h + '<div class="card pad center"><div class="big">✓</div><b style="font-size:20px">أنت في القاعة</b><div class="mut">انتظر بداية النشاط الأول.</div></div>';
      if (V.type === 'race') {
        if (!st.race) return h + '<div class="q">' + esc(V.q) + '</div><div class="card pad center"><div class="mut" style="font-size:18px">السباق يبدأ بعد قليل. انتظر رقم السباق على الشاشة.</div></div>';
        return h + '<div class="q">' + esc(V.q) + '</div><div class="card or pad center"><div class="mut">رقم السباق</div><div class="pin" dir="ltr">' + st.race.slice(0, 3) + ' ' + st.race.slice(3) + '</div>' +
          '<button class="btn" data-a="race" data-v="' + st.race + '">ادخل السباق</button><div class="mut small">يُفتح السباق باسمك ' + esc(my.dn || me.dn) + '. عُد إلى هذه الصفحة بعد خط النهاية.</div></div>';
      }
      if (V.type === 'draw') {
        if (st.drawn === me.num) return h + '<div class="card or pad center"><div class="ruq" style="font-size:44px;color:var(--a1)">رقمك أنت!</div><div style="font-size:18px">الكلمة لك الآن.</div></div>';
        return h + '<div class="card pad center"><div class="mut" style="font-size:18px">' + (st.drawn ? 'سُحب الرقم ' + st.drawn : 'السحب على الشاشة. هل يكون رقمك؟') + '</div></div>';
      }
      if (V.type === 'cloud') {
        return h + '<div class="q">' + esc(V.q) + '</div>' +
          (closed ? '<div class="note blue">أُغلق النشاط.</div>' : '<input class="in" data-f="word" maxlength="24" placeholder="كلمة أو كلمتان" value="' + esc(st.mine || '') + '"><button class="btn" data-a="word">أرسل</button>') +
          (st.mine ? '<div class="note blue">أرسلت: <b>' + esc(st.mine) + '</b>' + (closed ? '' : '. يمكنك تغييرها.') + '</div>' : '');
      }
      if (V.type === 'star') {
        var g = st.players.filter(function (p) { return p.num !== me.num; }).map(function (p) {
          return '<button class="pp' + (String(p.num) === String(st.mine) ? ' on' : '') + '" data-a="ans" data-v="' + p.num + '"' + (closed ? ' disabled' : '') + '><img class="av" src="' + avSrc(p) + '" alt=""><b>' + esc(p.dn) + '</b><span>' + p.num + '</span></button>';
        }).join('');
        return h + '<div class="q">' + esc(V.q) + '</div><div class="pgrid">' + (g || '<div class="mut">لا يوجد مشاركون بعد.</div>') + '</div><div class="note ' + (closed ? 'blue' : 'or') + '">' + (closed ? 'أُغلق التصويت. النتيجة على الشاشة.' : st.mine ? 'صوتك مسجّل. يمكنك تغييره حتى يُغلق التصويت.' : 'صوت واحد. لا يصوّت أحد لنفسه.') + '</div>';
      }
      var ans = st.mine == null ? null : +st.mine;
      var opts = V.opts.map(function (o, k) {
        var good = closed && V.graded && k === V.correct, bad = closed && V.graded && ans === k && k !== V.correct;
        var cls = good ? ' good' : bad ? ' bad' : ans === k ? ' on' : '', dis = closed || (V.graded && ans != null);
        var lab = V.type === 'scale' ? (k === 0 ? 'أقل درجة' : k === V.opts.length - 1 ? 'أعلى درجة' : '') : esc(o);
        return '<button class="opt' + cls + '" data-a="ans" data-v="' + k + '"' + (dis ? ' disabled' : '') + '><span class="chip">' + (V.type === 'scale' ? esc(o) : LET[k]) + '</span><span>' + lab + '</span></button>';
      }).join('');
      var msg = '';
      if (closed && V.graded) {
        msg = '<div class="note ' + (ans === V.correct ? 'good' : 'or') + '">' + (ans == null ? 'لم تُجب هذه المرة.' : ans === V.correct ? 'إجابة صحيحة!' : 'الإجابة الصحيحة: ' + esc(V.opts[V.correct])) + '</div>';
        if (V.type === 'odd') msg += '<div class="card pad"><div style="line-height:1.8">' + esc(V.fact) + '</div><div class="mut" style="margin-top:10px">وعلاقتها بالكورس؟ ' + esc(V.link) + '</div></div>';
      } else if (ans != null) msg = '<div class="note blue">تم استلام إجابتك.' + (V.graded ? ' النتيجة بعد الكشف.' : '') + '</div>';
      else if (closed) msg = '<div class="note blue">أُغلق النشاط.</div>';
      return h + '<div class="q">' + esc(V.q) + '</div><div class="opts">' + opts + '</div>' + msg;
    }
    app.addEventListener('input', function (e) { var f = e.target.getAttribute && e.target.getAttribute('data-f'); if (f && f !== 'word') d[f] = e.target.value; });
    app.addEventListener('click', async function (e) {
      var b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
      var a = b.getAttribute('data-a'), v = b.getAttribute('data-v');
      if (a === 'g') { d.g = v; d.av = null; d.err = ''; return force(); }
      if (a === 'next1') { if (!d.dn.trim() || !d.fn.trim() || !d.g) { d.err = 'أكمل الاسمين واختر الجنس.'; return force(); } d.err = ''; d.step = 2; return force(); }
      if (a === 'num') { d.num = +v; d.err = ''; d.step = 3; if (!d.photo && !d.av) d.av = 1 + Math.floor(Math.random() * 6); return force(); }
      if (a === 'back') { d.step = Math.max(1, d.step - 1); d.err = ''; return force(); }
      if (a === 'av') { d.av = +v; d.photo = null; return force(); }
      if (a === 'photo') return fileIn.click();
      if (a === 'join') {
        busy = true; force();
        try {
          var r = await api('join', { num: d.num, dn: d.dn.trim(), fn: d.fn.trim(), g: d.g, av: d.av || 1, photo: d.photo || '', token: localStorage.getItem(K_TOK) || '' });
          me = { token: r.token, num: r.num, dn: d.dn.trim(), fn: d.fn.trim(), g: d.g };
          localStorage.setItem(K_ME, JSON.stringify(me)); localStorage.setItem(K_TOK, r.token);
        } catch (err) {
          if (err.status === 409) { d.err = 'سبقك زميل إلى الرقم ' + d.num + '. اختر رقماً آخر.'; d.step = 2; } else d.err = 'تعذّر الاتصال. حاول مرة أخرى.';
        }
        busy = false;
        try { await poll(); } catch (x) {}
        return force();
      }
      if (a === 'race') {
        try { localStorage.setItem('sibaq-me', JSON.stringify({ name: String(me.dn || '').slice(0, 20), av: (me.num - 1) % 12 })); } catch (x) {}
        location.href = raceUrl(v);
        return;
      }
      if (a === 'edit') { d.step = 1; d.own = me.num; d.num = me.num; d.dn = me.dn || ''; d.fn = me.fn || ''; d.g = me.g; d.err = ''; me = null; return force(); }
      if (a === 'ans' || a === 'word') {
        var val = v;
        if (a === 'word') { var inp = app.querySelector('[data-f="word"]'); val = ((inp && inp.value) || '').replace(/\s+/g, ' ').trim(); if (!val) return; }
        st.mine = val; force();
        try { var res = await api('answer', { token: me.token, val: val }); st.mine = res.mine; } catch (err) { if (err.status === 409) st.mine = null; }
        return force();
      }
    });
    render();
    loop(poll, 2000);
  }

  /* ---------- room screen ---------- */
  function screen() {
    var st = null, sig = '', lastAt = null, rollEnd = 0, rollT = null, scores = null, scoresFor = '';
    async function poll() {
      st = await api('state');
      var V = view(st);
      if (lastAt !== null && st.drawAt !== lastAt && st.drawn) { rollEnd = Date.now() + 1600; startRoll(); }
      lastAt = st.drawAt;
      if (V.type === 'quiz' && st.reveal) {
        var k = st.key + ':' + st.total;
        if (k !== scoresFor) {
          var keys = {};
          ACTS.forEach(function (a, i) { if (a.type === 'quiz') keys['a' + i] = String(a.correct); });
          scores = (await api('scores', { keys: keys })).scores; scoresFor = k;
        }
      }
      render();
    }
    function startRoll() {
      clearInterval(rollT); sig = ''; render();
      rollT = setInterval(function () {
        var el = document.getElementById('roll');
        if (Date.now() >= rollEnd) { clearInterval(rollT); sig = ''; render(); return; }
        if (el && st.players.length) el.textContent = st.players[Math.floor(Math.random() * st.players.length)].num;
      }, 85);
    }
    function render() {
      if (!st) return;
      var rolling = Date.now() < rollEnd;
      var s = [st.key, st.reveal, st.race, JSON.stringify(st.counts), st.players.map(function (p) { return p.num + ':' + p.t; }).join(','), st.drawn, rolling, (st.used || []).join(','), scores ? JSON.stringify(scores.slice(0, 5)) : ''].join('|');
      if (s === sig) return;
      sig = s;
      app.innerHTML = html(rolling);
    }
    function html(rolling) {
      var V = view(st), K = KIND[V.type] || KIND.join, url = joinUrl(), P = st.players, by = {}, main = '';
      var rUrl = V.type === 'race' && st.race ? raceUrl(st.race) : '';
      P.forEach(function (p) { by[p.num] = p; });
      var short = esc(shortUrl(url));
      var head = '<header class="sh">' + brand() + '<span class="tag" style="color:' + K[1] + '">' + K[0] + '</span><div class="cnt">' + P.length + ' في القاعة' + (V.type !== 'join' && V.type !== 'draw' && V.type !== 'race' ? ' · ' + st.total + ' إجابة' : '') + '</div></header>';
      if (V.type === 'join') {
        main = '<div class="jn"><div class="qrbox"><img src="' + qrSrc(url, 600) + '" alt="QR"><div class="url" dir="ltr">' + short + '</div></div><div class="jw"><div class="ruq hk">انضم من هاتفك</div><div class="mut big2">' + esc(V.q) + '</div><div class="wall">' +
          P.map(function (p) { return '<div class="wp"><img class="av" src="' + avSrc(p) + '" alt=""><span class="nb">' + p.num + '</span><b>' + esc(p.dn) + '</b></div>'; }).join('') + '</div></div></div>';
      } else if (V.type === 'race') {
        main = st.race
          ? '<div class="jn"><div class="qrbox"><img src="' + qrSrc(rUrl, 600) + '" alt="QR"><div class="url" dir="ltr">' + esc(shortUrl(raceUrl(''))) + '</div></div><div class="jw"><div class="ruq hk">' + esc(V.q) + '</div><div class="mut big2">من صفحة الأنشطة على هاتفك اضغط «ادخل السباق»، أو امسح الرمز. رقم السباق:</div><div class="pin big" dir="ltr">' + st.race.slice(0, 3) + ' ' + st.race.slice(3) + '</div></div></div>'
          : '<div class="dr"><div class="jw" style="align-items:center;text-align:center"><div class="ruq hk">' + esc(V.q) + '</div><div class="mut big2">يبدأ السباق بعد قليل.</div></div></div>';
      } else if (V.type === 'draw') {
        var p = st.drawn ? by[st.drawn] : null;
        main = '<div class="dr"><div class="ring' + (rolling ? ' spin' : '') + '"><span id="roll">' + (rolling ? '…' : (st.drawn || '؟')) + '</span></div>' +
          (!rolling && p ? '<div class="drp"><img class="av" src="' + avSrc(p) + '" alt=""><div><div class="ruq" style="font-size:3vw;color:var(--a1)">رقمك أنت!</div><div class="nm">' + esc(p.dn) + '</div></div></div>' : '<div class="ruq hk">' + esc(V.q) + '</div>') + '</div>' +
          ((st.used || []).length ? '<div class="used">' + st.used.map(function (n) { return '<span>' + n + '</span>'; }).join('') + '</div>' : '');
      } else if (V.type === 'cloud') {
        var W = Object.keys(st.counts).map(function (w) { return [w, st.counts[w]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 40), mx = W.length ? W[0][1] : 1, C = ['var(--chalk)', 'var(--signal)', 'var(--a2)', 'var(--a1)', 'var(--a3)', 'var(--a0)'];
        main = '<div class="qq">' + esc(V.q) + '</div><div class="cloud">' + (W.length ? W.map(function (x, k) { return '<span style="font-size:' + (1.6 + 4.4 * x[1] / mx).toFixed(2) + 'vw;color:' + C[k % C.length] + '">' + esc(x[0]) + '</span>'; }).join('') : '<div class="mut big2">الكلمات تظهر هنا عند وصولها.</div>') + '</div>';
      } else if (V.type === 'star') {
        if (st.reveal) {
          var top = Object.keys(st.counts).map(function (n) { return { p: by[n], c: st.counts[n] }; }).filter(function (x) { return x.p; }).sort(function (a, b) { return b.c - a.c; }).slice(0, 3);
          main = '<div class="ruq hk" style="color:var(--signal)">نجم اليوم</div><div class="pod">' + [1, 0, 2].filter(function (k) { return top[k]; }).map(function (k) {
            return '<div class="pd p' + k + '"><img class="av" src="' + avSrc(top[k].p) + '" alt=""><b>' + esc(top[k].p.dn) + '</b><span>' + top[k].c + ' صوت</span><div class="blk">' + (k + 1) + '</div></div>';
          }).join('') + '</div>';
        } else {
          main = '<div class="qq">' + esc(V.q) + '</div><div class="big3">' + st.total + '<span> صوت حتى الآن</span></div><div class="wall dim">' + P.map(function (p) { return '<div class="wp"><img class="av" src="' + avSrc(p) + '" alt=""><b>' + esc(p.dn) + '</b></div>'; }).join('') + '</div>';
        }
      } else if (V.type === 'scale') {
        var c = V.opts.map(function (_, k) { return st.counts[k] || 0; }), m5 = Math.max.apply(null, [1].concat(c)), n5 = c.reduce(function (s, x) { return s + x; }, 0);
        var avg = n5 ? (c.reduce(function (s, x, k) { return s + x * (k + 1); }, 0) / n5).toFixed(1) : '—';
        main = '<div class="qq">' + esc(V.q) + '</div><div class="sc5"><div class="cols">' + c.map(function (x, k) { return '<div class="col"><span>' + x + '</span><i style="height:' + (6 + 90 * x / m5) + '%"></i><b>' + esc(V.opts[k]) + '</b></div>'; }).join('') + '</div><div class="avg"><span class="mut">المتوسط</span><b>' + avg + '</b></div></div>';
      } else {
        var cc = V.opts.map(function (_, k) { return st.counts[k] || 0; }), n = cc.reduce(function (s, x) { return s + x; }, 0), hide = V.graded && !st.reveal;
        var bars = V.opts.map(function (o, k) {
          var good = st.reveal && V.graded && k === V.correct, dim = st.reveal && V.graded && k !== V.correct, pc = n ? Math.round(100 * cc[k] / n) : 0;
          return '<div class="bar' + (good ? ' good' : '') + (dim ? ' dim' : '') + '"><span class="chip">' + LET[k] + '</span><span class="bl">' + esc(o) + '</span><span class="bv"><i style="width:' + (hide ? 0 : pc) + '%"></i></span><b>' + (hide ? '' : pc + '%') + '</b></div>';
        }).join('');
        var side = '';
        if (V.type === 'odd' && st.reveal) side = '<div class="fact card"><div>' + esc(V.fact) + '</div><div class="lk">وعلاقتها بالكورس؟ <span>' + esc(V.link) + '</span></div></div>';
        if (V.type === 'quiz' && st.reveal && scores && scores.length) side = '<div class="ldr card"><div class="ruq" style="font-size:2vw;color:var(--a1)">المتصدّرون</div>' + scores.slice(0, 5).map(function (r, k) { var pp = by[r.num] || { num: r.num, dn: '؟' }; return '<div class="lr"><span class="rk">' + (k + 1) + '</span><img class="av" src="' + avSrc(pp) + '" alt=""><b>' + esc(pp.dn) + '</b><span class="pts">' + r.pts + '</span></div>'; }).join('') + '</div>';
        main = '<div class="qq">' + esc(V.q) + '</div><div class="qa' + (side ? ' two' : '') + '"><div class="bars">' + bars + '</div>' + side + '</div>';
      }
      var foot = V.type === 'join' || rUrl ? '' : '<footer class="sf"><img src="' + qrSrc(url, 240) + '" alt="QR"><div><div class="mut">انضم أو عُد إلى النشاط</div><div class="url" dir="ltr">' + short + '</div></div></footer>';
      return '<div class="sc">' + head + '<main class="sm">' + main + '</main>' + foot + '</div>';
    }
    loop(poll, 1500);
  }

  /* ---------- trainer admin ---------- */
  function admin() {
    var pin = sessionStorage.getItem(K_PIN) || '', st = null, sig = '', msg = '';
    function op(o, extra) { return api('admin', Object.assign({ pin: pin, op: o }, extra || {})); }
    function pinForm(err) {
      app.innerHTML = '<div class="ph">' + brand('لوحة المدرّب') + '<label class="lb">رمز المدرّب<input class="in" id="pin" inputmode="numeric" type="password" autocomplete="off"></label>' + (err ? '<div class="note bad">' + err + '</div>' : '') + '<button class="btn" id="go">دخول</button></div>';
      document.getElementById('go').onclick = function () {
        pin = document.getElementById('pin').value.trim();
        op('ping').then(function () { sessionStorage.setItem(K_PIN, pin); start(); }, function (e) { pinForm(e.status === 403 ? 'الرمز غير صحيح.' : 'تعذّر الاتصال.'); });
      };
    }
    var started = false;
    function start() { if (started) return; started = true; app.addEventListener('click', onClick); loop(async function () { st = await api('state'); render(); }, 2000); }
    async function run(fn) {
      try { await fn(); msg = ''; } catch (e) { msg = e.status === 403 ? 'انتهت الجلسة. اخرج وأعد إدخال الرمز.' : e.message === 'no players' ? 'لا يوجد مشاركون بعد.' : 'تعذّر تنفيذ الأمر: ' + e.message; }
      try { st = await api('state'); } catch (x) {}
      sig = ''; render();
    }
    async function go(i) {
      var A = ACTS[i];
      await op('go', { i: i, key: keyFor(i, st.odd), lock: A.type === 'quiz' || A.type === 'odd' });
      if (A.type === 'odd') await op('odd', { n: ODD.length });
    }
    function onClick(e) {
      var b = e.target.closest('[data-a]'); if (!b || !st) return;
      var a = b.getAttribute('data-a'), v = b.getAttribute('data-v');
      if (a === 'go') return run(function () { return go(+v); });
      if (a === 'prev') return run(function () { return go(Math.max(0, st.i - 1)); });
      if (a === 'next') return run(function () { return go(Math.min(ACTS.length - 1, st.i + 1)); });
      if (a === 'rev') return run(function () { return op('reveal', { v: !st.reveal }); });
      if (a === 'odd') return run(function () { return op('odd', { n: ODD.length }); });
      if (a === 'draw') return run(function () { return op('draw'); });
      if (a === 'drawReset') return run(function () { return op('drawReset'); });
      if (a === 'race') {
        var inp = app.querySelector('#racePin'), pinv = ((inp && inp.value) || '').replace(/\D/g, '');
        if (pinv.length !== 6) { msg = 'رقم السباق ستة أرقام. تجده على شاشة السباق.'; sig = ''; return render(); }
        return run(function () { return op('race', { race: pinv }); });
      }
      if (a === 'raceOff') return run(function () { return op('race', { race: '' }); });
      if (a === 'clear') { if (confirm('مسح إجابات هذا النشاط؟')) run(function () { return op('clear'); }); return; }
      if (a === 'kick') { if (confirm('إزالة المشارك رقم ' + v + '؟')) run(function () { return op('kick', { num: +v }); }); return; }
      if (a === 'reset') { if (confirm('حذف كل المشاركين والإجابات؟') && confirm('متأكد؟ لا يمكن التراجع.')) run(function () { return op('resetAll'); }); return; }
      if (a === 'out') { sessionStorage.removeItem(K_PIN); location.reload(); return; }
      if (a === 'csv') return run(async function () {
        var r = await op('roster');
        var rows = [['الرقم', 'الاسم المختصر', 'الاسم للشهادة', 'الجنس']].concat(r.players.map(function (p) { return [p.num, p.dn, p.fn, p.g === 'f' ? 'أنثى' : 'ذكر']; }));
        var csv = '\ufeff' + rows.map(function (row) { return row.map(function (x) { return '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
        var el = document.createElement('a'); el.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); el.download = 'attendance.csv'; el.click();
      });
    }
    function render() {
      if (!st) return;
      var s = [st.key, st.reveal, st.race, st.total, st.drawn, st.players.map(function (p) { return p.num + ':' + p.t; }).join(','), msg].join('|');
      if (s === sig) return;
      sig = s;
      var V = view(st), K = KIND[V.type] || KIND.join, ctl = [];
      if (V.type !== 'join' && V.type !== 'draw' && V.type !== 'race') ctl.push('<button class="btn ' + (st.reveal ? 'ghost' : 'orange') + '" data-a="rev">' + (st.reveal ? 'أعد فتح النشاط' : V.type === 'star' ? 'أغلق التصويت واكشف النجم' : 'اكشف النتيجة') + '</button>');
      if (V.type === 'odd') ctl.push('<button class="btn ghost" data-a="odd">حقيقة أخرى</button>');
      if (V.type === 'draw') ctl.push('<button class="btn orange" data-a="draw">اسحب رقماً</button>', '<button class="btn ghost" data-a="drawReset">صفّر السحب</button>');
      if (V.type === 'race') {
        ctl.push('<a class="btn orange" href="../" target="_blank" rel="noopener">افتح سباقاً على الشاشة</a>');
        ctl.push('<div class="racebox"><input class="in" id="racePin" inputmode="numeric" maxlength="7" dir="ltr" placeholder="رقم السباق" value="' + (st.race || '') + '"><button class="btn" data-a="race">' + (st.race ? 'حدّث الرقم' : 'أرسل الرقم للهواتف') + '</button>' + (st.race ? '<button class="btn ghost" data-a="raceOff">أوقف</button>' : '') + '</div>');
      }
      if (V.type !== 'join' && V.type !== 'draw' && V.type !== 'race') ctl.push('<button class="btn ghost" data-a="clear">امسح الإجابات</button>');
      app.innerHTML = '<div class="ad"><div class="top">' + brand('لوحة المدرّب') + '<div style="flex:1"></div><a class="lnk" href="screen" target="_blank">افتح شاشة القاعة</a><a class="lnk" href="../" target="_blank">السباق</a><button class="lnk" data-a="out">خروج</button></div>' +
        (msg ? '<div class="note bad">' + esc(msg) + '</div>' : '') +
        '<div class="card pad now"><span class="tag" style="color:' + K[1] + '">' + K[0] + '</span><div class="q">' + esc(V.q) + '</div><div class="mut">' + st.players.length + ' في القاعة · ' + st.total + ' إجابة' + (st.reveal ? ' · النتيجة مكشوفة' : '') + (V.type === 'draw' && st.drawn ? ' · آخر رقم: ' + st.drawn : '') + (V.type === 'race' && st.race ? ' · رقم السباق: ' + st.race : '') + '</div>' +
        '<div class="row"><button class="btn ghost" data-a="prev">السابق</button><button class="btn" data-a="next">التالي</button></div><div class="row">' + ctl.join('') + '</div></div>' +
        '<div class="sec">الأنشطة</div><div class="acts">' + ACTS.map(function (A, i) { var k = KIND[A.type] || KIND.join; return '<button class="act' + (i === st.i ? ' on' : '') + '" data-a="go" data-v="' + i + '"><span style="color:' + k[1] + '">' + k[0] + '</span><b>' + esc(A.title || '') + '</b></button>'; }).join('') + '</div>' +
        '<div class="sec"><span>المشاركون (' + st.players.length + ')</span><button class="lnk" data-a="csv">تنزيل القائمة للشهادات</button></div><div class="plist">' +
        (st.players.length ? st.players.map(function (p) { return '<div class="pr"><img class="av" src="' + avSrc(p) + '" alt=""><span class="nb2">' + p.num + '</span><b>' + esc(p.dn) + '</b><button class="lnk bad" data-a="kick" data-v="' + p.num + '">إزالة</button></div>'; }).join('') : '<div class="mut">لم ينضم أحد بعد.</div>') + '</div>' +
        '<div class="sec">الإعداد</div><div class="row"><button class="btn ghost danger" data-a="reset">إعادة ضبط كاملة</button></div><div class="mut small">رابط الانضمام: <span dir="ltr">' + esc(joinUrl()) + '</span></div></div>';
    }
    if (pin) op('ping').then(start, function () { pinForm(); }); else pinForm();
  }

  if (PAGE === 'phone') phone(); else if (PAGE === 'screen') screen(); else if (PAGE === 'admin') admin();
})();
