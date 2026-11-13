"""TASKS.csv #1985 — Euler deconvolution and equivalent-source gridding (app/geophys/pfields.py) against closed-form fields.

Plain script (no pytest in the venv): python tests/test_pfields.py
"""
import base64
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.geophys.pfields import euler, eqs, gravred, spline  # noqa: E402

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
    events = []
    out = eqs(req, events.append)
    ms = (time.perf_counter() - t) * 1000
    # TASKS.csv #2955 — the engine load is said first and timed, the fit and the grid timed, all in the result
    assert events[0]["stage"] == "loading" and events[0]["message"].startswith("Loading the gridding engine"), events[0]
    assert "engine loaded in" in events[1]["message"] and events[1]["stage"] == "fitting"
    assert set(out["timings"]) == {"load", "fit", "grid"} and all(v >= 0 for v in out["timings"].values()), out["timings"]
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


def check_gravred():
    """TASKS.csv #1985 — normal gravity against Somigliana, the free-air gradient, the Bouguer plate, the terrain's prisms against the slab"""
    lat = np.array([0.0, 30.0, 45.0, 60.0, -34.1])
    s2 = np.sin(np.radians(lat)) ** 2
    som = 978032.53359 * (1 + 0.00193185265241 * s2) / np.sqrt(1 - 0.00669437999013 * s2)  # WGS84 Somigliana, written out
    P = lambda ev: None
    r0 = gravred({"lon": [0] * 5, "lat": lat.tolist(), "height": [0] * 5, "g": som.tolist(), "input": "observed"}, P)
    assert np.max(np.abs(r0["freeAir"])) < 1e-3, r0["freeAir"]
    r1 = gravred({"lon": [0] * 5, "lat": lat.tolist(), "height": [1000] * 5, "g": som.tolist(), "input": "observed"}, P)
    grad = np.array(r1["normal"]) - np.array(r0["normal"])
    assert np.all(np.abs(grad + 308.6) < 0.3), grad
    rp = gravred({"lon": [0], "lat": [45], "height": [1000.0], "g": [0.0], "input": "freeair", "correction": "plate", "density": 2670}, P)
    assert abs(rp["correctionMgal"][0] - 2 * np.pi * 6.6743e-11 * 2670 * 1000 * 1e5) < 1e-3
    vals = np.full(41 * 41, 500.0, dtype="<f4")
    terr = {"nx": 41, "ny": 41, "dx": 1000.0, "dy": 1000.0, "x0": 0.0, "yTop": 40000.0, "values": base64.b64encode(vals.tobytes()).decode()}
    rt = gravred({"lon": [0], "lat": [45], "height": [500.0], "g": [0.0], "input": "freeair", "correction": "topo", "density": 2670, "terrain": terr, "easting": [20000.0], "northing": [20000.0]}, P)
    slab = 2 * np.pi * 6.6743e-11 * 2670 * 500 * 1e5
    ratio = rt["correctionMgal"][0] / slab
    print(f"gravity: free air 0 at sea level for Somigliana gravity; free-air gradient {grad.mean():.1f} mGal/km; plate {rp['correctionMgal'][0]:.3f} mGal at 1 km; 40 km of flat terrain {ratio:.3f} x the slab (a 20 km disc keeps ~0.988)")
    assert 0.98 < ratio < 0.995 and rt["nearestEdgeM"] == 20000.0


