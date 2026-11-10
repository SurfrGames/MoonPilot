# /// script
# requires-python = ">=3.10"
# dependencies = ["gymnasium[box2d]>=1.0", "stable-baselines3>=2.4", "moviepy"]
# ///
"""Lunar Lander + PPO + reward shaping.

  uv run lander.py random                  watch a random rocket crash
  uv run lander.py train  --reward base    train PPO (base | fee | hover | fixed)
  uv run lander.py eval   --reward base    score it on the built-in reward, wrapper off
  uv run lander.py record --reward base    save a clip to videos/
  uv run lander.py all                     train all four rewards in parallel, then eval + record
"""
import argparse
import json
import math
import time
from pathlib import Path

import gymnasium as gym
import numpy as np

ENV_ID = "LunarLander-v3"
ROOT = Path(__file__).parent
MODELS, VIDEOS, RESULTS = ROOT / "models", ROOT / "videos", ROOT / "results.json"
REWARDS = ("base", "fee", "hover", "fixed")
OBS_NAMES = ("x", "height", "x-speed", "y-speed", "tilt", "spin", "left-leg", "right-leg")
FEE = 0.05  # points charged per frame, so waiting costs something


def speed(obs):
    return math.hypot(obs[2], obs[3])


def calm(obs):
    """True while the rocket is upright and slow."""
    return abs(obs[4]) < 0.2 and speed(obs) < 0.4


def calmness(obs):
    """A 'how upright and slow' score. Higher is better."""
    return -10.0 * (abs(obs[4]) + speed(obs))


class ShapedReward(gym.Wrapper):
    """Sits between the game and PPO and adds our own reward rules.

    base   built-in reward, untouched
    fee    built-in reward minus a small fee every frame
    hover  BROKEN ON PURPOSE: +1 for every frame the rocket is upright and slow
    fixed  pays for *getting* calmer (change between frames) minus the fee
    """

    def __init__(self, env, mode="base"):
        super().__init__(env)
        self.mode, self.prev = mode, 0.0

    def reset(self, **kwargs):
        obs, info = self.env.reset(**kwargs)
        self.prev = calmness(obs)
        return obs, info

    def step(self, action):
        obs, reward, terminated, truncated, info = self.env.step(action)
        if self.mode == "fee":
            reward -= FEE
        elif self.mode == "hover":
            reward += 1.0 if calm(obs) else 0.0
        elif self.mode == "fixed":
            now = calmness(obs)
            reward += (now - self.prev) - FEE
            self.prev = now
        return obs, reward, terminated, truncated, info


def random_demo(headless):
    env = gym.make(ENV_ID, render_mode=None if headless else "human")
    for episode in range(1 if headless else 5):
        obs, _ = env.reset(seed=episode)
        total, frame, done = 0.0, 0, False
        while not done:
            if frame % 25 == 0:
                print("  ".join(f"{n}={v:+.2f}" for n, v in zip(OBS_NAMES, obs)))
            obs, reward, terminated, truncated, _ = env.step(env.action_space.sample())
            total, frame, done = total + reward, frame + 1, terminated or truncated
        print(f"episode {episode}: {frame} frames, score {total:.0f}\n")
    env.close()


def train(mode, steps, n_envs, seed, subproc, threads):
    import torch
    from stable_baselines3 import PPO
    from stable_baselines3.common.callbacks import BaseCallback
    from stable_baselines3.common.env_util import make_vec_env
    from stable_baselines3.common.vec_env import DummyVecEnv, SubprocVecEnv

    torch.set_num_threads(threads)  # the network is tiny; extra threads mostly add overhead

    class Progress(BaseCallback):
        """Prints the built-in game score (not our shaped one) about ten times per run."""

        def __init__(self):
            super().__init__()
            self.next = 0

        def _on_step(self):
            return True

        def _on_rollout_end(self):
            if self.num_timesteps >= self.next and self.model.ep_info_buffer:
                self.next = self.num_timesteps + steps // 10
                buf = self.model.ep_info_buffer
                fps = self.num_timesteps / (time.time() - start)
                print(f"[{mode}] {self.num_timesteps:>9,} steps  ep_rew_mean {np.mean([e['r'] for e in buf]):7.1f}"
                      f"  ep_len_mean {np.mean([e['l'] for e in buf]):6.0f}  {fps:,.0f} fps", flush=True)

    env = make_vec_env(ENV_ID, n_envs=n_envs, seed=seed, vec_env_cls=SubprocVecEnv if subproc else DummyVecEnv,
                       wrapper_class=ShapedReward, wrapper_kwargs={"mode": mode})
    # RL-Zoo tuned settings for Lunar Lander; MlpPolicy is the standard 2x64 network.
    model = PPO("MlpPolicy", env, n_steps=1024, batch_size=64, n_epochs=4, gamma=0.999,
                gae_lambda=0.98, ent_coef=0.01, device="cpu", seed=seed, verbose=0)
    start = time.time()
    model.learn(total_timesteps=steps, callback=Progress())
    MODELS.mkdir(exist_ok=True)
    model.save(MODELS / mode)
    env.close()
    print(f"[{mode}] trained {steps:,} steps in {(time.time() - start) / 60:.1f} min", flush=True)


