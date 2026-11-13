# /// script
# requires-python = ">=3.10"
# dependencies = ["gymnasium>=1.0", "stable-baselines3>=2.4"]
# ///
"""Orbit3D: one PPO agent learns to launch from the Moon, orbit it once, and land. In 3D.

  uv run orbit3d.py train            train, score, and build orbit3d.html (the 3D viewer)
  uv run orbit3d.py eval             score 256 full missions with the saved agent
  uv run orbit3d.py view             rebuild orbit3d.html from the saved missions

Physics (SI units, real Moon): inverse-square gravity, a rotating Moon, the rocket equation
(mass drops as fuel burns), a throttleable 45 kN engine, a 10 deg/s turn-rate limit, RK4
integration. Simplified: the rocket is a point mass that steers its thrust axis (no torques
or inertia), the Moon is a smooth sphere, and the engine throttles all the way down to zero.
All rockets are simulated at once in NumPy, which is what makes laptop training fast.
"""
import argparse
import json
import math
import os
import time
from pathlib import Path

import numpy as np
from gymnasium import spaces
from stable_baselines3.common.vec_env import VecEnv

ROOT = Path(__file__).parent
BODY = os.environ.get("ORBIT3D_BODY", "moon")           # which world to train or export: moon, europa, ceres
TAG = "" if BODY == "moon" else "-" + BODY
MODEL, MISSIONS = ROOT / "models" / f"orbit3d{TAG}", ROOT / "models" / f"orbit3d{TAG}_missions.json"

# --- the world -------------------------------------------------------------------------
BODIES = {  # gravity GM (m^3/s^2), radius (m), spin (rad/s)
    "moon": (4.9048695e12, 1.7374e6, 2.6617e-6),
    "europa": (3.2027e12, 1.5608e6, 2.0478e-5),
    "ceres": (6.2628e10, 4.697e5, 1.9234e-4),
}
MU, R_MOON, OMEGA = BODIES[BODY]                         # R_MOON is the radius of whichever body is chosen
W = np.array([0.0, 0.0, OMEGA])
G0, ISP, THRUST = 9.80665, 311.0, 45_000.0              # Apollo-class descent engine
M_WET, M_DRY = 15_000.0, 2_700.0                        # ~5.2 km/s of delta-v
MDOT = THRUST / (ISP * G0)
SLEW = math.radians(10)                                 # how fast the rocket can turn
TAU = 2 * math.pi

# --- the mission -----------------------------------------------------------------------
H_T = 40e3                                              # target orbit altitude
PERI_MIN, APO_MAX, PLANE_TOL = 10e3, 100e3, math.radians(2)   # what counts as "in orbit"
R_T = R_MOON + H_T
EPS_0, EPS_T, HANG_T = -MU / R_MOON, -MU / (2 * R_T), math.sqrt(MU * R_T)
U_T = math.sqrt(2 * (EPS_T - EPS_0))                    # target orbit energy, written as a speed
# Scale factors relative to the Moon (all exactly 1 there), so one set of tuned numbers serves every world.
_MM, _MR = BODIES["moon"][:2]
VS = math.sqrt(MU / R_T) / math.sqrt(_MM / (_MR + H_T))            # orbital speed
GS = math.sqrt((MU / R_MOON**2) / (_MM / _MR**2))                  # square root of surface gravity
MS = math.exp(-1.12 * (VS - 1) * math.sqrt(_MM / (_MR + H_T)) / (ISP * G0))   # mass left on reaching orbit
COAST_DT = 20.0 * max(1.0, TAU * math.sqrt(R_T**3 / MU) / 6800)    # coasting step: about 340 steps per orbit
V_REF = 1750.0 * VS
ASCENT, COAST, DESCENT = 0, 1, 2
MAX_STEPS = np.array([500, 450, 900])
STEP_COST = np.array([0.02, 0.0, 0.03])                 # a small fee per step, so waiting costs
FUEL_COST = 20.0                                        # points charged for burning a full tank
START_MIX = [0.25, 0.10, 0.15, 0.175, 0.175, 0.15]      # pad, in orbit, deorbit, mid descent, final descent, mid ascent
SCALARS = ("h", "vr", "vt", "vc", "hn", "hp", "hm", "u", "peri", "apo", "veq")


def norm(a):
    return np.sqrt(np.einsum("ij,ij->i", a, a))


