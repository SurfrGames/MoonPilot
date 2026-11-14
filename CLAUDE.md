# Moon Pilot — notes for Claude

Read `moon-pilot/docs/BACKLOG.md` first: it is the single list of what is done, in progress and
left. Update it at the end of every work session. Do not re-plan from scratch.

## The owner's standing rules
- Best performance, **minimal token usage**. No subagents unless asked. Filter command output.
  Prefer text checks over screenshots. One focused task per session; short replies.
- Only claim what is built and verified. Say plainly what was not tested.
- The owner creates accounts and payout details and approves anything posted in their name.
- Commit only when asked. Work on a feature branch, never directly on `main`.

## What this is
A free browser game: fly a real-physics Moon rocket and race the ghost of a PPO agent that
learned launch -> orbit -> land. Goal: earn through web-portal ads, Android, and itch.io tips
(plan in `.agents/product-marketing-context.md`).

## Where things stand (updated 2026-11-14)
- Branch `feat/daily-sound` holds everything; `main` is still the first commit. All branches are pushed.
- Live build: https://surfrgames.github.io/moonpilot-play/ (public repo `SurfrGames/moonpilot-play`).
- Target: Microsoft Store release around Mon 16 Nov 2026. The owner must do the Partner Center and
  PWABuilder steps in `moon-pilot/docs/MICROSOFT-STORE.md`, including the `supporter` add-on.
- The owner put Claude on autopilot on 2026-11-12: build, publish, commit and push without asking.
  Still never create accounts, enter credentials or payment details, or post in the owner's name.
- Next ideas, in order: fix whatever PWABuilder flags; first real purchase test; landing-pad targets;
  solar-system map; retrain Ceres landing; ads. Details and statuses are in the backlog.

## Layout
- `moon-pilot/www/` — the game, plain HTML/JS, no build step. `js/physics.js` (must stay equal
  to the Python physics), `js/world.js` (three.js r128 scene and effects), `js/game.js`
  (missions, controls, HUD, coach, scoring, map, sounds), `data/ghosts.js` (generated).
- `rocket-lander/orbit3d.py` — environment, trainer, `export` (regenerates `ghosts.js`).
  Trained model: `rocket-lander/models/orbit3d.zip`.
- Also in `www/js/`: `backend.js` (leaderboard, flight sharing), `store.js` (Supporter Pack purchase).
  `www/data/ghosts-<world>.js` hold Europa and Ceres. `sw.js` + `manifest.webmanifest` make it installable;
  bump `VERSION` in `sw.js` on each release.
- Other worlds: `ORBIT3D_BODY=europa|ceres uv run orbit3d.py train|export`; models `orbit3d-<world>.zip`.
- `moon-pilot/tools/` — `parity.js [world]` (JS vs Python physics), `deploy-pages.sh` (publish),
  `shots.sh` (store screenshots into `store/`), `pull_flights.py`, `backend.sql`, `make_logo.py`.
- `moon-pilot/docs/` — `BACKLOG.md`, `MICROSOFT-STORE.md` (submission steps and listing text).

## Backend
Supabase project `moon-pilot` (ref `mjzmndrphrjgwozifvrk`): leaderboard and opt-in flight sharing.
Schema: `moon-pilot/tools/backend.sql`. Client: `www/js/backend.js` (publishable key only; never
put a secret key in the repo). Delete your own test rows after testing.

## Commands
- Play locally: `python -m http.server 8767 --directory C:/MoonPilot/moon-pilot/www`
- Physics check (run after touching physics): `node moon-pilot/tools/parity.js`
- Regenerate AI ghosts: `cd rocket-lander && uv run orbit3d.py export`
- Publish to https://surfrgames.github.io/moonpilot-play/ : `bash moon-pilot/tools/deploy-pages.sh "note"`

## Gotchas
- The app's preview tool may serve an old folder. Start the server yourself on the real path
  and open it with `preview_start {url}`.
- Test flights without a visible window: call `MoonPilot.tick(fakeTime)` in a loop from the
  browser console tool; the page throttles real frames when hidden.
- The browser pane caches JS: after editing, run `await Promise.all(['js/game.js','js/world.js'].map(u => fetch(u, {cache: 'reload'}))); location.reload()` before testing.
- Long test flights time out the console tool: run them in `setTimeout` chunks and poll a result variable.
- Store screenshots: `bash moon-pilot/tools/shots.sh` (installed Chrome, headless; the bundled headless shell crashes here).
- Patch big JS files with a small Python script written by the Write tool; long shell heredocs
  containing JS have failed.
- A folder named `vendor` is skipped when the app copies a project; the library lives in `lib/`.
- `git status` after an edit may show less than expected: the owner sometimes commits in between.
