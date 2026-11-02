// Builds the Sibaq site in ./public:
//   /             the quiz race (../index.html, the claude.ai artifact page, adapted to run standalone)
//   /activities/  session activities (../activities/)
//   /vendor/      QRCode.js, served from the site so QR codes need no third-party service
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { racePage, FAVICON, HEADERS } from './transform.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'public');
const src = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');

const html = racePage(src);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.copyFileSync(path.join(here, 'net.js'), path.join(out, 'net.js'));
fs.cpSync(path.join(here, '..', 'activities'), path.join(out, 'activities'), { recursive: true });
fs.cpSync(path.join(here, '..', 'vendor'), path.join(out, 'vendor'), { recursive: true });
fs.writeFileSync(path.join(out, 'favicon.svg'), FAVICON);
fs.writeFileSync(path.join(out, '_headers'), HEADERS);
console.log('Built', path.relative(process.cwd(), out));