def unit(a):
    return a / np.maximum(norm(a), 1e-12)[:, None]


def dot(a, b):
    return np.einsum("ij,ij->i", a, b)


class Orbit3D(VecEnv):
    """n rockets flown side by side. Observation: 24 numbers. Action: throttle + thrust direction."""

    def __init__(self, n, seed=0, mission_only=False, record=False, kind=None):
        self.kind = 0 if mission_only else kind                 # force one start type (see START_MIX)
        self.record, self.rng, self.ctl = record, np.random.default_rng(seed), []
        self.r, self.v, self.d, self.nrm = (np.zeros((n, 3)) for _ in range(4))
        self.m, self.theta, self.t, self.thr, self.phi_prev, self.phi0, self.ep_ret = (np.zeros(n) for _ in range(7))
        self.phase, self.steps, self.ep_len, self.reach = (np.zeros(n, int) for _ in range(4))
        self.on_pad, self.pad_start = np.zeros(n, bool), np.zeros(n, bool)
        self.c = {k: np.zeros(n) for k in SCALARS} | {k: np.zeros((n, 3)) for k in ("er", "et", "ec")}
        self.rec = []
        super().__init__(n, spaces.Box(-5, 5, (24,), np.float32), spaces.Box(-1, 1, (4,), np.float32))

    # --- SB3 plumbing ---
    def get_attr(self, name, indices=None):
        return [getattr(self, name, None)] * self.num_envs

    def set_attr(self, name, value, indices=None):
        pass

    def env_method(self, name, *args, indices=None, **kwargs):
        return [None] * self.num_envs

    def env_is_wrapped(self, wrapper_class, indices=None):
        return [False] * self.num_envs

    def close(self):
        pass

    def reset(self):
        self._reset(np.arange(self.num_envs))
        return self._obs()

    def step_async(self, actions):
        self.actions = actions

    # --- starting states ---
    def _reset(self, i):
        k, g = len(i), self.rng
        U = lambda lo, hi: g.uniform(lo, hi, k)
        kind = g.choice(6, k, p=START_MIX) if self.kind is None else np.full(k, self.kind)
        nrm = unit(g.normal(size=(k, 3)))                       # normal of the target orbit plane
        p = unit(np.cross(nrm, g.normal(size=(k, 3))))
        nu = U(0, TAU)
        er = np.cos(nu)[:, None] * p + np.sin(nu)[:, None] * np.cross(nrm, p)   # "up" at the start point
        et = np.cross(nrm, er)                                  # prograde
        # 0: on the launch pad, up to 0.5 degrees (~15 km) off the target plane
        r = R_MOON * unit(er + np.tan(np.radians(U(-0.5, 0.5)))[:, None] * nrm)
        v, d = np.cross(W, r), unit(r)
        # 1, 2: already in a random accepted orbit
        rp = R_MOON + U(10.5e3, 45e3)
        ra = np.minimum(rp + U(0, 55e3), R_MOON + 99e3)
        ecc, sl, f = (ra - rp) / (ra + rp), 2 * ra * rp / (ra + rp), U(0, TAU)
        ro, kk = sl / (1 + ecc * np.cos(f)), np.sqrt(MU / sl)
        r_o = ro[:, None] * er
        v_o = (kk * ecc * np.sin(f))[:, None] * er + (kk * (1 + ecc * np.cos(f)))[:, None] * et
        # 3, 4: part-way down (mid descent, final descent)
        mid = kind == 3
        h = np.where(mid, U(2e3, 30e3), np.exp(U(math.log(20), math.log(2000))))
        s = np.sqrt(h)
        vt = np.where(mid, U(0.2, 1) * np.minimum(1700 * VS, 12 * s * GS), U(-1.5, 1.5) * s * GS)
        vc = np.where(mid, U(-0.1, 0.1) * vt, U(-1.5, 1.5) * s * GS)
        vr = U(-1, 0.25) * np.where(mid, 2.0, 1.5) * s * GS
        r_d = (R_MOON + h)[:, None] * er
        vrel = vr[:, None] * er + vt[:, None] * et + vc[:, None] * nrm
        # 5: part-way up (mid ascent), anywhere from just off the pad to almost orbital speed
        ha, fr = U(1e3, 40e3), U(0.15, 1.0)
        r_a = (R_MOON + ha)[:, None] * er
        v_a = (U(-0.1, 1) * 120 * GS * (1 - 0.7 * fr))[:, None] * er + (fr * 1650 * VS)[:, None] * et + U(-10, 10)[:, None] * nrm
        m_a = M_WET * np.exp(-(1.1 * fr * 1650 * VS + 1.3 * GS * np.sqrt(3.24 * ha)) / (ISP * G0))   # fuel a real climb would have used
        orb, des, asc = ((kind == 1) | (kind == 2))[:, None], ((kind == 3) | (kind == 4))[:, None], (kind == 5)[:, None]
        rnd = lambda: g.normal(size=(k, 3))
        self.r[i] = np.where(orb, r_o, np.where(des, r_d, np.where(asc, r_a, r)))
        self.v[i] = np.where(orb, v_o, np.where(des, vrel + np.cross(W, r_d), np.where(asc, v_a + np.cross(W, r_a), v)))
        self.d[i] = unit(np.select([(kind == j)[:, None] for j in (1, 2, 3, 4, 5)],
                                   [et, rnd(), -vrel, er + 0.3 * rnd(), et + (1 - fr)[:, None] * er], d))
        self.m[i] = np.select([kind == 1, kind == 2, kind == 3, kind == 4, kind == 5],
                              [U(6500, 8500) * MS, U(6000, 8500) * MS, U(4000, 7500) * MS, U(3500, 6500) * MS, m_a], M_WET)
        self.nrm[i] = unit(nrm + np.select([kind == 0, kind == 5], [0.0, 0.005], 0.015)[:, None] * rnd())
        self.phase[i] = np.select([kind == 1, (kind >= 2) & (kind <= 4)], [COAST, DESCENT], ASCENT)
        self.theta[i] = np.where(kind == 1, U(0, 0.97) * TAU, np.where((kind >= 2) & (kind <= 4), TAU, 0.0))
        self.on_pad[i] = self.pad_start[i] = kind == 0
        self.reach[i] = self.phase[i]
        self.steps[i] = self.ep_len[i] = 0
        self.t[i] = self.thr[i] = self.ep_ret[i] = 0.0
        self._calc(i)
        self.phi_prev[i] = self.phi0[i] = self._phi()[i]
        if self.record:
            self.rec, self.ctl = [self._row()], []

    # --- derived quantities: local frame, surface-relative velocity, orbit shape ---
    def _calc(self, i=slice(None)):
        r, v, nrm = self.r[i], self.v[i], self.nrm[i]
        rm = norm(r)
        er = r / rm[:, None]
        et = unit(np.cross(nrm, er))
        ec = np.cross(er, et)
        vrel = v - np.cross(W, r)
        hv = np.cross(r, v)                                     # angular momentum
        hm2, hn = dot(hv, hv), dot(hv, nrm)
        eps = 0.5 * dot(v, v) - MU / rm                         # orbital energy
        ecc = np.sqrt(np.maximum(1 + 2 * eps * hm2 / MU**2, 0))
        sl = hm2 / MU
        out = dict(h=rm - R_MOON, er=er, et=et, ec=ec, vr=dot(vrel, er), vt=dot(vrel, et), vc=dot(vrel, ec),
                   hn=hn, hp=np.sqrt(np.maximum(hm2 - hn**2, 0)), hm=np.sqrt(hm2),
                   u=np.sqrt(2 * np.maximum(eps - EPS_0, 0)), peri=sl / (1 + ecc) - R_MOON,
                   apo=np.where(ecc < 0.999999, sl / np.maximum(1 - ecc, 1e-6), 1e9) - R_MOON,
                   veq=np.sqrt(dot(vrel, vrel) + 2 * MU * np.maximum(1 / R_MOON - 1 / rm, 0)))
        for k, x in out.items():
            self.c[k][i] = x

    def _phi(self):
        """Reward shaping: a 'how close to done' score per phase. The agent is paid its change."""
        c = self.c
        # launch: orbit energy and in-plane angular momentum reach the target; out-of-plane goes to 0
        orbit = -50 * np.abs(c["u"] - U_T) / U_T - 50 * np.abs(c["hn"] - HANG_T) / HANG_T - 50 * c["hp"] / HANG_T
        # landing: the speed it would hit the ground with in free fall goes to 0
        return np.where(self.phase == ASCENT, orbit,
                        np.where(self.phase == COAST, 0.3 * orbit + 30 * self.theta / TAU, -150 * c["veq"] / V_REF))

    def _obs(self, i=slice(None)):
        c = {k: x[i] for k, x in self.c.items()}
        ph, d, m = self.phase[i], self.d[i], self.m[i]
        slog = lambda x: np.sign(x) * np.log1p(np.abs(x) / 5) / 6
        o = np.stack([
            c["h"] / H_T, np.log1p(np.maximum(c["h"], 0) / 100) / 6,
            c["vr"] / 100, c["vt"] / V_REF, c["vc"] / 100, slog(c["vr"]), slog(c["vt"]), slog(c["vc"]),
            dot(self.r[i], self.nrm[i]) / 20e3, (m - M_DRY) / (M_WET - M_DRY), THRUST / m / 10,
            dot(d, c["er"]), dot(d, c["et"]), dot(d, c["ec"]), ph == ASCENT, ph == COAST, ph == DESCENT,
            c["peri"] / H_T, c["apo"] / H_T, (c["u"] - U_T) / U_T, (c["hn"] - HANG_T) / HANG_T, 10 * c["hp"] / HANG_T,
            self.theta[i] / TAU, self.steps[i] / MAX_STEPS[ph]], axis=1)
        return np.clip(o, -5, 5).astype(np.float32)

    def _row(self):
        c = self.c
        return [round(float(self.t[0]), 1), *np.round(self.r[0], 1).tolist(), *np.round(self.d[0], 3).tolist(),
                round(float(self.thr[0]), 2), int(self.phase[0]), round(float(c["h"][0]), 1),
                round(float(c["vr"][0]), 2), round(float(np.hypot(c["vt"][0], c["vc"][0])), 2),
                round(float((self.m[0] - M_DRY) / (M_WET - M_DRY)), 4)]

    # --- one control step for every rocket ---
    def step_wait(self):
        n, c = self.num_envs, self.c
        a = np.clip(self.actions, -1, 1).astype(np.float64)
        ph = self.phase.copy()
        thr = np.clip(a[:, 0], 0, 1)                            # action 0: throttle (<= 0 is engine off)
        # time step: 2 s normally, 1 s on final approach, 20 s while coasting in orbit
        dt = np.where((ph == COAST) & (thr == 0), COAST_DT, np.where((ph == DESCENT) & (c["h"] < 2000), 1.0, 2.0))
        thr = np.minimum(thr, np.maximum(self.m - M_DRY, 0) / (MDOT * dt))
        # actions 1-3: where to point, in the local up / prograde / cross-track frame, turn-rate limited
        cmd = a[:, 1:2] * c["er"] + a[:, 2:3] * c["et"] + a[:, 3:4] * c["ec"]
        cn = norm(cmd)
        cmd = np.where((cn > 1e-3)[:, None], cmd / np.maximum(cn, 1e-3)[:, None], self.d)
        ang = np.arccos(np.clip(dot(self.d, cmd), -1, 1))
        f = np.minimum(1.0, SLEW * dt / np.maximum(ang, 1e-9))
        s = np.sin(ang)
        slerp = (np.sin((1 - f) * ang)[:, None] * self.d + np.sin(f * ang)[:, None] * cmd) / np.maximum(s, 1e-9)[:, None]
        self.d = unit(np.where((s > 1e-6)[:, None], slerp, np.where((f >= 1)[:, None], cmd, self.d)))

        # physics: RK4 on gravity + thrust, with mass falling as fuel burns
        push, md, hh = THRUST * thr, MDOT * thr, dt[:, None]
        acc = lambda r, m: -MU * r / (norm(r) ** 3)[:, None] + (push / m)[:, None] * self.d
        r0, v0, m0 = self.r, self.v, self.m
        mh, m1 = m0 - 0.5 * md * dt, m0 - md * dt
        k1v = acc(r0, m0)
        k2r = v0 + 0.5 * hh * k1v
        k2v = acc(r0 + 0.5 * hh * v0, mh)
        k3r = v0 + 0.5 * hh * k2v
        k3v = acc(r0 + 0.5 * hh * k2r, mh)
        k4r = v0 + hh * k3v
        k4v = acc(r0 + hh * k3r, m1)
        r1 = r0 + hh / 6 * (v0 + 2 * k2r + 2 * k3r + k4r)
        v1 = v0 + hh / 6 * (k1v + 2 * k2v + 2 * k3v + k4v)
        # the pad holds the rocket until thrust beats gravity
        stay = self.on_pad & (dot(self.d, c["er"]) * push / m0 <= MU / R_MOON**2)
        if stay.any():
            rs = r0[stay] + np.cross(W, r0[stay]) * dt[stay, None]
            rs *= (R_MOON / norm(rs))[:, None]
            r1[stay], v1[stay] = rs, np.cross(W, rs)
        self.on_pad = stay
        if self.record:                                         # exact controls, for the JS physics parity test
            self.ctl.append([float(dt[0]), float(thr[0]), *self.d[0].tolist()])
        self.theta += np.where(ph == COAST, np.arccos(np.clip(dot(c["er"], unit(r1)), -1, 1)), 0.0)
        self.r, self.v, self.m, self.thr = r1, v1, m1, thr
        self.t += dt
        self.steps += 1
        self._calc()

        # reward: change in the shaping score, minus fuel and a time fee
        phi = self._phi()
        rew = phi - self.phi_prev - FUEL_COST * md * dt / (M_WET - M_DRY) - STEP_COST[ph]
        ground = (c["h"] <= 0) & ~self.on_pad
        tilt, vh = np.arccos(np.clip(dot(self.d, c["er"]), -1, 1)), np.hypot(c["vt"], c["vc"])
        # touchdown limits: 3 m/s down, 2 m/s sideways, 15 degrees of tilt. sev <= 1 is a soft landing
        sev = np.maximum.reduce([np.abs(c["vr"]) / 3, vh / 2, tilt / math.radians(15)])
        landed = ground & (ph == DESCENT) & (sev <= 1)
        crashed = ground & ~landed
        lost = (c["h"] > 300e3) & ~ground
        late = (self.steps >= MAX_STEPS[ph]) & ~ground & ~lost
        fail = crashed | lost | late
        rew += landed * (200 - phi)
        # a failed launch keeps the progress it was paid for, so "get closer to orbit" always beats "crash early"
        rew -= fail * np.select([ph == ASCENT, ph == COAST], [20.0, 50.0],
                                np.where(crashed, 20 + 80 * np.tanh((sev - 1) / 10), 60.0))
        done = landed | fail
        to_coast = ((ph == ASCENT) & ~done & (c["peri"] >= PERI_MIN) & (c["apo"] <= APO_MAX)
                    & (c["hn"] > 0) & (c["hp"] <= math.sin(PLANE_TOL) * c["hm"]))
        to_desc = (ph == COAST) & ~done & (self.theta >= TAU)   # one full revolution flown
        rew += 50 * to_coast + 20 * to_desc
        self.phase = np.where(to_coast, COAST, np.where(to_desc, DESCENT, ph))
        self.theta = np.where(to_coast, 0.0, self.theta)
        self.steps = np.where(to_coast | to_desc, 0, self.steps)
        self.reach = np.maximum(self.reach, self.phase + landed)
        self.phi_prev = self._phi()
        self.ep_ret += rew
        self.ep_len += 1

        obs, infos = self._obs(), [{} for _ in range(n)]
        if self.record:
            self.rec.append(self._row())
        idx = np.flatnonzero(done)
        if len(idx):
            for j in idx:
                infos[j] = {"terminal_observation": obs[j], "episode": {
                    "r": float(self.ep_ret[j]), "l": int(self.ep_len[j]), "pad": bool(self.pad_start[j]),
                    "reach": int(self.reach[j]), "out": int(np.argmax([landed[j], crashed[j], lost[j], late[j]])),
                    "asc": 100.0 if self.reach[j] else float(phi[j] - self.phi0[j]),
                    "phase": int(ph[j]), "vr": float(c["vr"][j]), "vh": float(vh[j]),
                    "tilt": float(np.degrees(tilt[j])), "fuel": float((self.m[j] - M_DRY) / (M_WET - M_DRY))}}
                if self.record:
                    infos[j]["rec"] = self.rec
            self._reset(idx)
            obs[idx] = self._obs(idx)
        return obs, (rew * 0.01).astype(np.float32), done, infos


