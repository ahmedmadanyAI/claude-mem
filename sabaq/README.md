# Sabaq · سباق

A live quiz race for any room. The host puts a quiz on a big screen. Players join from their phones with a 6-digit PIN (or by scanning the QR code), answer against the clock, and watch the standings play out as a race after every question.

**Live page:** https://claude.ai/artifact/Nw1orcKwBYfzJbWfDzBSn5

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
| `room` | Real-time game channel per PIN (`sabaq-<PIN>`). The host emits the game state; players send their join, answers and reactions through presence, so they need no write access. |
| `db` | `games/<PIN>`: a copy of the game state so the host can resume and late joiners can catch up. `quizzes/<id>`: the shared quiz library. |
| `sample` | "Draft with Claude" in the builder. |

The host's tab keeps the answer key; players only see the current question and receive the correct answer when it's revealed.

## Making it yours

- **Name and colors:** the tokens at the top of the `<style>` block (`--signal`, `--a0` to `--a3`, fonts).
- **Built-in quizzes:** the `BUILTIN` array in the script.
- **Racers and reactions:** the `AV` and `REACTS` arrays.
- **Scoring:** `scoreOne()`.
