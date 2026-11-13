// Moon Pilot: menus, missions, flight controls, HUD, scoring and the AI ghost race.
(() => {
  const P = Physics, $ = id => document.getElementById(id), DEG = Math.PI / 180;
  const show = (id, on) => $(id).classList.toggle("hide", !on);
  const MISSIONS = [
    {id: "descent", name: "Final Descent", goal: "land", par: 150,
     brief: "You are over a kilometre up and falling. Kill your speed and touch down: under 3 m/s down, 2 m/s sideways, 15° of tilt.",
     steps: ["Press 3 so the engine points against your motion.", "Use W and S to hold the speed the coach asks for.", "Touch down slower than 3 m/s."]},
    {id: "deorbit", name: "Deorbit & Land", goal: "land", par: 1500,
     brief: "You are in orbit at about 1.6 km/s. Point retrograde, brake, come down and land anywhere.",
     steps: ["Press 3, then Z for full throttle to brake out of orbit.", "As you fall, follow the coach's target speed with W and S.", "Slow to under 3 m/s for the last 30 metres."]},
    {id: "launch", name: "Launch to Orbit", goal: "orbit", par: 700,
     brief: "Lift off, tip over toward prograde and build speed until your orbit's low point is above 10 km and its high point below 100 km.",
     steps: ["Press Z to lift off.", "Hold D to tip over toward prograde, to the tilt the coach shows.", "Keep burning until the orbit's low point passes 10 km."]},
    {id: "full", name: "Full Mission", goal: "land", par: 9500,
     brief: "Launch, fly one full orbit (use time warp), then come back down and land. The whole flight the AI learned.",
     steps: ["Launch to orbit as in mission 3, then press X.", "Press . to speed up time for one lap.", "Press 3 and Z to brake, then land as in mission 2."]},
  ].filter(m => window.GHOSTS && GHOSTS[m.id]).map(m => ({...m, ...GHOSTS[m.id]}));
  const DAY = Math.floor(Date.now() / 864e5);              // days since 1970; 20767 was 10 Nov 2026
  if (window.GHOSTS && GHOSTS.daily && GHOSTS.daily.length && MISSIONS.length) {
    const d = GHOSTS.daily[DAY % GHOSTS.daily.length], high = P.len(d.start.r) - P.R > 2500;
    MISSIONS.unshift({id: "daily-" + DAY, daily: true, name: "Daily Challenge #" + (DAY - 20766), goal: "land", par: Math.round(d.ai.t * 1.3),
      brief: (high ? "Today's flight starts high and fast. Brake hard, then land softly." : "Today's flight starts low over the surface. Stop your drift and land softly.") + " A new challenge arrives every day.",
      steps: MISSIONS[0].steps, ...d});
  }
  // Gauntlet: endless landings that get harder; no AI here, the run length is the score
  if (MISSIONS.length && GHOSTS.descent) MISSIONS.push({id: "gauntlet", gauntlet: true, noGhost: true, name: "Gauntlet", goal: "land", par: 120,
    brief: "Land again and again. Every landing starts higher, faster and with less fuel. One crash ends the run. How many can you chain?",
    steps: ["Each round: brake, stop your drift, touch down under 3 m/s.", "Soft landings and spare fuel score more.", "Your best run goes on the worldwide leaderboard."],
    start: GHOSTS.descent.start, rows: [[0, 0, 0, 0, 0, 0, 1, 0, 2, 0, 0, 0, 0]], ai: {ok: false, text: "", t: 0, fuel: 0, sev: 0}});
  let gaunt = {round: 0, total: 0}, nextRound = false;
  function gauntletStart(k) {
    const b = GHOSTS.descent.start, er = P.unit(b.r), et = P.unit(P.cross(b.nrm, er)), ec = P.cross(er, et);
    const rnd = (a, c) => a + Math.random() * (c - a), side = Math.random() < .5 ? -1 : 1;
    const h = Math.min(3000, (350 + 220 * k) * rnd(.85, 1.15)), vr = -Math.min(60, (4 + 3.5 * k) * rnd(.8, 1.2));
    const vt = side * Math.min(150, (6 + 9 * k) * rnd(.8, 1.2)), vc = Math.min(40, 3 * k) * rnd(-1, 1);
    const r = P.mul(er, P.R + h), vrel = P.add(P.add(P.mul(er, vr), et, vt), ec, vc);
    return {r, v: P.add(vrel, [-P.OMEGA * r[1], P.OMEGA * r[0], 0]), d: er, nrm: b.nrm, phase: P.DESCENT, theta: P.TAU, onPad: false,
            m: P.M_DRY + (P.M_WET - P.M_DRY) * Math.max(.035, .2 - .014 * k) * rnd(.95, 1.05)};
  }

  let best = {}, pilot = "";
  try { pilot = localStorage.getItem("moonpilot.name") || ""; } catch (e) {}
  try { best = JSON.parse(localStorage.getItem("moonpilot.best") || "{}"); } catch (e) {}
  const saveBest = () => { try { localStorage.setItem("moonpilot.best", JSON.stringify(best)); } catch (e) {} };

  // ---- scoring: the same formula for the player and the AI ----
  function score(m, r) {
    if (!r.ok) return {total: Math.round(300 * (r.progress || 0)), parts: [["Progress", Math.round(300 * (r.progress || 0))]]};
    const parts = [["Mission complete", 1000], ["Fuel left (" + Math.round(r.fuel * 100) + "%)", Math.round(1000 * r.fuel)]];
    if (m.goal === "land") parts.push(["Soft touchdown", Math.round(500 * (1 - Math.min(1, r.sev)))]);
    parts.push(["Speed", Math.round(300 * P.clamp(1.5 - r.t / m.par, 0, 1))]);
    if (r.noCoach) parts.push(["Flown without the coach", Math.round(.15 * parts.reduce((a, p) => a + p[1], 0))]);
    return {total: parts.reduce((a, p) => a + p[1], 0), parts};
  }
  const aiScore = m => score(m, m.ai).total;
  const clock = t => { const s = Math.round(t), h = Math.floor(s / 3600), mi = Math.floor(s / 60) % 60; return (h ? h + ":" + String(mi).padStart(2, "0") : mi) + ":" + String(s % 60).padStart(2, "0"); };
  const dist = h => Math.abs(h) < 2000 ? h.toFixed(0) + " m" : (h / 1000).toFixed(1) + " km";

  // ---- menu ----
  function menu() {
    state = "menu"; ["hud", "top", "pad", "brief", "result", "coach", "map", "land", "aimark"].forEach(id => show(id, false)); show("menu", true); audio(0);
    $("cards").innerHTML = ""; renderProfile();
    const flown = MISSIONS.filter(m => best[m.id]);
    $("stats").textContent = flown.length ? `${flown.length} of ${MISSIONS.length} flown · total score ${flown.reduce((a, m) => a + best[m.id], 0)}` : "No flights yet. Start with Final Descent.";
    MISSIONS.forEach((m, i) => {
      const b = document.createElement("button"); b.className = m.daily ? "card daily" : "card"; b.style.animationDelay = (.3 + i * .07) + "s";
      b.innerHTML = `<b>${m.daily || m.gauntlet ? "" : MISSIONS.filter(x => !x.daily).indexOf(m) + 1 + ". "}${m.name}</b><span>${best[m.id] ? "Your best " + best[m.id] : "Not flown yet"} · ` +
        (m.gauntlet ? `<span class="ai">endless</span>` : m.ai.ok ? `<span class="ai">AI ${aiScore(m)}</span>` : `<span class="ai">AI failed this one</span>`) + `</span>`;
      b.onclick = () => brief(i); $("cards").appendChild(b);
    });
    if (!MISSIONS.length) $("cards").textContent = "No missions found. Run the AI export first.";
  }
  function brief(i) {
    mi = i; const m = MISSIONS[i];
    show("menu", false); show("result", false); show("brief", true);
    $("bname").textContent = m.name; $("btext").textContent = m.brief;
    $("bsteps").innerHTML = m.steps.map(t => `<li>${t}</li>`).join("");
    $("bai").textContent = m.gauntlet ? (best.gauntlet ? `Your best run scored ${best.gauntlet}.` : "No AI here: just you and the ground.") : m.ai.ok ? `The AI scored ${aiScore(m)} in ${clock(m.ai.t)} with ${Math.round(m.ai.fuel * 100)}% fuel left.`
                                   : `The AI did not manage this one (${m.ai.text.toLowerCase()}). Can you?`;
  }

  // ---- flight ----
  let state = "menu", mi = 0, S = null, Q = null, gi = 0, endTimer = 0, last = performance.now();
  const ctl = {thr: 0, pitch: 0, yaw: 0, hold: "up", warp: 1}, keys = {}, WARPS = [1, 2, 4, 10, 25, 50, 100];
  function addWarp(x) { x = Math.round(P.clamp(+x || 0, 0, 100)); if (x >= 1 && !WARPS.includes(x)) { WARPS.push(x); WARPS.sort((a, b) => a - b); } return x >= 1 ? x : 0; }
  try { JSON.parse(localStorage.getItem("moonpilot.warps") || "[]").forEach(addWarp); } catch (e) {}
  function start(next) {
    const m = MISSIONS[mi];
    if (m.gauntlet) { if (!next) gaunt = {round: 0, total: 0}; m.start = gauntletStart(gaunt.round); m.rows = [[0, ...m.start.r, ...m.start.d, 0, 2, 0, 0, 0, 0]]; }
    S = P.create(m.start); Q = P.derive(S); gi = 0; endTimer = 0; lastTip = null; coachUsed = false; legs = m.start.onPad ? 1 : 0; gear = null; fxEvent = null; paused = false; pts = []; lastPt = -1e9; tel = []; telAt = -1e9; rec = []; recAt = -1e9;
    Object.assign(ctl, {thr: 0, pitch: 0, yaw: 0, warp: 1, hold: m.start.phase === P.DESCENT ? "retro" : "up"});
    World.setMission(m.start, m.rows); $("confetti").innerHTML = "";
    ["menu", "brief", "result"].forEach(id => show(id, false)); ["hud", "top", "pad"].forEach(id => show(id, true));
    $("mname").textContent = m.name; state = "fly"; toast(m.goal === "orbit" ? "Throttle up to lift off" : "Good luck");
  }
  function toast(text) { const t = $("toast"); t.textContent = text; t.style.opacity = 1; clearTimeout(toast.h); toast.h = setTimeout(() => t.style.opacity = 0, 2600); }

  function command() {                                   // where the player wants the rocket to point
    if (ctl.hold === "up") return Q.er;
    if (ctl.hold !== "manual") { const sp = P.len(Q.vrel); return sp < 1 ? Q.er : P.mul(Q.vrel, (ctl.hold === "pro" ? 1 : -1) / sp); }
    const cp = Math.cos(ctl.pitch), sp = Math.sin(ctl.pitch), cy = Math.cos(ctl.yaw), sy = Math.sin(ctl.yaw);
    return P.unit(P.add(P.add(P.mul(Q.er, cp * cy), Q.et, sp * cy), Q.ec, sy));
  }
  function manual() {                                    // take over from a hold mode without a jump
    if (ctl.hold === "manual") return;
    ctl.pitch = Math.atan2(P.dot(S.d, Q.et), P.dot(S.d, Q.er)); ctl.yaw = Math.asin(P.clamp(P.dot(S.d, Q.ec), -1, 1)); ctl.hold = "manual";
  }
  // ---- gamepad (Xbox layout): triggers throttle, left stick pitch, right stick yaw, A retrograde, B up,
  //      X prograde, Y cut engine, bumpers time warp, Start pause. A on the result screen flies again. ----
  let padPrev = [];
  function padState() {
    const g = navigator.getGamepads ? [...navigator.getGamepads()].find(x => x && x.connected) : null;
    if (!g) return null;
    const now = g.buttons.map(b => b.pressed);
    return {g, hit: i => now[i] && !padPrev[i], done: () => { padPrev = now; }};
  }
  function gamepad(dt) {
    const p = padState(); if (!p) return;
    const g = p.g, ax = i => Math.abs(g.axes[i] || 0) > .2 ? g.axes[i] : 0, val = i => g.buttons[i] ? g.buttons[i].value : 0;
    if (val(7) || val(6)) ctl.thr = P.clamp(ctl.thr + (val(7) - val(6)) * .9 * dt, 0, 1);
    if (ax(0)) { manual(); ctl.pitch += ax(0) * 35 * DEG * dt; }
    if (ax(2)) { manual(); ctl.yaw = P.clamp(ctl.yaw + ax(2) * 25 * DEG * dt, -60 * DEG, 60 * DEG); }
    if (p.hit(0)) ctl.hold = "retro"; if (p.hit(1)) ctl.hold = "up"; if (p.hit(2)) ctl.hold = "pro"; if (p.hit(3)) ctl.thr = 0;
    if (p.hit(5)) warp(1); if (p.hit(4)) warp(-1); if (p.hit(9)) paused = !paused;
    p.done();
  }
  function input(dt) {
    if (keys.w) ctl.thr = Math.min(1, ctl.thr + .7 * dt);
    if (keys.s) ctl.thr = Math.max(0, ctl.thr - .7 * dt);
    if (keys.z) ctl.thr = 1;
    if (keys.x) ctl.thr = 0;
    if (keys.a || keys.d) { manual(); ctl.pitch += (keys.d ? 1 : -1) * 35 * DEG * dt; }
    if (keys.q || keys.e) { manual(); ctl.yaw = P.clamp(ctl.yaw + (keys.e ? 1 : -1) * 25 * DEG * dt, -60 * DEG, 60 * DEG); }
  }
  function ghostAt(m, t) {
    const rows = m.rows, end = rows.length - 1;
    while (gi < end - 1 && rows[gi + 1][0] <= t) gi++;
    const a = rows[gi], b = rows[Math.min(gi + 1, end)], f = b[0] > a[0] ? P.clamp((t - a[0]) / (b[0] - a[0]), 0, 1) : 0;
    const mix = k => a[k] + (b[k] - a[k]) * f;
    return {r: [mix(1), mix(2), mix(3)], d: [mix(4), mix(5), mix(6)], thr: t > rows[end][0] ? 0 : b[7], h: mix(9), i: gi,
            visible: t <= rows[end][0] + 4, done: t > rows[end][0]};
  }

  function frame(now) { requestAnimationFrame(frame); tick(now); }
  function tick(now) {
    const real = Math.max(0, Math.min(.05, (now - last) / 1000)); last = now;
    if (state === "menu") return World.attract(now / 1000);
    if (state === "result") { const p = padState(); if (p) { const again = p.hit(0); p.done(); if (again) return start(); } }
    if (state !== "fly" && state !== "ending") return;
    const m = MISSIONS[mi];
    if (state === "fly") gamepad(real);
    if (state === "fly" && !paused) {
      input(real);
      const maxWarp = S.phase === P.DESCENT && Q.h < 1000 ? 10 : 100;   // full range except on final approach
      if (ctl.warp > maxWarp) ctl.warp = maxWarp;
      let left = real * ctl.warp;
      const sub = ctl.thr > 0 || Q.h < 3000 ? .05 * Math.min(ctl.warp, 2) : Math.min(2, .05 * ctl.warp);
      while (left > 1e-9 && state === "fly") {
        const dt = Math.min(sub, left); left -= dt;
        P.step(S, ctl.thr, command(), dt); Q = P.derive(S);
        const ev = P.rules(S, Q);
        if (ev === "orbit") { if (m.goal === "orbit") finish(true); else toast("In orbit! Cut the engine and fly one full lap"); }
        else if (ev === "rev") { ctl.warp = 1; ctl.hold = "retro"; toast("One orbit flown. Now brake and land"); }
        else if (ev) finish(ev === "landed");
      }
    } else if (state === "ending" && (endTimer -= real) <= 0) { if (nextRound) { nextRound = false; return start(true); } return results(); }
    const g = ghostAt(m, S.t); if (m.noGhost) g.visible = false;
    World.update(S, Q, g, {dt: paused ? 0 : real, legs, event: fxEvent}); fxEvent = null;
    overlay(m, g, paused ? 0 : real); hud(m, g); audio(state === "fly" && !paused ? S.thr : 0); if (state === "fly") warnings();
  }

  // ---- flight coach: one plain instruction for the current moment ----
  let coachOn = true, lastTip = null, coachUsed = false;
  try { coachOn = localStorage.getItem("moonpilot.coach") !== "off"; } catch (e) {}
  const landingSpeed = h => h < 2000 ? Math.max(1.5, h / 10) : .9 * Math.sqrt(5 * h);     // safe speed for a height
  function climbTilt() {                                    // tilt that holds a steady climb to 20 km while building speed
    const r = P.R + Math.max(Q.h, 0), geff = P.MU / (r * r) - Q.vt * Q.vt / r, vrT = P.clamp((20000 - Q.h) / 40, -50, 80);
    return Math.acos(P.clamp((geff + .15 * (vrT - Q.vr)) / (P.THRUST / S.m), 0, 1)) / DEG;
  }
  function advice() {
    const sp = Math.hypot(Q.vr, Q.vh);
    if (Q.fuel <= 0) return "Out of fuel";
    if (S.phase === P.ASCENT) {
      if (S.onPad) return "Press Z (or push the throttle up) to lift off";
      if (ctl.thr < .95) return "Keep full throttle: press Z";
      const want = climbTilt(), have = (ctl.hold === "manual" ? ctl.pitch : Math.atan2(P.dot(S.d, Q.et), P.dot(S.d, Q.er))) / DEG;
      if (Math.abs(want - have) <= 6) return want < 6 ? "Climb straight up" : `Good. Hold about ${want.toFixed(0)}° of tilt until the orbit's low point passes 10 km`;
      return want > have ? `Tip over toward prograde: hold D to ${want.toFixed(0)}° of tilt (now ${have.toFixed(0)}°)`
                         : `Too flat: hold A back to ${want.toFixed(0)}° of tilt (now ${have.toFixed(0)}°)`;
    }
    if (S.phase === P.COAST) return ctl.thr > 0 ? "You are in orbit: cut the engine with X" : ctl.warp < 25 ? "Coast one lap. Press . to speed up time" : "Coasting. The landing starts after one lap";
    const target = landingSpeed(Math.max(Q.h, 0)), aim = `${target.toFixed(target < 10 ? 1 : 0)} m/s`;
    if (ctl.hold !== "retro" && sp > 5) return "Press 3 to point the engine against your motion";
    if (Q.h < 30) return "Almost down: under 3 m/s and upright";
    if (sp > target * 1.15) return `Too fast for this height: more throttle (W). Aim for ${aim}`;
    if (sp < target * .7) return ctl.thr > .02 ? `Slower than you need: ease off (S). Aim for ${aim}` : `Falling is fine. Start braking when your speed reaches ${aim}`;
    return `On track: hold about ${aim}`;
  }

  function hud(m, g) {
    const tip = coachOn && state === "fly" ? advice() : "";
    if (tip) coachUsed = true;
    if (tip !== lastTip) { $("coach").textContent = lastTip = tip; show("coach", !!tip); }
    const low = S.phase === P.DESCENT && Q.h < 300;
    $("goal").textContent = m.gauntlet ? `Landing ${gaunt.round + 1} · ${gaunt.total} pts` : m.goal === "orbit" || S.phase === P.ASCENT ? "Reach orbit: low point above 10 km"
      : S.phase === P.COAST ? `Coast one lap: ${Math.round(100 * S.theta / P.TAU)}%` : "Land softly";
    $("t").textContent = clock(S.t); $("h").textContent = dist(Math.max(0, Q.h));
    $("vr").textContent = (Q.vr > 0 ? "+" : "") + Q.vr.toFixed(1) + " m/s"; $("vr").className = low ? (Q.vr < -3 ? "warn" : "ok") : "";
    $("vh").textContent = Q.vh.toFixed(Q.vh < 100 ? 1 : 0) + " m/s"; $("vh").className = low ? (Q.vh > 2 ? "warn" : "ok") : "";
    $("fuel").textContent = Math.round(Q.fuel * 100) + "%"; $("fuel").className = Q.fuel < .1 ? "warn" : "";
    $("orb").textContent = Q.apo > 1e7 ? "escape" : `${Math.max(Q.apo / 1000, 0).toFixed(0)} / ${Q.peri < 0 ? "ground" : (Q.peri / 1000).toFixed(0) + " km"}`;
    $("tilt").textContent = (Q.tilt / DEG).toFixed(0) + "°"; $("tilt").className = low ? (Q.tilt > 15 * DEG ? "warn" : "ok") : "";
    $("aih").textContent = m.noGhost ? "none here" : g.done ? (m.ai.ok ? "finished " + clock(m.ai.t) : "failed") : dist(P.len(P.add(g.r, S.r, -1))) + " away";
    $("thr").value = Math.round(ctl.thr * 100); $("thrv").textContent = Math.round(S.thr * 100) + "%"; $("warp").textContent = ctl.warp + "×";
    document.querySelectorAll("[data-hold]").forEach(b => b.classList.toggle("on", b.dataset.hold === ctl.hold));
  }

  // ---- landing legs, AI marker, landing instruments, map ----
  let legs = 1, gear = null, fxEvent = null, paused = false, mapMode = "2d", pts = [], lastPt = -1e9, frameNo = 0, tel = [], telAt = -1e9, rec = [], recAt = -1e9, sharing = false, telOn = true;
  try { mapMode = localStorage.getItem("moonpilot.map") || "2d"; } catch (e) {}
  const landC = $("land").getContext("2d"), mapC = $("map2d").getContext("2d");
  function overlay(m, g, real) {
    const flying = state === "fly";
    if (sharing && flying && S.t - recAt >= (Q.h < 3000 ? 1 : 2)) {   // state and controls, only when the player shares flights
      rec.push([+S.t.toFixed(1), ...S.r.map(x => +x.toFixed(1)), ...S.v.map(x => +x.toFixed(2)), ...S.d.map(x => +x.toFixed(3)), +S.thr.toFixed(2), Math.round(S.m)]); recAt = S.t;
    }
    if (telOn && (S.t - telAt >= (Q.h < 3000 ? .5 : 2) || !flying && telAt < S.t)) { tel.push([+S.t.toFixed(2), +Q.h.toFixed(1), +Math.hypot(Q.vr, Q.vh).toFixed(2), +Q.vr.toFixed(2), +S.thr.toFixed(2), +Q.fuel.toFixed(4)]); telAt = S.t; }
    // legs come down on the pad and for landing, fold away in flight (G overrides)
    const want = gear !== null ? gear : (S.onPad || (S.phase === P.DESCENT && Q.h < 1500) || (S.phase === P.ASCENT && Q.h < 60)) ? 1 : 0;
    legs += P.clamp(want - legs, -real / 1.1, real / 1.1);

    // a label on the AI ghost; it slides to the screen edge when the ghost is out of view
    if (g.visible && flying) {
      const d = P.len(P.add(g.r, S.r, -1)), sp = World.project(g.r), W = innerWidth, H = innerHeight;
      let x = sp.front ? sp.x : W - sp.x, y = sp.front ? sp.y : H - sp.y;
      const off = !sp.front || x < 40 || x > W - 40 || y < 70 || y > H - 70;
      if (off) { const k = Math.min((W / 2 - 50) / Math.abs(x - W / 2 || 1), (H / 2 - 80) / Math.abs(y - H / 2 || 1)); x = W / 2 + (x - W / 2) * k; y = H / 2 + (y - H / 2) * k; }
      const am = $("aimark"); am.textContent = (off ? "◆ AI " : "AI ") + dist(d); am.style.left = x + "px"; am.style.top = (y - (off ? 0 : 28)) + "px";
      show("aimark", d > 15);
    } else show("aimark", false);

    // landing instruments: down speed against the safe band, height, and sideways drift
    const landing = flying && S.phase === P.DESCENT && Q.h < 3000; show("land", landing);
    if (landing) {
      const c = landC, yv = v => 10 + (5 - P.clamp(v, -25, 5)) * 3, bad = "#ff6b6b", good = "#7fe38b", dim = "#8fa0b8";
      c.setTransform(2, 0, 0, 2, 0, 0); c.clearRect(0, 0, 220, 110);
      c.fillStyle = "rgba(12,18,28,.86)"; c.fillRect(0, 0, 220, 110);
      c.fillStyle = "#1b2536"; c.fillRect(14, 10, 12, 90); c.fillStyle = "#2f8f4e"; c.fillRect(14, yv(0), 12, yv(-3) - yv(0));
      c.fillStyle = Q.vr < -3 ? bad : good; c.fillRect(8, yv(Q.vr) - 2, 24, 4);
      c.font = "10px system-ui"; c.fillStyle = dim; c.fillText("DOWN SPEED", 40, 20); c.fillText("HEIGHT", 40, 64);
      c.font = "600 18px system-ui"; c.fillStyle = Q.vr < -3 ? bad : good; c.fillText(Math.max(0, -Q.vr).toFixed(1) + " m/s", 40, 41);
      c.fillStyle = "#e6edf7"; c.fillText(dist(Math.max(0, Q.h)), 40, 85);
      const cx = 172, cy = 48, sc = 3.6, sl = Math.max(Q.vh, 1e-6), kk = Math.min(1, 10 / sl);
      c.strokeStyle = "#3a4a66"; c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, 36, 0, 7); c.moveTo(cx - 36, cy); c.lineTo(cx + 36, cy); c.moveTo(cx, cy - 36); c.lineTo(cx, cy + 36); c.stroke();
      c.strokeStyle = "#2f8f4e"; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, 2 * sc, 0, 7); c.stroke();
      c.fillStyle = Q.vh > 2 ? bad : good; c.beginPath(); c.arc(cx + Q.vc * kk * sc, cy - Q.vt * kk * sc, 4, 0, 7); c.fill();
      c.font = "10px system-ui"; c.fillStyle = dim; c.fillText("SIDEWAYS " + Q.vh.toFixed(1) + " m/s", cx - 46, 102);
    }

    // map: 2D drawing or a 3D view rendered by the world into the same corner
    const mapOn = mapMode !== "off" && (flying || state === "ending");
    show("map", mapOn); $("map").classList.toggle("three", mapMode === "3d"); World.map.on = mapOn && mapMode === "3d";
    if (World.map.on) { const b = $("map").getBoundingClientRect(); World.map.rect = [b.left, b.top, b.width, b.height]; }
    if (S.t - lastPt > 4) { pts.push(S.r.slice()); lastPt = S.t; if (pts.length > 5000) pts.splice(0, 2); }
    if (mapOn && mapMode === "2d" && frameNo++ % 4 === 0) drawMap(m, g);
  }
  function drawMap(m, g) {                                  // looking down on the flight plane; heights are stretched 10x
    const c = mapC, EX = 10, k = 92 / (P.R + EX * 120e3), cx = 100, cy = 100;
    const p0 = P.unit(m.start.r), q0 = P.cross(m.start.nrm, p0);
    const pr = r => { const x = P.dot(r, p0), y = P.dot(r, q0), rm = Math.hypot(x, y) || 1, rr = (P.R + EX * Math.max(P.len(r) - P.R, 0)) * k; return [cx + x / rm * rr, cy - y / rm * rr]; };
    const path = (list, color, w) => { c.strokeStyle = color; c.lineWidth = w; c.beginPath(); list.forEach((r, i) => { const [x, y] = pr(r); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); };
    const dot = (r, color, rad) => { const [x, y] = pr(r); c.fillStyle = color; c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill(); };
    c.setTransform(2, 0, 0, 2, 0, 0); c.clearRect(0, 0, 200, 200);
    c.fillStyle = "#2b3242"; c.strokeStyle = "#5a6478"; c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, P.R * k, 0, 7); c.fill(); c.stroke();
    c.setLineDash([2, 3]); c.strokeStyle = "rgba(127,227,139,.55)"; c.beginPath(); c.arc(cx, cy, (P.R + EX * P.PERI_MIN) * k, 0, 7); c.stroke(); c.setLineDash([]);
    const hv = P.cross(S.r, S.v), hm = P.len(hv), rm = P.len(S.r);
    if (hm > 1e6) {                                         // the path you are on if you do nothing
      const ev = P.add(P.mul(P.cross(S.v, hv), 1 / P.MU), S.r, -1 / rm), e = P.len(ev), sl = hm * hm / P.MU;
      const a1 = e > 1e-4 ? P.mul(ev, 1 / e) : P.mul(S.r, 1 / rm), a2 = P.unit(P.cross(hv, a1)); let seg = [];
      for (let i = 0; i <= 120; i++) {
        const th = i / 120 * P.TAU, r = sl / (1 + e * Math.cos(th));
        if (r > P.R && r < P.R + 400e3) seg.push(P.add(P.mul(a1, r * Math.cos(th)), a2, r * Math.sin(th)));
        else { path(seg, "rgba(255,180,84,.5)", 1); seg = []; }
      }
      path(seg, "rgba(255,180,84,.5)", 1);
    }
    path(m.rows.filter((_, i) => i % 3 === 0 && i <= gi + 3).map(r => [r[1], r[2], r[3]]), "rgba(89,194,255,.75)", 1);
    path(pts, "#ffb454", 1.6);
    if (g.visible) dot(g.r, "#59c2ff", 3);
    dot(S.r, "#ffffff", 3.2);
    c.fillStyle = "#8fa0b8"; c.font = "9px system-ui"; c.fillText("You: white   AI: blue   height x10", 6, 194);
  }

  // ---- telemetry: recorded during the flight, drawn on the result screen, saved on request ----
  function drawChart(m) {
    const c = $("chart").getContext("2d"), W = 520, H = 180, L = 46, B = 22, T = 14, Rt = 50;
    c.setTransform(2, 0, 0, 2, 0, 0); c.clearRect(0, 0, W, H); c.fillStyle = "rgba(8,12,20,.92)"; c.fillRect(0, 0, W, H);
    if (tel.length < 2) return;
    const tMax = Math.max(tel[tel.length - 1][0], 1), ai = m.rows.filter(r => r[0] <= tMax);
    const hMax = Math.max(1, ...tel.map(p => p[1]), ...ai.map(r => r[9])), vMax = Math.max(1, ...tel.map(p => p[2]));
    const X = t => L + (W - L - Rt) * t / tMax, Yh = h => H - B - (H - B - T) * Math.max(h, 0) / hMax, Yv = v => H - B - (H - B - T) * v / vMax;
    const line = (pts, color, dash) => { c.strokeStyle = color; c.lineWidth = 1.6; c.setLineDash(dash || []); c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke(); c.setLineDash([]); };
    c.font = "10px system-ui"; c.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = T + (H - B - T) * i / 4;
      c.strokeStyle = "#1f2a3d"; c.beginPath(); c.moveTo(L, y); c.lineTo(W - Rt, y); c.stroke();
      c.fillStyle = "#ffb454"; c.textAlign = "right"; c.fillText(dist(hMax * (1 - i / 4)), L - 5, y + 3);
      c.fillStyle = "#e6edf7"; c.textAlign = "left"; c.fillText((vMax * (1 - i / 4)).toFixed(0) + " m/s", W - Rt + 5, y + 3);
    }
    c.fillStyle = "#8fa0b8"; c.textAlign = "left"; c.fillText("0:00", L, H - 6); c.textAlign = "right"; c.fillText(clock(tMax), W - Rt, H - 6);
    c.textAlign = "center"; c.fillText("height: you (orange), AI (blue dashes)   speed: white", (L + W - Rt) / 2, H - 6); c.textAlign = "left";
    line(ai.map(r => [X(r[0]), Yh(r[9])]), "#59c2ff", [4, 3]);
    line(tel.map(p => [X(p[0]), Yh(p[1])]), "#ffb454");
    line(tel.map(p => [X(p[0]), Yv(p[2])]), "#e6edf7");
  }
  function download(name, href) { const a = document.createElement("a"); a.download = name; a.href = href; document.body.appendChild(a); a.click(); a.remove(); }

  function celebrate() {                                    // you beat the AI: fanfare and confetti
    beep(523, .18, .09); beep(659, .18, .09, "sine", .16); beep(784, .22, .09, "sine", .32); beep(1047, .55, .1, "sine", .5);
    const box = $("confetti"); box.innerHTML = "";
    for (let i = 0; i < 110; i++) {
      const s = document.createElement("i");
      s.style.cssText = `left:${Math.random() * 100}%;background:${["#ffb454", "#59c2ff", "#e6edf7", "#7fe38b"][i % 4]};animation-delay:${Math.random() * .9}s;animation-duration:${2.2 + Math.random() * 1.8}s`;
      box.appendChild(s);
    }
    setTimeout(() => { box.innerHTML = ""; }, 5200);
  }

  // ---- worldwide leaderboard ----
  const esc = s => String(s).replace(/[<>&"']/g, "");
  function board(which) {
    show("board", true);
    $("btabs").innerHTML = "";
    [["overall", "Overall"], ...MISSIONS.map(m => [m.id, m.daily ? "Today" : m.name])].forEach(([id, label]) => {
      const b = document.createElement("button"); b.textContent = label; b.className = id === which ? "on" : ""; b.onclick = () => board(id); $("btabs").appendChild(b);
    });
    $("bnote").textContent = which === "overall" ? "Average of each pilot's best score across the four main missions. Fly all four to appear here." : "Best score per pilot. A star means flown without the coach.";
    $("btable").innerHTML = "<tr><td>Loading...</td></tr>";
    (which === "overall" ? Backend.overall() : Backend.top(which)).then(rows => {
      $("btable").innerHTML = !rows ? "<tr><td>Could not reach the leaderboard.</td></tr>" : !rows.length ? "<tr><td>No scores yet. Be the first.</td></tr>"
        : rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}${r.coach === false ? " ★" : ""}</td><td>${r.score}</td></tr>`).join("");
    });
  }

  // ---- progression: experience, rank, daily streak, achievements (all kept on this device) ----
  const RANKS = ["Cadet", "Trainee", "Pilot", "Senior Pilot", "Captain", "Commander", "Flight Director", "Legend"];
  const ACH = [["first", "First footprint", "Land softly once"], ["beat", "Machine beaten", "Beat the AI on any mission"],
    ["feather", "Feather touch", "Touch down slower than 0.5 m/s"], ["nocoach", "No hand-holding", "Finish a mission with the coach off"],
    ["orbit", "Orbital", "Reach orbit"], ["full", "There and back", "Complete the Full Mission"], ["miser", "Fuel miser", "Land with a quarter of your fuel left"],
    ["hotdrop", "Hot drop", "Land Final Descent in under a minute"], ["sweep", "Clean sweep", "Beat the AI on all four main missions"],
    ["roll5", "On a roll", "Chain 5 landings in the Gauntlet"], ["roll10", "Untouchable", "Chain 10 landings in the Gauntlet"],
    ["streak3", "Regular", "Fly the daily challenge 3 days running"], ["streak7", "Devoted", "Fly the daily challenge 7 days running"],
    ["flyer", "Frequent flyer", "Finish 25 flights"], ["captain", "Captain", "Reach the rank of Captain"], ["litho", "Lithobraking", "Hit the ground at over 100 m/s"]];
  const prof = {xp: 0, ach: {}, streak: 0, lastDay: 0, flights: 0};
  try { Object.assign(prof, JSON.parse(localStorage.getItem("moonpilot.profile") || "{}")); } catch (e) {}
  const level = xp => Math.floor(Math.sqrt(xp / 60)) + 1, rankName = l => RANKS[Math.min(RANKS.length - 1, Math.floor((l - 1) / 2))];
  function renderProfile() {
    const l = level(prof.xp), lo = 60 * (l - 1) ** 2, hi = 60 * l ** 2;
    $("rname").textContent = `${rankName(l)} · level ${l}`; $("rxp").textContent = `${prof.xp} / ${hi} XP`; $("rbar").style.width = (100 * (prof.xp - lo) / (hi - lo)) + "%";
    $("achb").textContent = `Achievements ${Object.keys(prof.ach).length}/${ACH.length}`;
    $("streak").textContent = prof.streak > 1 && DAY - prof.lastDay <= 1 ? `${prof.streak}-day streak on the daily challenge` : "";
  }
  function showAch() {
    show("achs", true);
    $("achlist").innerHTML = ACH.map(a => `<div class="ach${prof.ach[a[0]] ? " got" : ""}"><b>${a[1]}</b><span>${a[2]}</span></div>`).join("");
  }
  function progress(m, sc, o, beat) {
    const before = level(prof.xp), got = [], add = id => { if (!prof.ach[id]) { prof.ach[id] = DAY; got.push(ACH.find(a => a[0] === id)[1]); } };
    const landed = o.ok && m.goal === "land" && !m.gauntlet;
    let xp = m.gauntlet ? Math.round(gaunt.total / 8) + 5 : o.ok ? Math.round(sc.total / 10) : 8;
    prof.flights++;
    if (m.daily && o.ok && prof.lastDay !== DAY) { prof.streak = prof.lastDay === DAY - 1 ? prof.streak + 1 : 1; prof.lastDay = DAY; xp += 20 * Math.min(prof.streak, 7); }
    if (landed || m.gauntlet && gaunt.round) add("first");
    if (beat) add("beat");
    if (landed && Math.abs(o.vr) < .5) add("feather");
    if (o.ok && o.noCoach) add("nocoach");
    if (o.ok && m.goal === "orbit") add("orbit");
    if (o.ok && m.id === "full") add("full");
    if (landed && o.fuel >= .25) add("miser");
    if (landed && m.id === "descent" && o.t < 60) add("hotdrop");
    if (prof.streak >= 3) add("streak3");
    if (prof.streak >= 7) add("streak7");
    if (m.gauntlet && gaunt.round >= 5) add("roll5");
    if (m.gauntlet && gaunt.round >= 10) add("roll10");
    if (!o.ok && o.why === "crashed" && Math.hypot(o.vr, o.vh) > 100) add("litho");
    if (prof.flights >= 25) add("flyer");
    if (["descent", "deorbit", "launch", "full"].every(id => { const x = MISSIONS.find(y => y.id === id); return x && x.ai.ok && best[id] > aiScore(x); })) add("sweep");
    prof.xp += xp;
    const after = level(prof.xp);
    if (after >= 9) add("captain");
    try { localStorage.setItem("moonpilot.profile", JSON.stringify(prof)); } catch (e) {}
    if (m.gauntlet) $("rtable").innerHTML = sc.parts.map(p => `<tr><td>${p[0]}</td><td>${p[1]}</td></tr>`).join("") + `<tr><td>Best run</td><td>${Math.max(best.gauntlet || 0, sc.total)}</td></tr>`;
    if (m.gauntlet) $("rtitle").textContent = gaunt.round ? `Gauntlet over: ${gaunt.round} landing${gaunt.round > 1 ? "s" : ""} in a row` : "Gauntlet over";
    else if (m.goal === "land" && !o.ok && o.why === "crashed" && o.sev < 2.5) {      // a near miss deserves to hear how near
      const over = [];
      if (Math.abs(o.vr) > 3) over.push(`${(Math.abs(o.vr) - 3).toFixed(1)} m/s too fast`);
      if (o.vh > 2) over.push(`${(o.vh - 2).toFixed(1)} m/s too much drift`);
      if (o.tilt > 15) over.push(`${(o.tilt - 15).toFixed(0)}° too tilted`);
      $("rtitle").textContent = "So close!"; $("rtext").textContent = "Only " + over.join(" and ") + ". Press Enter to try again.";
    }
    show("cmpb", !m.noGhost);
    $("rxpline").textContent = `+${xp} XP` + (after > before ? ` · Level up: ${rankName(after)}, level ${after}` : "") + (got.length ? ` · Achievement${got.length > 1 ? "s" : ""}: ${got.join(", ")}` : "");
    if (after > before || got.length) { beep(784, .15, .07, "triangle", .9); beep(1175, .35, .08, "triangle", 1.05); }
  }

  // ---- end of mission ----
  let outcome = null;
  function finish(ok) {
    const m = MISSIONS[mi];
    const progress = m.goal === "orbit" ? P.clamp(Math.abs(Q.vt) / 1650, 0, 1) : 1 - P.clamp(Math.hypot(Q.vr, Q.vh) / 200, 0, 1);
    outcome = {ok, t: S.t, fuel: Q.fuel, sev: Q.sev, progress, why: S.outcome, vr: Q.vr, vh: Q.vh, tilt: Q.tilt / DEG, noCoach: !coachUsed};
    fxEvent = ok && m.goal === "land" ? "landed" : S.outcome === "crashed" ? "crashed" : null;
    if (fxEvent === "landed") { toast("Touchdown!"); burst(.4, .5, 320); beep(70, .3, .2); }
    else if (fxEvent === "crashed") burst(1.8, .9, 1800);
    else if (ok) { beep(660, .15); beep(880, .3, .08, "sine", .15); }
    state = "ending"; endTimer = fxEvent ? 2.8 : 1.4; ctl.thr = 0; S.thr = 0;
    if (m.gauntlet && ok) {                                // chain on: bank the points and line up a harder one
      const pts = 100 + Math.round(120 * (1 - Math.min(1, Q.sev))) + Math.round(200 * Q.fuel);
      gaunt.total += pts; gaunt.round++; nextRound = true; endTimer = 2.2; toast(`Landing ${gaunt.round} done: +${pts}. The next one is harder`);
    }
  }
  function results() {
    const m = MISSIONS[mi], o = outcome, ai = aiScore(m);
    const sc = m.gauntlet ? {total: gaunt.total, parts: [["Landings in a row", gaunt.round], ["Points", gaunt.total]]} : score(m, outcome);
    state = "result"; World.map.on = false; World.update(S, Q, null, {dt: 0, legs, event: null});   // redraw once without the map corner
    ["hud", "top", "pad", "coach", "map", "land", "aimark"].forEach(id => show(id, false)); show("result", true); audio(0);
    const stars = m.gauntlet ? (gaunt.round >= 10 ? 3 : gaunt.round >= 6 ? 2 : gaunt.round >= 3 ? 1 : 0) : !o.ok ? 0 : (!m.ai.ok || sc.total > ai) ? 3 : sc.total >= .9 * ai ? 2 : 1;
    $("rtitle").textContent = o.ok ? (m.goal === "orbit" ? "Orbit achieved" : "Touchdown!") : o.why === "lost" ? "Lost in space" : "Crashed";
    $("rstars").textContent = "★".repeat(stars) + "☆".repeat(3 - stars);
    $("rtext").textContent = m.goal === "land" && o.why !== "lost"
      ? `Touchdown at ${Math.abs(o.vr).toFixed(1)} m/s down, ${o.vh.toFixed(1)} m/s sideways, ${o.tilt.toFixed(0)}° tilt.` + (o.ok ? "" : " Limits: 3 m/s, 2 m/s, 15°.")
      : o.ok ? `Orbit reached in ${clock(o.t)}.` : "";
    $("rtable").innerHTML = sc.parts.map(p => `<tr><td>${p[0]}</td><td>${p[1]}</td></tr>`).join("") +
      `<tr><td><b>Your score</b></td><td><b>${sc.total}</b></td></tr>` +
      `<tr class="ai"><td>AI score</td><td>${m.ai.ok ? ai : "failed"}</td></tr>` +
      `<tr><td>Result</td><td>${!o.ok ? "Try again" : stars === 3 ? "You beat the AI" : "The AI still leads"}</td></tr>`;
    shareText = `${pilot ? pilot + " flew " : ""}Moon Pilot - ${m.name}: ${sc.total} ${"★".repeat(stars)}${m.ai.ok ? " (the AI scored " + ai + ")" : ""}. Can you beat it?`;
    if (sc.total > (best[m.id] || 0)) { best[m.id] = sc.total; saveBest(); }
    $("rpost").textContent = !(o.ok || m.gauntlet && gaunt.round) ? "" : pilot ? "Posting your score..." : "Add a pilot name on the home screen to join the worldwide leaderboard.";
    if ((o.ok || m.gauntlet && gaunt.round) && pilot) Backend.score({name: pilot, mission: m.id, score: sc.total, ok: true, seconds: +o.t.toFixed(1), fuel: +P.clamp(o.fuel, 0, 1).toFixed(4), coach: !o.noCoach})
      .then(done => { $("rpost").textContent = done ? `Posted to the leaderboard as ${pilot}.` : "Could not reach the leaderboard. Your score is saved on this device."; });
    if (sharing && rec.length > 5) {                        // the player opted in: send the flight for AI training
      let rows = rec; while (rows.length > 2000) rows = rows.filter((_, i) => i % 2 === 0);
      Backend.flight({mission: m.id, ok: o.ok, score: sc.total, rows});
    }
    show("next", mi < MISSIONS.length - 1); drawChart(m);
    const beat = o.ok && m.ai.ok && sc.total > ai, last = m.rows[m.rows.length - 1];
    const row = (k, a, b) => `<tr><td>${k}</td><td>${a}</td><td class="ai">${b}</td></tr>`;
    $("cmp").innerHTML = `<tr><th></th><th>You</th><th class="ai">AI</th></tr>` + row("Score", sc.total, m.ai.ok ? ai : "failed") + row("Time", clock(o.t), clock(m.ai.t)) +
      row("Fuel left", Math.round(o.fuel * 100) + "%", Math.round(m.ai.fuel * 100) + "%") +
      (m.goal === "land" ? row("Touchdown speed", Math.abs(o.vr).toFixed(1) + " m/s", Math.abs(last[10]).toFixed(1) + " m/s") + row("Sideways speed", o.vh.toFixed(1) + " m/s", last[11].toFixed(1) + " m/s") : "");
    ["chart", "savepng", "savejson"].forEach(id => show(id, telOn && tel.length > 1));
    show("cmp", false); $("result").classList.toggle("win", beat);
    if (beat) { $("rtitle").textContent = "You beat the AI!"; celebrate(); }
    progress(m, sc, o, beat);
  }

  // ---- engine sound, synthesised (no audio files) ----
  let ac = null, gain = null, noise = null, warnAt = 0, shareText = "", master = null, muted = false;
  try { muted = localStorage.getItem("moonpilot.mute") === "yes"; } catch (e) {}
  const out = () => master || (master = ac.createGain(), master.gain.value = muted ? 0 : 1, master.connect(ac["destination"]), master);
  function setMute(m) { muted = m; if (master) master.gain.value = m ? 0 : 1; $("muteb").textContent = m ? "Sound off" : "Sound on"; try { localStorage.setItem("moonpilot.mute", m ? "yes" : "no"); } catch (e) {} }
  function beep(freq, dur, vol = .08, type = "sine", when = 0) {
    if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + when;
    o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(out()); o.start(t); o.stop(t + dur);
  }
  function burst(dur, vol, cutoff) {                        // filtered noise: a thud or an explosion
    if (!ac) return;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), t = ac.currentTime;
    s.buffer = noise; f.type = "lowpass"; f.frequency.setValueAtTime(cutoff, t); f.frequency.exponentialRampToValueAtTime(60, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out()); s.start(t); s.stop(t + dur);
  }
  function warnings() {                                     // sink-rate alarm near the ground, and a low-fuel chirp
    const now = performance.now();
    if (now < warnAt || paused) return;
    if (S.phase === P.DESCENT && Q.h < 250 && Q.vr < -Math.max(3, Q.h / 8)) { beep(880, .12, .07, "square"); warnAt = now + 450; }
    else if (Q.fuel < .08 && Q.fuel > 0) { beep(440, .1, .06); beep(440, .1, .06, "sine", .16); warnAt = now + 2200; }
  }
  function audio(level) {
    if (!ac) return;
    gain.gain.setTargetAtTime(level * .22, ac.currentTime, .08);
  }
  function initAudio() {
    if (ac) return;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const buf = noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource(), lp = ac.createBiquadFilter(); src.buffer = buf; src.loop = true;
      lp.type = "lowpass"; lp.frequency.value = 420; gain = ac.createGain(); gain.gain.value = 0;
      src.connect(lp); lp.connect(gain); gain.connect(out()); src.start();
    } catch (e) { ac = null; }
  }

  // ---- wiring ----
  const setHold = h => { ctl.hold = h; };
  const warp = dir => { ctl.warp = WARPS[P.clamp(WARPS.indexOf(ctl.warp) + dir, 0, WARPS.length - 1)]; };
  addEventListener("keydown", e => {
    const k = e.key.toLowerCase(); keys[k] = true;
    if (state === "result" && (k === "enter" || k === "r") && $("board").classList.contains("hide")) return start();   // one more try
    if (state !== "fly") return;
    if (k === "1") setHold("up"); if (k === "2") setHold("pro"); if (k === "3") setHold("retro");
    if (k === ".") warp(1); if (k === ",") warp(-1); if (k === "r") start();
    if (k === "g") gear = legs > .5 ? 0 : 1; if (k === "m") cycleMap(); if (k === "n") setMute(!muted);
    if (k === "f") { if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); }
    if (k === "p" || k === "escape") { paused = !paused; toast(paused ? "Paused. Press P to continue" : "Go"); }
  });
  addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });
  document.querySelectorAll("[data-key]").forEach(b => {
    b.onpointerdown = () => { keys[b.dataset.key] = true; }; b.onpointerup = b.onpointerleave = b.onpointercancel = () => { keys[b.dataset.key] = false; };
  });
  document.querySelectorAll("[data-hold]").forEach(b => { b.onclick = () => setHold(b.dataset.hold); });
  $("thr").oninput = e => { ctl.thr = e.target.value / 100; };
  $("warpup").onclick = () => warp(1); $("warpdn").onclick = () => warp(-1);
  $("coachb").onclick = () => { coachOn = !coachOn; toast(coachOn ? "Coach on" : "Coach off: finish without it for 15% extra score"); $("coachb").classList.toggle("on", coachOn); try { localStorage.setItem("moonpilot.coach", coachOn ? "on" : "off"); } catch (e) {} };
  $("coachb").classList.toggle("on", coachOn);
  $("camb").onclick = () => { World.cam.mode = World.cam.mode === "follow" ? "whole" : "follow"; };
  const cycleMap = () => { mapMode = {"2d": "3d", "3d": "off", "off": "2d"}[mapMode]; $("mapb").textContent = "Map " + mapMode.toUpperCase(); try { localStorage.setItem("moonpilot.map", mapMode); } catch (e) {} };
  $("muteb").onclick = () => setMute(!muted); $("muteb").textContent = muted ? "Sound off" : "Sound on";
  $("mapb").onclick = cycleMap; $("mapb").textContent = "Map " + mapMode.toUpperCase();
  $("restart").onclick = $("retry").onclick = () => start();
  $("go").onclick = () => { initAudio(); start(); };
  $("quit").onclick = $("tomenu").onclick = $("back").onclick = menu;
  $("next").onclick = () => brief(mi + 1);
  $("savepng").onclick = () => download(`moon-pilot-${MISSIONS[mi].id}.png`, $("chart").toDataURL("image/png"));
  $("savejson").onclick = () => download(`moon-pilot-${MISSIONS[mi].id}.json`, URL.createObjectURL(new Blob([JSON.stringify({
    game: "Moon Pilot", mission: MISSIONS[mi].name, pilot, outcome, columns: ["time_s", "height_m", "speed_m_s", "vertical_speed_m_s", "throttle", "fuel"], rows: tel})], {type: "application/json"})));
  $("warp").onclick = () => {                               // your own time-warp speed, remembered on this device
    const x = addWarp(prompt("Simulation speed, from 1 to 100 times:", ctl.warp));
    if (!x) return;
    ctl.warp = x;
    try { localStorage.setItem("moonpilot.warps", JSON.stringify(WARPS.filter(w => ![1, 2, 4, 10, 25, 50, 100].includes(w)))); } catch (e) {}
  };
  $("cmpb").onclick = () => $("cmp").classList.toggle("hide");
  $("boardb").onclick = () => board("overall"); $("rboard").onclick = () => board(MISSIONS[mi].id); $("bclose").onclick = () => show("board", false);
  try { sharing = localStorage.getItem("moonpilot.share") === "yes"; } catch (e) {}
  $("sharef").checked = sharing;
  try { telOn = localStorage.getItem("moonpilot.tel") !== "off"; } catch (e) {}
  $("telf").checked = telOn;
  $("telf").onchange = e => { telOn = e.target.checked; try { localStorage.setItem("moonpilot.tel", telOn ? "on" : "off"); } catch (err) {} };
  $("sharef").onchange = e => { sharing = e.target.checked; try { localStorage.setItem("moonpilot.share", sharing ? "yes" : "no"); } catch (err) {} };
  $("achb").onclick = showAch; $("achclose").onclick = () => show("achs", false);
  $("pname").value = pilot;
  $("pname").oninput = e => { pilot = e.target.value.replace(/[<>&"']/g, "").trim().slice(0, 16); try { localStorage.setItem("moonpilot.name", pilot); } catch (err) {} };
  $("share").onclick = () => {
    const url = location.origin + location.pathname, done = () => { $("share").textContent = "Copied"; setTimeout(() => { $("share").textContent = "Share"; }, 1500); };
    if (navigator.share) navigator.share({title: "Moon Pilot", text: shareText, url}).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(shareText + " " + url).then(done).catch(() => {});
  };
  menu(); requestAnimationFrame(frame);
  // ?shot=landing|launch|orbit poses a scene and freezes it, for store screenshots (tools/shots.sh)
  const shot = new URLSearchParams(location.search).get("shot");
  if (shot && shot !== "home") setTimeout(() => {
    let now = performance.now() + 1e7; const T = () => (now += 50), go = id => { mi = MISSIONS.findIndex(m => m.id === id); start(); };
    if (shot === "landing") {
      go("descent"); ctl.hold = "retro";
      while (state === "fly" && Q.h > 38) { const sp = Math.hypot(Q.vr, Q.vh); ctl.thr = P.clamp(.2 + .1 * (sp - Math.max(1.5, Q.h / 10)), 0, 1); tick(T()); }
      ctl.thr = .55; World.cam.az = .5; World.cam.el = .22;
    } else if (shot === "launch") {
      go("launch"); ctl.thr = 1; ctl.hold = "manual";
      while (state === "fly" && Q.h < 900) { ctl.pitch = Math.min(1.1, Math.max(0, (S.t - 8) * .03)); tick(T()); }
      World.cam.az = 2.2; World.cam.el = .12;
    } else {
      go("deorbit"); mapMode = "3d"; ctl.thr = 1;
      for (let i = 0; i < 160; i++) tick(T());
      World.cam.zoom = 14; World.cam.el = .5;
    }
    for (let i = 0; i < 6; i++) tick(T());
    paused = true; lastTip = null; $("toast").style.opacity = 0;
  }, 3500);
  window.MoonPilot = {get state() { return {state, t: S && S.t, h: Q && Q.h, vr: Q && Q.vr, vh: Q && Q.vh, peri: Q && Q.peri, apo: Q && Q.apo, phase: S && S.phase, outcome}; }, get S() { return S; }, get Q() { return Q; }, ctl, keys, tick};   // for testing
})();