# --- flying, scoring, training -----------------------------------------------------------
def describe(e):
    where = ("during launch", "in orbit", "during landing")[e["phase"]]
    if e["out"] == 0:
        return f"Landed softly: {abs(e['vr']):.1f} m/s down, {e['vh']:.1f} m/s sideways, {e['fuel']:.0%} fuel left"
    return ("", f"Crashed {where} at {math.hypot(e['vr'], e['vh']):.0f} m/s", f"Flew off into space {where}",
            f"Ran out of time {where}")[e["out"]]


def fly(model, seed=7):
    """One full mission from the pad, recorded for the viewer."""
    env = Orbit3D(1, seed=seed, mission_only=True, record=True)
    obs = env.reset()
    while True:
        obs, _, done, info = env.step(model.predict(obs, deterministic=True)[0])
        if done[0]:
            return {"outcome": describe(info[0]["episode"]), "rows": info[0]["rec"]}


def evaluate(model, n=256, seed=123):
    env = Orbit3D(n, seed=seed, mission_only=True)
    obs, res = env.reset(), [None] * n
    while any(x is None for x in res):
        obs, _, done, infos = env.step(model.predict(obs, deterministic=True)[0])
        for j in np.flatnonzero(done):
            res[j] = res[j] or infos[j]["episode"]
    reach = np.array([e["reach"] for e in res])
    ok = [e for e in res if e["out"] == 0]
    print(f"{n} full missions from the pad:  reached orbit {np.mean(reach >= 1):.0%}   "
          f"flew a full revolution {np.mean(reach >= 2):.0%}   landed softly {np.mean(reach == 3):.0%}")
    if ok:
        print(f"soft landings: median {np.median([abs(e['vr']) for e in ok]):.2f} m/s down, "
              f"{np.median([e['vh'] for e in ok]):.2f} m/s sideways, {np.median([e['tilt'] for e in ok]):.1f} deg tilt, "
              f"{np.mean([e['fuel'] for e in ok]):.0%} fuel left")


