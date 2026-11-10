// Real Moon physics for one rocket. A line-for-line port of the step in ai/orbit3d.py, so the
// player and the AI ghost fly under exactly the same rules. SI units throughout.
(function (root) {
  const MU = 4.9048695e12, R = 1.7374e6, OMEGA = 2.6617e-6;          // gravity GM, radius, spin
  const G0 = 9.80665, ISP = 311, THRUST = 45000, M_WET = 15000, M_DRY = 2700;
  const MDOT = THRUST / (ISP * G0), SLEW = 10 * Math.PI / 180, TAU = 2 * Math.PI;
  const PERI_MIN = 10e3, APO_MAX = 100e3;                            // what counts as "in orbit"
  const ASCENT = 0, COAST = 1, DESCENT = 2;

  const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = a => Math.sqrt(dot(a, a));
  const unit = a => mul(a, 1 / Math.max(len(a), 1e-12));
  const spin = r => [-OMEGA * r[1], OMEGA * r[0], 0];                 // surface velocity, omega x r
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  function create(start) {
    return {r: start.r.slice(), v: start.v.slice(), d: start.d.slice(), nrm: start.nrm.slice(), m: start.m,
            phase: start.phase, theta: start.theta, onPad: start.onPad, t: 0, thr: 0, outcome: null};
  }

  // Everything the HUD and the rules need, derived from position and velocity.
  function derive(s) {
    const rm = len(s.r), er = mul(s.r, 1 / rm), et = unit(cross(s.nrm, er)), ec = cross(er, et);
    const vrel = add(s.v, spin(s.r), -1), vr = dot(vrel, er), vt = dot(vrel, et), vc = dot(vrel, ec);
    const hv = cross(s.r, s.v), hm2 = dot(hv, hv), eps = 0.5 * dot(s.v, s.v) - MU / rm;
    const ecc = Math.sqrt(Math.max(1 + 2 * eps * hm2 / (MU * MU), 0)), sl = hm2 / MU;
    const tilt = Math.acos(clamp(dot(s.d, er), -1, 1)), vh = Math.hypot(vt, vc);
    return {h: rm - R, er, et, ec, vrel, vr, vt, vc, vh, tilt,
            peri: sl / (1 + ecc) - R, apo: (ecc < 0.999999 ? sl / (1 - ecc) : 1e12) - R,
            // touchdown limits: 3 m/s down, 2 m/s sideways, 15 degrees of tilt. sev <= 1 is a soft landing
            sev: Math.max(Math.abs(vr) / 3, vh / 2, tilt / (15 * Math.PI / 180)),
            fuel: (s.m - M_DRY) / (M_WET - M_DRY)};
  }

  // One physics step: turn toward cmd (rate limited), then RK4 on gravity + thrust with mass loss.
  function step(s, throttle, cmd, dt) {
    const thr = Math.min(clamp(+throttle || 0, 0, 1), Math.max(s.m - M_DRY, 0) / (MDOT * dt));
    const ang = Math.acos(clamp(dot(s.d, cmd), -1, 1)), sn = Math.sin(ang);
    const f = Math.min(1, SLEW * dt / Math.max(ang, 1e-9));
    if (sn > 1e-6) s.d = unit(add(mul(s.d, Math.sin((1 - f) * ang) / sn), cmd, Math.sin(f * ang) / sn));
    else if (f >= 1) s.d = unit(cmd);
    const push = THRUST * thr, md = MDOT * thr, d = s.d, r0 = s.r, v0 = s.v, m0 = s.m;
    const acc = (r, m) => { const n = len(r); return add(mul(r, -MU / (n * n * n)), d, push / m); };
    const mh = m0 - 0.5 * md * dt, m1 = m0 - md * dt;
    const k1v = acc(r0, m0);
    const k2r = add(v0, k1v, 0.5 * dt), k2v = acc(add(r0, v0, 0.5 * dt), mh);
    const k3r = add(v0, k2v, 0.5 * dt), k3v = acc(add(r0, k2r, 0.5 * dt), mh);
    const k4r = add(v0, k3v, dt), k4v = acc(add(r0, k3r, dt), m1);
    let r1 = add(r0, add(add(v0, k2r, 2), add(mul(k3r, 2), k4r)), dt / 6);
    let v1 = add(v0, add(add(k1v, k2v, 2), add(mul(k3v, 2), k4v)), dt / 6);
    const er0 = mul(r0, 1 / len(r0));
    if (s.onPad) {                                                    // the pad holds until thrust beats gravity
      if (dot(d, er0) * push / m0 <= MU / (R * R)) {
        r1 = add(r0, spin(r0), dt); r1 = mul(r1, R / len(r1)); v1 = spin(r1);
      } else s.onPad = false;
    }
    if (s.phase === COAST) s.theta += Math.acos(clamp(dot(er0, unit(r1)), -1, 1));
    s.r = r1; s.v = v1; s.m = m1; s.t += dt; s.thr = thr;
  }

  // Mission rules after a step. Returns "orbit", "rev", "landed", "crashed", "lost" or null.
  function rules(s, q) {
    if (q.h <= 0 && !s.onPad) return s.outcome = (s.phase === DESCENT && q.sev <= 1) ? "landed" : "crashed";
    if (q.h > 300e3) return s.outcome = "lost";
    if (s.phase === ASCENT && q.peri >= PERI_MIN && q.apo <= APO_MAX) { s.phase = COAST; s.theta = 0; return "orbit"; }
    if (s.phase === COAST && s.theta >= TAU) { s.phase = DESCENT; return "rev"; }
    return null;
  }

  const api = {MU, R, OMEGA, THRUST, M_WET, M_DRY, TAU, ASCENT, COAST, DESCENT, PERI_MIN, APO_MAX,
               add, mul, dot, cross, len, unit, clamp, create, derive, step, rules};
  if (typeof module !== "undefined") module.exports = api; else root.Physics = api;
})(this);
