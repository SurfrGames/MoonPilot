// Moon Pilot: menus, missions, flight controls, HUD, scoring and the AI ghost race.
(() => {
  const P = Physics, $ = id => document.getElementById(id), DEG = Math.PI / 180;
  const show = (id, on) => $(id).classList.toggle("hide", !on);
  const MISSIONS = [
    {id: "descent", name: "Final Descent", goal: "land", par: 150,
     brief: "You are over a kilometre up and falling. Kill your speed and touch down: under 3 m/s down, 2 m/s sideways, 15° of tilt."},
    {id: "deorbit", name: "Deorbit & Land", goal: "land", par: 1500,
     brief: "You are in orbit at about 1.6 km/s. Point retrograde, brake, come down and land anywhere."},
    {id: "launch", name: "Launch to Orbit", goal: "orbit", par: 700,
     brief: "Lift off, tip over toward prograde and build speed until your orbit's low point is above 10 km and its high point below 100 km."},
    {id: "full", name: "Full Mission", goal: "land", par: 9500,
     brief: "Launch, fly one full orbit (use time warp), then come back down and land. The whole flight the AI learned."},
  ].filter(m => window.GHOSTS && GHOSTS[m.id]).map(m => ({...m, ...GHOSTS[m.id]}));

  let best = {};
  try { best = JSON.parse(localStorage.getItem("moonpilot.best") || "{}"); } catch (e) {}
  const saveBest = () => { try { localStorage.setItem("moonpilot.best", JSON.stringify(best)); } catch (e) {} };

  // ---- scoring: the same formula for the player and the AI ----
  function score(m, r) {
    if (!r.ok) return {total: Math.round(300 * (r.progress || 0)), parts: [["Progress", Math.round(300 * (r.progress || 0))]]};
    const parts = [["Mission complete", 1000], ["Fuel left (" + Math.round(r.fuel * 100) + "%)", Math.round(1000 * r.fuel)]];
    if (m.goal === "land") parts.push(["Soft touchdown", Math.round(500 * (1 - Math.min(1, r.sev)))]);
    parts.push(["Speed", Math.round(300 * P.clamp(1.5 - r.t / m.par, 0, 1))]);
    return {total: parts.reduce((a, p) => a + p[1], 0), parts};
  }
  const aiScore = m => score(m, m.ai).total;
  const clock = t => { const s = Math.round(t), h = Math.floor(s / 3600), mi = Math.floor(s / 60) % 60; return (h ? h + ":" + String(mi).padStart(2, "0") : mi) + ":" + String(s % 60).padStart(2, "0"); };
  const dist = h => Math.abs(h) < 2000 ? h.toFixed(0) + " m" : (h / 1000).toFixed(1) + " km";

  // ---- menu ----
  function menu() {
    state = "menu"; ["hud", "top", "pad", "brief", "result"].forEach(id => show(id, false)); show("menu", true); audio(0);
    $("cards").innerHTML = "";
    MISSIONS.forEach((m, i) => {
      const b = document.createElement("button"); b.className = "card";
      b.innerHTML = `<b>${i + 1}. ${m.name}</b><span>${best[m.id] ? "Your best " + best[m.id] : "Not flown yet"} · ` +
        (m.ai.ok ? `<span class="ai">AI ${aiScore(m)}</span>` : `<span class="ai">AI failed this one</span>`) + `</span>`;
      b.onclick = () => brief(i); $("cards").appendChild(b);
    });
    if (!MISSIONS.length) $("cards").textContent = "No missions found. Run the AI export first.";
  }
  function brief(i) {
    mi = i; const m = MISSIONS[i];
    show("menu", false); show("result", false); show("brief", true);
    $("bname").textContent = m.name; $("btext").textContent = m.brief;
    $("bai").textContent = m.ai.ok ? `The AI scored ${aiScore(m)} in ${clock(m.ai.t)} with ${Math.round(m.ai.fuel * 100)}% fuel left.`
                                   : `The AI did not manage this one (${m.ai.text.toLowerCase()}). Can you?`;
  }

  // ---- flight ----
  let state = "menu", mi = 0, S = null, Q = null, gi = 0, endTimer = 0, last = performance.now();
  const ctl = {thr: 0, pitch: 0, yaw: 0, hold: "up", warp: 1}, keys = {}, WARPS = [1, 2, 4, 10, 25, 100];
  function start() {
    const m = MISSIONS[mi];
    S = P.create(m.start); Q = P.derive(S); gi = 0; endTimer = 0;
    Object.assign(ctl, {thr: 0, pitch: 0, yaw: 0, warp: 1, hold: m.start.phase === P.DESCENT ? "retro" : "up"});
    World.setMission(m.start, m.rows);
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
    const real = Math.min(.05, (now - last) / 1000); last = now;
    if (state !== "fly" && state !== "ending") return;
    const m = MISSIONS[mi];
    if (state === "fly") {
      input(real);
      const maxWarp = ctl.thr > 0 || Q.h < 3000 ? 4 : 100;        // high warp only while coasting, well above ground
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
    } else if ((endTimer -= real) <= 0) return results();
    const g = ghostAt(m, S.t);
    World.update(S, Q, g); hud(m, g); audio(state === "fly" ? S.thr : 0);
  }

  function hud(m, g) {
    const low = S.phase === P.DESCENT && Q.h < 300;
    $("goal").textContent = m.goal === "orbit" || S.phase === P.ASCENT ? "Reach orbit: low point above 10 km"
      : S.phase === P.COAST ? `Coast one lap: ${Math.round(100 * S.theta / P.TAU)}%` : "Land softly";
    $("t").textContent = clock(S.t); $("h").textContent = dist(Math.max(0, Q.h));
    $("vr").textContent = (Q.vr > 0 ? "+" : "") + Q.vr.toFixed(1) + " m/s"; $("vr").className = low ? (Q.vr < -3 ? "warn" : "ok") : "";
    $("vh").textContent = Q.vh.toFixed(Q.vh < 100 ? 1 : 0) + " m/s"; $("vh").className = low ? (Q.vh > 2 ? "warn" : "ok") : "";
    $("fuel").textContent = Math.round(Q.fuel * 100) + "%"; $("fuel").className = Q.fuel < .1 ? "warn" : "";
    $("orb").textContent = Q.apo > 1e7 ? "escape" : `${Math.max(Q.apo / 1000, 0).toFixed(0)} / ${Q.peri < 0 ? "ground" : (Q.peri / 1000).toFixed(0) + " km"}`;
    $("tilt").textContent = (Q.tilt / DEG).toFixed(0) + "°"; $("tilt").className = low ? (Q.tilt > 15 * DEG ? "warn" : "ok") : "";
    $("aih").textContent = g.done ? (m.ai.ok ? "finished " + clock(m.ai.t) : "failed") : dist(Math.max(0, g.h));
    $("thr").value = Math.round(ctl.thr * 100); $("thrv").textContent = Math.round(S.thr * 100) + "%"; $("warp").textContent = ctl.warp + "×";
    document.querySelectorAll("[data-hold]").forEach(b => b.classList.toggle("on", b.dataset.hold === ctl.hold));
  }

  // ---- end of mission ----
  let outcome = null;
  function finish(ok) {
    const m = MISSIONS[mi];
    const progress = m.goal === "orbit" ? P.clamp(Math.abs(Q.vt) / 1650, 0, 1) : 1 - P.clamp(Math.hypot(Q.vr, Q.vh) / 200, 0, 1);
    outcome = {ok, t: S.t, fuel: Q.fuel, sev: Q.sev, progress, why: S.outcome, vr: Q.vr, vh: Q.vh, tilt: Q.tilt / DEG};
    state = "ending"; endTimer = 1.4; ctl.thr = 0; S.thr = 0;
  }
  function results() {
    const m = MISSIONS[mi], sc = score(m, outcome), ai = aiScore(m), o = outcome;
    state = "result"; ["hud", "top", "pad"].forEach(id => show(id, false)); show("result", true); audio(0);
    const stars = !o.ok ? 0 : (!m.ai.ok || sc.total > ai) ? 3 : sc.total >= .9 * ai ? 2 : 1;
    $("rtitle").textContent = o.ok ? (m.goal === "orbit" ? "Orbit achieved" : "Touchdown!") : o.why === "lost" ? "Lost in space" : "Crashed";
    $("rstars").textContent = "★".repeat(stars) + "☆".repeat(3 - stars);
    $("rtext").textContent = m.goal === "land" && o.why !== "lost"
      ? `Touchdown at ${Math.abs(o.vr).toFixed(1)} m/s down, ${o.vh.toFixed(1)} m/s sideways, ${o.tilt.toFixed(0)}° tilt.` + (o.ok ? "" : " Limits: 3 m/s, 2 m/s, 15°.")
      : o.ok ? `Orbit reached in ${clock(o.t)}.` : "";
    $("rtable").innerHTML = sc.parts.map(p => `<tr><td>${p[0]}</td><td>${p[1]}</td></tr>`).join("") +
      `<tr><td><b>Your score</b></td><td><b>${sc.total}</b></td></tr>` +
      `<tr class="ai"><td>AI score</td><td>${m.ai.ok ? ai : "failed"}</td></tr>` +
      `<tr><td>Result</td><td>${!o.ok ? "Try again" : stars === 3 ? "You beat the AI" : "The AI still leads"}</td></tr>`;
    if (sc.total > (best[m.id] || 0)) { best[m.id] = sc.total; saveBest(); }
    show("next", mi < MISSIONS.length - 1);
  }

  // ---- engine sound, synthesised (no audio files) ----
  let ac = null, gain = null;
  function audio(level) {
    if (!ac) return;
    gain.gain.setTargetAtTime(level * .22, ac.currentTime, .08);
  }
  function initAudio() {
    if (ac) return;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource(), lp = ac.createBiquadFilter(); src.buffer = buf; src.loop = true;
      lp.type = "lowpass"; lp.frequency.value = 420; gain = ac.createGain(); gain.gain.value = 0;
      src.connect(lp); lp.connect(gain); gain.connect(ac.destination); src.start();
    } catch (e) { ac = null; }
  }

  // ---- wiring ----
  const setHold = h => { ctl.hold = h; };
  const warp = dir => { ctl.warp = WARPS[P.clamp(WARPS.indexOf(ctl.warp) + dir, 0, WARPS.length - 1)]; };
  addEventListener("keydown", e => {
    const k = e.key.toLowerCase(); keys[k] = true;
    if (state !== "fly") return;
    if (k === "1") setHold("up"); if (k === "2") setHold("pro"); if (k === "3") setHold("retro");
    if (k === ".") warp(1); if (k === ",") warp(-1); if (k === "r") start();
  });
  addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });
  document.querySelectorAll("[data-key]").forEach(b => {
    b.onpointerdown = () => { keys[b.dataset.key] = true; }; b.onpointerup = b.onpointerleave = b.onpointercancel = () => { keys[b.dataset.key] = false; };
  });
  document.querySelectorAll("[data-hold]").forEach(b => { b.onclick = () => setHold(b.dataset.hold); });
  $("thr").oninput = e => { ctl.thr = e.target.value / 100; };
  $("warpup").onclick = () => warp(1); $("warpdn").onclick = () => warp(-1);
  $("camb").onclick = () => { World.cam.mode = World.cam.mode === "follow" ? "whole" : "follow"; };
  $("restart").onclick = $("retry").onclick = () => start();
  $("go").onclick = () => { initAudio(); start(); };
  $("quit").onclick = $("tomenu").onclick = $("back").onclick = menu;
  $("next").onclick = () => brief(mi + 1);
  menu(); requestAnimationFrame(frame);
  window.MoonPilot = {get state() { return {state, t: S && S.t, h: Q && Q.h, vr: Q && Q.vr, vh: Q && Q.vh, peri: Q && Q.peri, apo: Q && Q.apo, phase: S && S.phase, outcome}; }, get S() { return S; }, get Q() { return Q; }, ctl, keys, tick};   // for testing
})();