def build_viewer(missions):
    page = (ROOT / "viewer_template.html").read_text(encoding="utf-8")
    (ROOT / "orbit3d.html").write_text(page.replace("/*MISSIONS*/[]", json.dumps(missions, separators=(",", ":"))),
                                       encoding="utf-8")
    print("wrote orbit3d.html")


def dailies(model, count=14):
    """Landing scenarios for the game's daily challenge: only ones the AI itself lands, rows thinned to halve the size."""
    out, seed = [], 2000
    while len(out) < count:
        seed += 1
        env = Orbit3D(1, seed=seed, record=True, kind=4 if seed % 2 else 3)
        obs = env.reset()
        start = {k: getattr(env, k)[0].tolist() for k in ("r", "v", "d", "nrm")} | {
            "m": float(env.m[0]), "phase": int(env.phase[0]), "theta": float(env.theta[0]), "onPad": False}
        while True:
            obs, _, done, info = env.step(model.predict(obs, deterministic=True)[0])
            if done[0]:
                break
        e, rows = info[0]["episode"], info[0]["rec"]
        if e["out"] == 0:
            out.append({"start": start, "rows": rows[:-1:2] + [rows[-1]], "ai": {
                "ok": True, "text": describe(e), "sev": max(abs(e["vr"]) / 3, e["vh"] / 2, e["tilt"] / 15),
                "t": rows[-1][0], "fuel": rows[-1][12]}})
    return out