def fly(model, env, seed):
    obs, _ = env.reset(seed=seed)
    total, frames = 0.0, 0
    while True:
        action, _ = model.predict(obs, deterministic=True)
        obs, reward, terminated, truncated, _ = env.step(int(action))
        total, frames = total + reward, frames + 1
        if terminated or truncated:
            return total, frames, truncated and not terminated


def evaluate(mode, episodes):
    from stable_baselines3 import PPO

    model = PPO.load(MODELS / mode, device="cpu")
    env = gym.make(ENV_ID)  # wrapper OFF: our own bonus can't flatter the score
    runs = [fly(model, env, 1000 + i) for i in range(episodes)]
    env.close()
    scores = [r[0] for r in runs]
    result = {
        "mean_score": round(float(np.mean(scores)), 1),
        "std": round(float(np.std(scores)), 1),
        "solved_pct": round(100 * float(np.mean([s >= 200 for s in scores]))),
        "mean_frames": round(float(np.mean([r[1] for r in runs]))),
        "timed_out_pct": round(100 * float(np.mean([r[2] for r in runs]))),  # hovering shows up here
        "episodes": episodes,
    }
    everything = json.loads(RESULTS.read_text()) if RESULTS.exists() else {}
    everything[mode] = result
    RESULTS.write_text(json.dumps(everything, indent=2))
    print(f"[{mode}] {result}", flush=True)


def record(mode):
    from gymnasium.wrappers import RecordVideo
    from stable_baselines3 import PPO

    model = PPO.load(MODELS / mode, device="cpu")
    env = RecordVideo(gym.make(ENV_ID, render_mode="rgb_array"), str(VIDEOS), name_prefix=mode,
                      episode_trigger=lambda e: True, disable_logger=True)
    score, frames, _ = fly(model, env, 1000)
    env.close()
    print(f"[{mode}] recorded videos/{mode}-episode-0.mp4 ({frames} frames, score {score:.0f})", flush=True)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("command", choices=("random", "train", "eval", "record", "all"))
    p.add_argument("--reward", choices=REWARDS, default="base")
    p.add_argument("--steps", type=int, default=1_000_000)
    p.add_argument("--envs", type=int, default=16)
    p.add_argument("--episodes", type=int, default=20)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--headless", action="store_true", help="random: no game window")
    p.add_argument("--subproc", action="store_true", help="train: one process per env")
    p.add_argument("--threads", type=int, default=1, help="train: PyTorch CPU threads")
    a = p.parse_args()

    if a.command == "random":
        random_demo(a.headless)
    elif a.command == "all":  # the four experiments are independent, so run them side by side
        import subprocess
        import sys

        opts = ["--steps", str(a.steps), "--envs", str(a.envs), "--seed", str(a.seed), "--episodes", str(a.episodes)]
        jobs = [subprocess.Popen([sys.executable, __file__, "train", "--reward", m, *opts]) for m in REWARDS]
        if any(j.wait() for j in jobs):
            sys.exit("a training run failed")
        for mode in REWARDS:
            evaluate(mode, a.episodes)
            record(mode)
    else:
        if a.command == "train":
            train(a.reward, a.steps, a.envs, a.seed, a.subproc, a.threads)
        elif a.command == "eval":
            evaluate(a.reward, a.episodes)
        else:
            record(a.reward)


if __name__ == "__main__":  # required: the env workers are separate processes on Windows
    main()
