"""TASKS.csv #3975 — a stored GemPy reference model, to compare before and after a GemPy / gempy_engine / numpy / scipy update.
Run: venv python tests/test_reference_gempy.py   (a real GemPy solve: two small models, ~1 min)
     venv python tests/test_reference_gempy.py --measure   the run-to-run and float32 / float64 spread the tolerance is set from
     venv python tests/test_reference_gempy.py --store     rewrite tests/reference/gempy_two_units.json (deliberately, after a review)

The model is synthetic: two surfaces of a gently plunging anticline 200 m apart (Upper over Lower), only 6 points each and three
orientations (between them the shape is GemPy's interpolation), in a 1000 x 800 x 600 m box at 16^3, solved through implicit_model as the app sends it, once ONLAP
(one scalar field, the app's Conformable) and once ERODE (one group per surface). Each surface's height is read at 25 probe
points inside the data (linear interpolation over the mesh vertices) and compared with the stored heights:
  * |dz| <= tolerance.z_m (in the JSON: 0.1 m) at every probe. Set from --measure: the numerical noise is <= 0.001 m (a repeat run,
    float32 against float64), and a behaviour change is far larger: GemPy's range doubled moves the surfaces 0.54 m, halved 2.4-2.8 m;
  * GemPy's own default range (range_default) within 1e-6 relative;
  * the input scale ratios 1 : 1 : 1 (#655).
A result that moved is not a failure to hide: say it in the release notes and store the new reference with --store.
Synthetic data only."""
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.main import implicit_model, ImplicitModelRequest  # noqa: E402

REF = os.path.join(os.path.dirname(__file__), "reference", "gempy_two_units.json")
EXTENT = [0.0, 1000.0, 0.0, 800.0, -600.0, 0.0]
RES = [16, 16, 16]
GAP = 200.0  # Lower is 200 m under Upper
PROBES = [(float(x), float(y)) for x in range(200, 801, 150) for y in range(200, 601, 100)]


def upper(x, y):
    """a gently plunging anticline, its axis along y at x = 500 m"""
    return -150.0 - 0.0004 * (x - 500.0) ** 2 + 0.05 * (y - 400.0)


def grad(x, y):
    return -0.0008 * (x - 500.0), 0.05


def orientation(x, y, z):
    gx, gy = grad(x, y)
    dip = math.degrees(math.atan(math.hypot(gx, gy)))
    az = math.degrees(math.atan2(-gx, -gy)) % 360.0  # the down-dip direction, clockwise from north
    return dict(x=x, y=y, z=z, dip=dip, azimuth=az)


def request(relation, precision="float32"):
    surfs = []
    for name, dz in (("Upper", 0.0), ("Lower", -GAP)):
        # few points on purpose: between them the surface's shape is GemPy's interpolation, which is what an update could move
        pts = [dict(x=float(x), y=float(y), z=upper(x, y) + dz) for x in (150, 500, 850) for y in (150, 650)]
        ors = [orientation(float(x), 400.0, upper(x, 400.0) + dz) for x in (200, 500, 800)]
        surfs.append(dict(name=name, points=pts, orientations=ors))
    return ImplicitModelRequest(extent=EXTENT, resolution=RES, relation=relation, precision=precision, surfaces=surfs)


def heights(mesh):
    from scipy.interpolate import LinearNDInterpolator
    v = np.asarray(mesh.vertices, dtype=float)
    f = LinearNDInterpolator(v[:, :2], v[:, 2])
    return [round(float(f(x, y)), 3) for x, y in PROBES]


def solve(relation, precision="float32"):
    res = implicit_model(request(relation, precision))
    out = {s.name: heights(s) for s in res.surfaces}
    return dict(range_default=res.range_default, input_scale_ratios=res.input_scale_ratios, heights=out)


def versions():
    from importlib.metadata import version
    return {p: version(p) for p in ("gempy", "gempy_engine", "numpy", "scipy")}


def load():
    with open(REF, encoding="utf-8") as fh:
        return json.load(fh)


