# Moon Pilot backlog

Status key: DONE (built and checked), PART (built, see note), TODO, BLOCKED (needs the owner).
Last updated: 2026-11-11.

## Shipped earlier (all DONE)
Four missions, coach, scoring vs AI ghost, logo, effects, legs, landing panel, AI label, 2D/3D
map, daily challenge (14 AI-flown scenarios), sounds, share button, no-coach bonus, public link.

## Owner's list of 2026-11-11
| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Notes/prompt for Claude so work survives a limit | DONE | `CLAUDE.md` at the repo root + this file |
| 2 | Engine shows thrust at 0% throttle | DONE | exhaust emitter no longer fires at zero throttle |
| 3 | Cannot zoom in after zooming out | DONE | zoom range .004-4000 with a 30 m minimum distance; checked by script |
| 4 | Ground patch looks bad when zoomed out | DONE | ground discs fade by camera height; wide disc fades 35-70 km. Seen once at 20 km zoomed out: no patch |
| 5 | 3D map does not show the orbit | DONE | predicted-orbit line in the 3D scene and 3D map (hidden below ~80 m/s sideways speed) |
| 6 | Time warp up to 100x and custom speeds saved per player | DONE | steps 1,2,4,10,25,50,100; click the speed label for a custom value (saved on the device). Capped at 10x below 1 km on descent |
| 7 | Zoomed-out graphics still weak | PART | 4096 texture, pole-corrected craters, grain. Owner has not judged it yet |
| 8 | Telemetry and trajectory graphs after a flight, with save | DONE | height/speed chart with the AI's height, Save chart (PNG), Save data (JSON). Always recorded; no on/off switch yet |
| 9 | Redesign menu/home page with animation | DONE | new home screen: live rotating Moon, animated title and cards, pilot name, stats |
| 10 | Player names | DONE | name saved on the device, shown on the leaderboard and in share text |
| 11 | Worldwide leaderboard: per mission plus overall average | DONE | Supabase project `moon-pilot` (free, ap-south-1). Per-mission, Today and Overall tabs. Scores post when a pilot name is set. Tested end to end with one scripted flight; test rows deleted |
| 12 | Record players' flight data and store it in the repo for AI training | DONE | opt-in checkbox on the home screen (off by default). `tools/pull_flights.py` copies flights into `rocket-lander/data/flights/` (needs the secret key in an env var). No real player flights collected yet; training on them is not built |
| 13 | Export the video editor project to C:\ and build a Claude skill for it | DONE | `C:\ReelForge` (folders + README) and skill `~/.claude/skills/reel-editor/SKILL.md`. Not yet tried on real footage |
| 15 | Compare-with-AI button on the result screen | DONE | You vs AI table: score, time, fuel, touchdown speeds |
| 16 | Effects when you beat the AI | DONE | confetti, fanfare, glowing panel, title changes |
| 17 | Extra points for finishing without the coach | DONE | +15% (built earlier); a hint now shows when the coach is switched off |
| 14 | Expansion plan | DONE | section below |
| 18 | More planets and a realistic solar-system view | TODO | not started; expansion item 4. Needs per-world physics constants, textures, and AI retraining per world |
| 19 | Build your own rocket, docking, research labs | TODO | future updates; expansion items 2, 3, 5 |
| 20 | Telemetry on/off switch | DONE | checkbox on the home screen, on by default; when off, no chart or save buttons. Not checked in a browser |

