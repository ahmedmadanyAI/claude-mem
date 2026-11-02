# Sibaq · سباق

One site for a live training room, in two parts:

- **The quiz race** (`/`): the host puts a quiz on a big screen. Players join from their phones with a 6-digit PIN (or by scanning the QR code), answer against the clock, and watch the standings play out as a race after every question.
- **Session activities** (`/activities/`): participants join once with a number, name and photo, then follow the trainer through quizzes, polls, scales, word clouds, "odd moment" facts, a number draw and star-of-the-day voting. The trainer drives it from `/activities/admin`; the room screen is `/activities/screen`.

A **race** activity joins the two: the trainer starts a quiz race, sends its PIN from the control screen, and every phone gets an «ادخل السباق» button that opens the race with the participant's name already filled in.

**Site:** https://sibaq.ahmedmadany.com · **claude.ai version of the race:** https://claude.ai/artifact/Nw1orcKwBYfzJbWfDzBSn5

## What's in it

- **Host stage:** a lobby with the PIN, QR code and join link, a question screen with a countdown ring and live answer count, a reveal with how many picked each answer, race-lane standings, and a podium with confetti.
- **Player pad:** nickname and racer picker, big answer tiles (star, moon, bolt and hex glyphs), a time bar, reactions that float up on the big screen, and a result after each question with your rank and the gap to the racer ahead.
- **Three question types:** multiple choice (one or more correct answers), true/false, and number guesses, where the closer you get the more you score.
- **Scoring:** up to 1,000 points for speed, a streak bonus of +100 per question in a row (up to +500), and **Double Down**: once per race, double your points on a question, or lose 300 if you're wrong.
- **Quiz builder:** write your own quizzes and save them to the shared library, or to this device if you can't write to the library. **Draft with Claude** writes questions on any topic in English, Arabic, French or Spanish for you to check and edit.
- **Practice solo:** play any quiz alone against the clock and keep a personal best.
- **Built-in quizzes:** Around the World, Science Sprint, and an Arabic general-knowledge quiz (ثقافة عامة).
- Sound effects, full-screen mode, and right-to-left text for Arabic content. If the host refreshes, the race picks up where it left off, and so does a player's.

## How it works

`index.html` is a single self-contained page built for the claude.ai artifact runtime:

| Capability | Used for |
| --- | --- |
| `room` | Real-time game channel per PIN (`sibaq-<PIN>`). The host emits the game state; players send their join, answers and reactions through presence, so they need no write access. |
| `db` | `games/<PIN>`: a copy of the game state so the host can resume and late joiners can catch up. `quizzes/<id>`: the shared quiz library. |
| `sample` | "Draft with Claude" in the builder. |

The host's tab keeps the answer key; players only see the current question and receive the correct answer when it's revealed.

## Making it yours

- **Name and colors:** the tokens at the top of the `<style>` block (`--signal`, `--a0` to `--a3`, fonts).
- **Built-in quizzes:** the `BUILTIN` array in the script.
- **Racers and reactions:** the `AV` and `REACTS` arrays.
- **Scoring:** `scoreOne()`.

## Session activities

| Page | Who opens it |
| --- | --- |
| `/activities/` | Participants, on their phones (the QR code on the room screen points here) |
| `/activities/screen` | The projector |
| `/activities/admin` | The trainer, from a laptop or phone, with the trainer PIN |

- **Activities and course name:** edit `activities/acts.js`. Add new activities at the end of the list: answers are stored by position, so inserting one in the middle moves the answers of the ones after it. Types: `join`, `quiz`, `poll`, `scale`, `cloud`, `odd`, `draw`, `star`, `race`.
- **Before each course:** «إعادة ضبط كاملة» on the control screen clears the previous participants. After it, «تنزيل القائمة للشهادات» downloads a CSV of numbers and full names.
- **Storage:** the D1 database `vla-activities` (binding `DB`), the same one the original vla-activities Worker uses, so players and answers carry over.
- **Look:** `activities/app.css` uses the race's tokens (asphalt ground, `--signal` yellow, the four livery colours) and Thmanyah Sans from `fonts/`, which the race page uses for Arabic too.

## Self-hosting on Cloudflare (sibaq.ahmedmadany.com)

`sibaq/deploy/` builds both parts into one Cloudflare Worker:

- `build.mjs` copies `index.html` into `public/`, points the join link and QR code at the site, loads `net.js`, and adds a link to the activities. It copies `activities/`, `fonts/` and `vendor/` (QRCode.js, so QR codes are drawn in the browser with no third-party service).
- `net.js` stands in for the claude.ai runtime: it gives the race its live `room` over a WebSocket. Quizzes save on each device, and AI drafting is hidden because it needs claude.ai.
- `src/worker.js` routes every request: clean page URLs, `/api/room/<name>` (one Durable Object per race PIN, which relays presence and the host's game state; only the tab that started the game can broadcast), and `/activities/api/*`, which `src/activities.js` serves from D1.
- `wrangler.toml` sets the custom domain `sibaq.ahmedmadany.com`. Cloudflare creates the DNS record itself.
- The trainer PIN is the Worker secret `ADMIN_PIN` (not in the repo). Set it once with `npx wrangler secret put ADMIN_PIN`.

Deploy with either option:

**A. Cloudflare dashboard (no tokens).** Workers & Pages → Create → Import a repository → pick this repo and branch. Set the root directory to `sibaq/deploy`, the build command to `node build.mjs`, and the deploy command to `npx wrangler deploy`. Then add `ADMIN_PIN` under the Worker's Settings → Variables and Secrets, as a secret.

**B. GitHub Actions.** Add the repository secrets `CLOUDFLARE_API_TOKEN` (from the "Edit Cloudflare Workers" token template, with the zone set to ahmedmadany.com, plus D1 edit) and `CLOUDFLARE_ACCOUNT_ID`. `.github/workflows/sibaq-deploy.yml` deploys on every push that touches `sibaq/`.

Local run: `cd sibaq/deploy && npm install`, put `ADMIN_PIN=1234` in `.dev.vars`, then `npm run dev` and open http://localhost:8787 (race) or http://localhost:8787/activities/ (activities). Local runs use a local copy of D1, not the live data.
