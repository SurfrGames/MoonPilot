// Checks that the game's JavaScript physics matches the Python physics the AI trained on:
// replays the exact controls of one recorded AI flight and compares where the rocket ends up.
//   node tools/parity.js
const P = require("../www/js/physics.js"), fs = require("fs");
const world = process.argv[2];                                   // node tools/parity.js [europa|ceres]
const {start, ctl, end, body} = JSON.parse(fs.readFileSync(__dirname + (world ? `/parity-${world}.json` : "/parity.json")));
if (body) P.setBody(body);
const s = P.create(start);
for (const [dt, thr, dx, dy, dz] of ctl) { s.d = [dx, dy, dz]; P.step(s, thr, s.d, dt); }
const err = P.len(P.add(s.r, end, -1));
console.log(`${ctl.length} steps over ${Math.round(s.t)} s of flight: end position differs by ${err.toFixed(3)} m`);
process.exit(err < 2 ? 0 : 1);
