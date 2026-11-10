// Checks that the game's JavaScript physics matches the Python physics the AI trained on:
// replays the exact controls of one recorded AI flight and compares where the rocket ends up.
//   node tools/parity.js
const P = require("../www/js/physics.js"), fs = require("fs");
const {start, ctl, end} = JSON.parse(fs.readFileSync(__dirname + "/parity.json"));
const s = P.create(start);
for (const [dt, thr, dx, dy, dz] of ctl) { s.d = [dx, dy, dz]; P.step(s, thr, s.d, dt); }
const err = P.len(P.add(s.r, end, -1));
console.log(`${ctl.length} steps over ${Math.round(s.t)} s of flight: end position differs by ${err.toFixed(3)} m`);
process.exit(err < 2 ? 0 : 1);