def export(model, game=ROOT.parent / "moon-pilot"):
    """Fly the AI through each game mission and save the start state + ghost flight for the game."""
    out, parity = {}, None
    for name, kind in (("descent", 4), ("deorbit", 2), ("launch", 0), ("full", 0)):
        for seed in range(7, 500):                              # descent: pick a start 1.2-1.9 km up
            env = Orbit3D(1, seed=seed, record=True, kind=kind)
            obs = env.reset()
            if name != "descent" or 1200 < env.c["h"][0] < 1900:
                break
        start = {k: getattr(env, k)[0].tolist() for k in ("r", "v", "d", "nrm")} | {
            "m": float(env.m[0]), "phase": int(env.phase[0]), "theta": float(env.theta[0]), "onPad": bool(env.on_pad[0])}
        ctl = env.ctl
        while True:
            obs, _, done, info = env.step(model.predict(obs, deterministic=True)[0])
            if done[0]:
                e, rows = info[0]["episode"], info[0]["rec"]
                ai = {"ok": e["out"] == 0 and name != "launch", "text": describe(e),
                      "sev": max(abs(e["vr"]) / 3, e["vh"] / 2, e["tilt"] / 15)}
                break
            if name == "launch" and env.phase[0] != ASCENT:
                rows, ai = env.rec, {"ok": True, "text": "Reached orbit", "sev": 0}
                break
        out[name] = {"start": start, "rows": rows, "ai": ai | {"t": rows[-1][0], "fuel": rows[-1][12]}}
        print(f"{name:8s} {ai['text']}")
        if name == "deorbit":
            parity = {"start": start, "ctl": ctl, "end": rows[-1][1:4]}
    if BODY == "moon":
        out["daily"] = dailies(model)
        print(f"daily    {len(out['daily'])} challenges")
        (game / "www" / "data" / "ghosts.js").write_text("window.GHOSTS=" + json.dumps(out, separators=(",", ":")) + ";")
        (game / "tools" / "parity.json").write_text(json.dumps(parity))
    else:                                                   # another world: its own data file, with the body's constants
        out["body"] = {"id": BODY, "mu": MU, "r": R_MOON, "omega": OMEGA}
        (game / "www" / "data" / f"ghosts-{BODY}.js").write_text(
            f"(window.GHOSTS.worlds=window.GHOSTS.worlds||{{}}).{BODY}=" + json.dumps(out, separators=(",", ":")) + ";")
        (game / "tools" / f"parity-{BODY}.json").write_text(json.dumps(parity | {"body": out["body"]}))


