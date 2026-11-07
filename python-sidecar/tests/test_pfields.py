"""TASKS.csv #1985 — Euler deconvolution and equivalent-source gridding (app/geophys/pfields.py) against closed-form fields.

Plain script (no pytest in the venv): python tests/test_pfields.py
"""
import base64
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.geophys.pfields import euler, eqs  # noqa: E402

G = 6.674e-11


def gz_point(x, y, z, xs, ys, zs, mass):
    """Vertical gravity (mGal, positive down toward the mass) of a point mass at (xs, ys, zs); z up."""
    dx, dy, dz = x - xs, y - ys, z - zs
    r = np.sqrt(dx * dx + dy * dy + dz * dz)
    return 1e5 * G * mass * dz / r ** 3


def check_euler():
    nx = ny = 101
    dx = 20.0
    x0, ytop = 500000.0, 6000000.0 + dx * (ny - 1)
    e = x0 + dx * np.arange(nx)
    n = ytop - dx * np.arange(ny)  # row 0 north
    E, N = np.meshgrid(e, n)
    xs, ys, depth = x0 + 1000.0, 6000000.0 + 1000.0, 300.0
    g = gz_point(E, N, 0.0, xs, ys, -depth, 5e11)
    req = {"nx": nx, "ny": ny, "dx": dx, "dy": dx, "x0": x0, "yTop": ytop, "values": base64.b64encode(g.astype("<f4").tobytes()).decode(),
           "structural_index": 2, "window": 400.0, "observation_elevation": 0.0}
    t = time.perf_counter()
    out = euler(req, lambda ev: None)
    ms = (time.perf_counter() - t) * 1000
    d, x, y = np.array(out["depth"]), np.array(out["x"]), np.array(out["y"])
    near = np.hypot(x - xs, y - ys) < 200
    print(f"euler: {out['count']} solutions of {out['windows']} windows in {ms:.0f} ms; within 200 m of the mass: {near.sum()}, "
          f"their median depth {np.median(d[near]):.1f} m (true {depth}), position off by {np.median(np.hypot(x[near] - xs, y[near] - ys)):.1f} m")
    assert near.sum() >= 4
    assert abs(np.median(d[near]) - depth) < 0.1 * depth
    assert np.median(np.hypot(x[near] - xs, y[near] - ys)) < 40


def check_eqs():
    rng = np.random.default_rng(1)
    n = 3000
    x = 500000 + rng.uniform(0, 2000, n)
    y = 6000000 + rng.uniform(0, 2000, n)
    z = 50 + 30 * np.sin(x / 300) + rng.uniform(-5, 5, n)  # a draped survey: readings at 15-85 m
    xs, ys, zs = 501000.0, 6001000.0, -200.0
    v = gz_point(x, y, z, xs, ys, zs, 3e11)
    req = {"x": x.tolist(), "y": y.tolist(), "z": z.tolist(), "value": v.tolist(), "cell": 50.0, "elevation": 150.0,
           "region": [500100.0, 501900.0, 6000100.0, 6001900.0], "blank": 150.0}
    t = time.perf_counter()
    out = eqs(req, lambda ev: None)
    ms = (time.perf_counter() - t) * 1000
    vals = np.frombuffer(base64.b64decode(out["values"]), dtype="<f4").reshape(out["ny"], out["nx"])  # row 0 north
    e = out["x0"] + out["dx"] * np.arange(out["nx"])
    nn = out["yTop"] - out["dy"] * np.arange(out["ny"])
    E, N = np.meshgrid(e, nn)
    truth = gz_point(E, N, 150.0, xs, ys, zs, 3e11)
    ok = np.isfinite(vals)
    rel = np.sqrt(np.mean((vals[ok] - truth[ok]) ** 2)) / (truth.max() - truth.min())
    print(f"eqs: {out['readings']} readings at 15-85 m -> {out['nx']} x {out['ny']} grid at 150 m in {ms:.0f} ms "
          f"(gradient-boosted: {out['gradient_boosted']}); RMS vs the field at 150 m: {100 * rel:.2f} % of its range; misfit at the readings {out['rms_misfit']:.4f} mGal (data std {out['data_std']:.3f})")
    assert rel < 0.02
    big = {**req, "x": np.tile(x, 3).tolist(), "y": (np.tile(y, 3) + np.repeat([0, 0.1, 0.2], n)).tolist(), "z": np.tile(z, 3).tolist(), "value": np.tile(v, 3).tolist()}
    t = time.perf_counter()
    ob = eqs(big, lambda ev: None)
    print(f"eqs 9,000 readings: gradient-boosted {ob['gradient_boosted']} in {(time.perf_counter() - t) * 1000:.0f} ms")
    assert ob["gradient_boosted"]


if __name__ == "__main__":
    check_euler()
    check_eqs()
    print("ok")