## Autopilot session 2026-11-12/13 (goal: players come back; Microsoft Store by Monday 16 Nov)
| Item | Status | Notes |
|---|---|---|
| Real Moon | DONE | NASA LRO colour map (4k desktop, 2k small screens) + height map as bump; drawn Moon is the offline fallback. Credit in `privacy.html` |
| Pilot rank and XP | DONE | level = floor(sqrt(xp/60))+1; rank names every 2 levels; bar on the home screen; kept on the device |
| Achievements | DONE | 16, overlay from the home screen, shown on the result screen when earned |
| Daily streak | DONE | counts consecutive days with a completed daily challenge; bonus XP. Only checked by reading the code |
| Near-miss feedback, Enter to retry | DONE | "So close!" with the exact excess; Enter or R on the result screen flies again |
| Gauntlet mode | DONE | endless landings, harder each round, score = chained points; leaderboard tab; tested for 3 rounds |
| Installable app (PWA) | DONE | `manifest.webmanifest`, `sw.js` (offline cache), maskable icon. Not yet run through PWABuilder |
| Privacy policy | DONE | `www/privacy.html` |
| Store screenshots | DONE | `bash tools/shots.sh` -> `store/*.png` at 1920x1080 using `?shot=` scenes and headless Chrome |
| Microsoft Store guide and listing text | DONE | `docs/MICROSOFT-STORE.md`. Owner must reserve the name, package with PWABuilder and submit |
| Regression | DONE | coach-following robot completed all four missions after these changes (1671 / 1479 / 1676 / 1596) |
| More worlds (#18) | TODO | design notes: parameterise `orbit3d.py` and `physics.js` by body (mu, radius, spin); Europa and Ceres first; ~32 min AI training per world |
| Landing pad targets | TODO | marked pad with a precision bonus |
| Earning inside the Store build | TODO | ads or a supporter purchase; nothing built |

## Backend for #11 and #12 (built 2026-11-11; schema in `tools/backend.sql`, client in `www/js/backend.js`)
- Supabase, free tier. Tables: `scores(id, created_at, player_id uuid, name text<=16, mission text,
  score int, ok bool, seconds real, fuel real, coach bool)`,
  `flights(id, created_at, player_id, mission, ok, score, rows jsonb)` where rows are
  `[t, x,y,z, vx,vy,vz, dx,dy,dz, throttle, mass]` sampled every 1-2 s (state + action pairs for
  imitation learning).
- Views: `leaderboard` = best score per player per mission; `overall` = average of a player's
  best over the four core missions (only players who have all four).
- Row-level security: anonymous insert only, with size limits; read only through the views.
- Client: `www/js/backend.js` with the project URL and publishable key; no key = offline mode.
- Consent: ask once, default off, "Share my flights to help train the AI". Scores post only when
  a pilot name is set. No emails, no accounts.
- Repo copy: `tools/pull_flights.py` downloads new flights to `rocket-lander/data/flights/*.jsonl`.
- Known risks: scores come from the browser, so cheating is possible until flights are replayed
  and checked on the server; no rate limit; no filter on rude pilot names. The two views run with
  the owner's rights on purpose (they expose no player ids); Supabase's advisor will flag that.
- Checked: the public key gets 401 on reading or deleting the tables and 400 on an out-of-range score.

## Expansion plan (after the current list)
1. **Depth in the current game:** landing targets with precision bonus, hard mode, your own
   ghost, live AI opponent running in the browser, real terrain, achievements, photo mode.
2. **Build your own rocket:** parts (tank size, engine thrust and efficiency, legs) that change
   mass and delta-v; the physics already takes these as constants.
3. **Docking and rendezvous:** a target in orbit; needs relative-motion HUD and a new AI skill.
4. **More worlds:** physics constants per body (Mars, Earth with air drag, Europa, Titan) and a
   solar-system map. Each new world needs AI retraining for its ghosts (about 30 minutes each).
5. **Research and labs:** a progression layer; points from missions unlock parts and worlds.
6. **Money:** web-portal ad SDK, Android build with rewarded ads and a one-time unlock,
   supporter pack (skins). See `.agents/product-marketing-context.md`.

## Not verified yet
- 2026-11-11 round: checked with scripted flights at 1280x760 only. Confetti, chart and compare table were seen in one small screenshot. Custom warp prompt, Save buttons and the home screen on a phone were not exercised.
- Performance of the 4096 Moon texture on phones.
- Sounds have not been heard by anyone on the team.
- Phone layout in flight; speed on low-end phones.
- The four-mission robot test has not been rerun since the effects update.