def train(steps, n_envs, seed):
    from stable_baselines3 import PPO
    from stable_baselines3.common.callbacks import BaseCallback

    marks, missions = [0, 0.03, 0.1, 0.25, 0.5, 1.0], []

    class Progress(BaseCallback):
        next = 0

        def _on_step(self):
            return True

        def _on_rollout_end(self):
            frac = self.num_timesteps / steps
            while len(missions) < len(marks) - 1 and frac >= marks[len(missions)]:
                missions.append({"label": f"{marks[len(missions)]:.0%} trained"} | fly(self.model))
            if self.num_timesteps >= self.next:
                self.next = self.num_timesteps + steps // 12
                self.model.save(MODEL)                          # keep a checkpoint in case the run is stopped
                eps = list(self.model.ep_info_buffer)
                pad = np.array([e["reach"] for e in eps if e["pad"]] or [0])
                low = np.array([e["reach"] for e in eps if not e["pad"]] or [0])
                print(f"{self.num_timesteps / 1e6:6.1f}M steps  {self.num_timesteps / (time.time() - start):6,.0f} fps  "
                      f"score {np.mean([e['r'] for e in eps]):6.1f}  from pad: launch progress "
                      f"{np.mean([e['asc'] for e in eps if e['pad']] or [0]):3.0f}/100 orbit {np.mean(pad >= 1):4.0%} "
                      f"rev {np.mean(pad >= 2):4.0%} landed {np.mean(pad == 3):4.0%}  practice landings {np.mean(low == 3):4.0%}",
                      flush=True)

    env = Orbit3D(n_envs, seed)
    model = PPO("MlpPolicy", env, n_steps=64, batch_size=8192, n_epochs=4, gamma=0.999, gae_lambda=0.95,
                learning_rate=lambda left: 1e-4 + 2e-4 * left, ent_coef=0.0, stats_window_size=5000,
                policy_kwargs=dict(net_arch=[64, 64], log_std_init=-0.7), device="cpu", seed=seed, verbose=0)
    start = time.time()
    model.learn(total_timesteps=steps, callback=Progress())
    print(f"trained {steps:,} steps in {(time.time() - start) / 60:.1f} min", flush=True)
    MODEL.parent.mkdir(exist_ok=True)
    model.save(MODEL)
    missions.append({"label": "100% trained"} | fly(model))
    MISSIONS.write_text(json.dumps(missions, separators=(",", ":")))
    if BODY == "moon":
        build_viewer(missions)
    evaluate(model)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("command", choices=("train", "eval", "view", "export"))
    p.add_argument("--steps", type=int, default=100_000_000)
    p.add_argument("--envs", type=int, default=2048)
    p.add_argument("--seed", type=int, default=0)
    a = p.parse_args()
    if a.command == "train":
        train(a.steps, a.envs, a.seed)
    elif a.command == "view":
        build_viewer(json.loads(MISSIONS.read_text()))
    else:
        from stable_baselines3 import PPO

        (export if a.command == "export" else evaluate)(PPO.load(MODEL, device="cpu"))


if __name__ == "__main__":
    main()
