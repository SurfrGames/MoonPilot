# Moon Pilot

A browser game: fly a real-physics Moon rocket and race the ghost of a neural network that
taught itself the same missions. Plain HTML + JavaScript, no build step, works offline.

## Run it
```bash
python -m http.server 8766 --directory www
```
Then open http://localhost:8766.

## Controls
`W`/`S` throttle · `Z` full · `X` cut · `A`/`D` pitch · `Q`/`E` yaw · `1` point up ·
`2` prograde · `3` retrograde · `,`/`.` time warp · drag to look · scroll to zoom.
On a phone: throttle slider and the on-screen buttons.

## Layout
- `www/js/physics.js` — Moon gravity, rocket equation, RK4. A port of `../rocket-lander/orbit3d.py`.
- `www/js/world.js` — the 3D scene (three.js, stored in `www/lib`).
- `www/js/game.js` — missions, controls, HUD, scoring, AI ghost.
- `www/data/ghosts.js` — mission start states and the AI's recorded flights (generated).

## Refresh the AI ghosts (after retraining)
```bash
uv run ../rocket-lander/orbit3d.py export
```

## Check the game physics still matches the AI's physics
```bash
node tools/parity.js
```

## Package for itch.io
Zip the *contents* of `www/` (so `index.html` is at the top of the zip) and upload it as an
HTML game.