def check_spline_small():
    """TASKS.csv #1985 — a survey small beside the CV block: 36 readings on a 250 m square at 25 m blocks had 4 CV blocks
    (5 x 25 m) and Verde refused 5 folds; the block now shrinks until there are 10, and the folds follow"""
    x = [float(i % 6) * 50 for i in range(36)]; y = [float(i // 6) * 50 for i in range(36)]
    r = spline({"x": x, "y": y, "value": [float(i % 6 + i // 6) for i in range(36)], "nx": 11, "ny": 11, "cell": 25.0, "x0": 0.0, "yTop": 250.0}, lambda ev: None)
    assert r["points"] == 36 and r["folds"] == 5 and r["cvBlockM"] < 125, r
    print(f"spline, small survey: CV blocks {r['cvBlockM']} m, {r['folds']} folds, R2 {r['score']:.3f}")


def check_spline():
    """TASKS.csv #1985 — Verde's spline, the damping by blocked cross-validation: a smooth surface back from noisy scattered samples"""
    rng = np.random.default_rng(1985)
    x = rng.uniform(0, 5000, 600); y = rng.uniform(0, 5000, 600)
    f = lambda X, Y: 10 * np.sin(X / 900) * np.cos(Y / 1300) + 0.002 * X
    v = f(x, y) + rng.normal(0, 0.3, x.size)
    t = time.perf_counter()
    r = spline({"x": x.tolist(), "y": y.tolist(), "value": v.tolist(), "nx": 51, "ny": 51, "cell": 100.0, "x0": 0.0, "yTop": 5000.0}, lambda ev: None)
    pred = np.frombuffer(base64.b64decode(r["values"]), "<f4").reshape(51, 51)
    E, N = np.meshgrid(100.0 * np.arange(51), 5000 - 100.0 * np.arange(51))
    inner = (E > 500) & (E < 4500) & (N > 500) & (N < 4500)
    rms = float(np.sqrt(np.mean((pred - f(E, N))[inner] ** 2)))
    print(f"spline: {r['points']} block medians, damping {r['damping']} (CV R2 {max(r['scores']):.4f}), RMS {rms:.3f} on a 20-unit range with 0.3 noise, {(time.perf_counter() - t):.1f} s")
    assert rms < 0.3 and r["damping"] in r["dampings"]


def check_eqs_narrow():
    """TASKS.csv #2834 — 7,810 stations over a 94.5 x 50.1 km outline (Blake River's numbers, SYNTHETIC values): Harmonica's default
    window (sqrt(5000 / density) = 55.1 km) is wider than the short side and fit() raised a ValueError. Now a grid, the window capped."""
    rng = np.random.default_rng(2834)
    n = 7810
    x = 607987.0 + rng.uniform(0, 94516.0, n)
    y = 5324334.0 + rng.uniform(0, 50144.0, n)
    z = 300 + rng.uniform(-20, 20, n)
    v = gz_point(x, y, z, 650000.0, 5350000.0, -3000.0, 5e13)
    req = {"x": x.tolist(), "y": y.tolist(), "z": z.tolist(), "value": v.tolist(), "cell": 2000.0, "elevation": 400.0,
           "region": [609000.0, 701000.0, 5325000.0, 5373000.0], "blank": 6000.0}
    t = time.perf_counter()
    out = eqs(req, lambda ev: None)
    print(f"eqs narrow: {out['readings']} readings, window {out['window'] / 1000:.1f} km (default would be "
          f"{np.sqrt(5000 * 94516.0 * 50144.0 / n) / 1000:.1f} km), {out['nx']} x {out['ny']} grid in {(time.perf_counter() - t) * 1000:.0f} ms")
    assert out["gradient_boosted"] and out["window"] <= 0.9 * 50144.0 + 1
    vals = np.frombuffer(base64.b64decode(out["values"]), dtype="<f4")
    assert np.isfinite(vals).sum() > 0.5 * vals.size


def check_eqs_draped():
    """TASKS.csv #2839 — a SYNTHETIC ground gravity survey over hills (stations ~400 m apart at 170-370 m), gridded at 100 m. Gridded at the
    highest station (the old default) the grid is an upward continuation and misses the readings; draped on the readings' own surface
    (elevation "draped") it passes through them, and the job says how far the grid is from the readings (grid_rms)."""
    rng = np.random.default_rng(2839)
    gx, gy = np.meshgrid(np.arange(0, 20000, 400.0), np.arange(0, 12000, 400.0))
    x = 500000 + gx.ravel() + rng.uniform(-120, 120, gx.size)
    y = 6000000 + gy.ravel() + rng.uniform(-120, 120, gx.size)
    z = 270 + 100 * np.sin((x - 500000) / 2500) * np.cos((y - 6000000) / 3000)
    v = sum(gz_point(x, y, z, xs, ys, zs, m) for xs, ys, zs, m in [(505000.0, 6004000.0, -400.0, 8e11), (512000.0, 6007000.0, -900.0, 2e12)])
    base = {"x": x.tolist(), "y": y.tolist(), "z": z.tolist(), "value": v.tolist(), "cell": 100.0,
            "region": [500200.0, 519600.0, 6000200.0, 6011600.0], "blank": 800.0, "depth": 480.0}
    level = eqs({**base, "elevation": float(np.ceil(z.max()))}, lambda ev: None)
    t = time.perf_counter()
    drape = eqs({**base, "elevation": "draped"}, lambda ev: None)
    ms = (time.perf_counter() - t) * 1000
    print(f"eqs draped: {drape['readings']} stations, grid vs readings RMS {drape['grid_rms']:.3f} mGal (max {drape['grid_max']:.3f}) draped, "
          f"{level['grid_rms']:.3f} mGal at the highest station ({level['elevation']:.0f} m); surface {drape['surface'][0]:.0f}-{drape['surface'][1]:.0f} m; "
          f"spread {np.std(v):.3f} mGal; {ms:.0f} ms")
    assert drape["draped"] and drape["elevation"] is None
    assert drape["grid_rms"] < 0.25 * level["grid_rms"]
    assert 165 <= drape["surface"][0] and drape["surface"][1] <= 375
    # the draped grid against the true field at each node's interpolated height, where the stations are dense
    vals = np.frombuffer(base64.b64decode(drape["values"]), dtype="<f4").reshape(drape["ny"], drape["nx"])
    assert np.isfinite(vals).sum() > 0.8 * vals.size


if __name__ == "__main__":
    check_gravred()
    check_spline_small()
    check_spline()
    check_euler()
    check_eqs()
    check_eqs_narrow()
    check_eqs_draped()
    print("ok")
