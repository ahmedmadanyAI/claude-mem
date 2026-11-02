// Builds the Sibaq site in ./public:
//   /             the quiz race (../index.html, the claude.ai artifact page, adapted to run standalone)
//   /activities/  session activities (../activities/)
//   /vendor/      QRCode.js, served from the site so QR codes need no third-party service
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'public');
let src = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');

// Pull head-only tags out of the artifact body.
const take = re => { const m = src.match(re); if (!m) return ''; src = src.replace(m[0], ''); return m[0]; };
const title = take(/<title>[\s\S]*?<\/title>\n?/);
take(/<meta name="claude:viewport-fit-sides"[^>]*>\n?/);
const fonts = [];
for (let t; (t = take(/<link rel="(?:preconnect|stylesheet)"[^>]*>\n?/));) fonts.push(t.trim());

// The join link and QR code point at this site.
const before = src;
src = src.replace(/const SHARE_URL = '[^']*';[^\n]*/, "const SHARE_URL = location.origin + '/';");
if (src === before) throw new Error('SHARE_URL line not found in index.html');

// Link the race home page to the session activities.
const live = '<span class="live-status" id="liveStatus">Connecting…</span>';
if (!src.includes(live)) throw new Error('live status badge not found in index.html');
src = src.replace(live, '<div class="mast-right"><a class="btn btn-ghost sm" href="/activities/" lang="ar">أنشطة القاعة</a>' + live + '</div>');

// Load the network adapter before the game script.
const qr = '<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs';
if (!src.includes(qr)) throw new Error('QR script tag not found in index.html');
src = src.replace(qr, '<script src="/net.js"></script>\n' + qr);
// Serve the QR library from this site instead of the CDN.
src = src.replace('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js', '/vendor/qrcode.min.js');

const desc = 'Sibaq is a live quiz race and a set of room activities. Put it on the big screen, join from your phone, and race to the podium.';
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
${title.trim()}
<meta name="description" content="${desc}">
<meta name="theme-color" content="#12141A">
<meta property="og:title" content="Sibaq · live quiz races">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="website">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
${fonts.join('\n')}
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}
.mast-right{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.mast-right a{text-decoration:none}</style>
</head>
<body>
${src.trim()}
</body>
</html>
`;

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.copyFileSync(path.join(here, 'net.js'), path.join(out, 'net.js'));
fs.cpSync(path.join(here, '..', 'activities'), path.join(out, 'activities'), { recursive: true });
fs.cpSync(path.join(here, '..', 'vendor'), path.join(out, 'vendor'), { recursive: true });
fs.writeFileSync(path.join(out, 'favicon.svg'),
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#12141A"/>' +
  [0, 1, 2, 3].flatMap(r => [0, 1, 2, 3].map(c => (r + c) % 2 ? '' : `<rect x="${4 + c * 6}" y="${4 + r * 6}" width="6" height="6" fill="#F3EFE4"/>`)).join('') +
  '</svg>');
fs.writeFileSync(path.join(out, '_headers'),
  '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(self), microphone=(), geolocation=()\n\n' +
  ['/index.html', '/net.js', '/activities/*.html', '/activities/*.js', '/activities/*.css'].map(p => p + '\n  Cache-Control: no-cache\n').join('') +
  '/vendor/*\n  Cache-Control: public, max-age=86400\n');
console.log('Built', path.relative(process.cwd(), out));