def check(relation):
    ref = load()
    tol = ref["tolerance"]["z_m"]
    want = ref["relations"][relation]
    got = solve(relation)
    worst = 0.0
    for name, zs in want["heights"].items():
        dz = np.abs(np.asarray(got["heights"][name]) - np.asarray(zs))
        assert np.all(np.isfinite(dz)), (relation, name, "a probe fell outside the surface")
        worst = max(worst, float(dz.max()))
        assert dz.max() <= tol, f"{relation} {name}: moved {dz.max():.2f} m at probe {PROBES[int(dz.argmax())]} (tolerance {tol} m; stored with {ref['versions']}, now {versions()})"
    rd = ref["tolerance"]["range_default_rel"]
    assert abs(got["range_default"] - want["range_default"]) <= rd * abs(want["range_default"]), (relation, got["range_default"], want["range_default"])
    assert max(got["input_scale_ratios"]) < 1.0001, got["input_scale_ratios"]
    print(f"{relation}: largest move {worst:.3f} m (tolerance {tol} m), range_default {got['range_default']:.6g}")


def test_onlap_matches_reference():
    check("onlap")


def test_erode_matches_reference():
    check("erode")


def test_reference_is_synthetic_and_stated():
    ref = load()
    assert ref["data"] == "synthetic", "reference models use synthetic data only"
    assert ref["tolerance"]["z_m"] > 0 and ref["probes"] == [list(p) for p in PROBES]
    # the stored model honours its own input: within a cell of the analytic surfaces (a sanity check on the stored numbers)
    cell = (EXTENT[5] - EXTENT[4]) / RES[2]
    for rel in ("onlap", "erode"):
        for name, dz in (("Upper", 0.0), ("Lower", -GAP)):
            err = max(abs(z - (upper(x, y) + dz)) for (x, y), z in zip(PROBES, ref["relations"][rel]["heights"][name]))
            assert err < cell, (rel, name, err, cell)


def measure():
    """run-to-run and float32 / float64 spread, per relation: what the tolerance is set from"""
    for rel in ("onlap", "erode"):
        a, b, c = solve(rel), solve(rel), solve(rel, "float64")
        for name in a["heights"]:
            za, zb, zc = (np.asarray(r["heights"][name]) for r in (a, b, c))
            ana = np.asarray([upper(x, y) + (0.0 if name == "Upper" else -GAP) for x, y in PROBES])
            print(f"{rel} {name}: repeat max {np.abs(za - zb).max():.4f} m, float32 vs float64 max {np.abs(za - zc).max():.4f} m, "
                  f"vs the analytic surface max {np.abs(za - ana).max():.2f} m")
        # what a behaviour change looks like: GemPy's range doubled / halved (the #274 lever)
        for k in (0.5, 2.0):
            r = request(rel)
            r.range_multiplier = k
            res = implicit_model(r)
            for s in res.surfaces:
                print(f"{rel} {s.name}: range x{k} moves max {np.abs(np.asarray(heights(s)) - np.asarray(a['heights'][s.name])).max():.3f} m")


def store():
    tol = 0.1  # measured 2026-11-23: noise <= 0.001 m (repeat, float32 vs float64); GemPy's range x2 moves 0.54 m, x0.5 2.4-2.8 m
    ref = dict(
        note="TASKS.csv #3975 — GemPy reference model (tests/test_reference_gempy.py). Synthetic: a plunging anticline, two surfaces.",
        data="synthetic", versions=versions(), extent=EXTENT, resolution=RES, probes=[list(p) for p in PROBES],
        tolerance=dict(z_m=tol, range_default_rel=1e-6),
        relations={rel: solve(rel) for rel in ("onlap", "erode")},
    )
    os.makedirs(os.path.dirname(REF), exist_ok=True)
    with open(REF, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(ref, fh, indent=1)
        fh.write("\n")
    print("stored", REF, ref["versions"])


if __name__ == "__main__":
    if "--measure" in sys.argv:
        measure()
    elif "--store" in sys.argv:
        store()
    else:
        test_onlap_matches_reference()
        test_erode_matches_reference()
        test_reference_is_synthetic_and_stated()
        print("ALL PASSED")
