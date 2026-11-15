"""TASKS.csv #2640 (Stage 1) — the structure-fit sensitivity pass on a SYNTHETIC two-contact model under a gravity survey: a point on a shallow
contact with a strong density contrast is 'seen', one on a deep contact with a small contrast 'not constrained'; the smooth boundary's
derivative holds between two step sizes; a re-solve of the unit properties recovers them from data made with them; the size guard refuses.
Plain script (no pytest in the venv): python tests/test_structfit.py
"""
import math
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.geophys import structfit  # noqa: E402


def model_request(res=24):
    def surf(name, z0, dip, pts):
        g = math.tan(math.radians(dip))
        return {"name": name, "points": [{"x": x, "y": y, "z": z0 - g * (x - 1000)} for x, y in pts],
                "orientations": [{"x": 1000.0, "y": 1000.0, "z": z0, "dip": dip, "azimuth": 90.0, "polarity": 1}]}
    pts = [(x, y) for x in (300.0, 700.0, 1000.0, 1300.0, 1700.0) for y in (500.0, 1500.0)]
    return {"extent": [0, 2000, 0, 2000, -1000, 0], "resolution": [res] * 3, "relation": "erode",
            "surfaces": [surf("top_B", -200.0, 15.0, pts), surf("top_C", -800.0, 5.0, pts)]}


def base_request():
    xs = np.linspace(150, 1850, 15)
    st = [[x, y, 30.0] for x in xs for y in xs]
    return {"model": model_request(), "method": "grav", "stations": st, "uncertainty": {"floor": 0.05, "percent": 0.0},
            "properties": {"1": 0.0, "2": 0.30, "3": 0.32},  # unit 1 above top_B; 2 between; 3 below top_C (a small contrast)
            "movable": [{"surface": "top_B", "index": 4, "maxM": 100.0}, {"surface": "top_C", "index": 4, "maxM": 100.0}]}


def check_sensitivity():
    t0 = time.time()
    events = []
    out = structfit.run_job(base_request(), events.append)
    a, b = out["points"]
    print(f"one solve {out['solveSeconds']} s; job {out['seconds']} s; progress events {len(events)}")
    print(f"top_B (200 m deep, 0.30 g/cc): {a['rmsPerM']:.4f} sigma a metre (RMS), one sigma at {a['shiftForOneSigma']:.1f} m, seen {a['seen']}, band {a['bandCells']} cells, units {a['units']}")
    print(f"top_C (800 m deep, 0.02 g/cc): {b['rmsPerM']:.5f} sigma a metre, one sigma at {b['shiftForOneSigma'] if b['shiftForOneSigma'] is None else round(b['shiftForOneSigma'])} m, seen {b['seen']}")
    assert a["seen"] and not b["seen"], (a, b)
    assert a["units"] == [1, 2] and b["units"] == [2, 3], (a["units"], b["units"])
    assert a["rmsPerM"] > 20 * b["rmsPerM"]
    return a


def check_step_stable():
    # the smooth boundary's derivative: a quarter-cell step and a half-cell step agree (a hard block would give 0 or a jump)
    from app.main import ImplicitModelRequest
    req = base_request()
    mreq = ImplicitModelRequest(**req["model"])
    res = [24, 24, 24]
    base = structfit._solve(mreq, res)
    mesh, idx, lo = structfit._mesh(mreq, res, base["xyz"])
    st = np.asarray(req["stations"], float) - lo
    b0 = structfit._band(base, "top_B")
    per = []
    for step in (10.4, 20.8):
        mv = structfit._solve(mreq, res, ("top_B", 4, step))
        b1 = structfit._band(mv, "top_B", w=b0[4])
        cells = b0[0] | b1[0]
        dshare = np.where(cells, b1[1] - b0[1], 0.0)
        vm = np.zeros(mesh.n_cells); mm = np.zeros(mesh.n_cells, bool)
        vm[idx[cells]] = 0.30 * dshare[cells]; mm[idx[cells]] = True
        per.append(structfit._forward("grav", mesh, mm, vm, st, {}) / step)
        hard = int((mv["lith"] != base["lith"]).sum())
        print(f"step {step} m: hard block cells changed {hard}; peak response {np.max(np.abs(per[-1])):.5f} mGal a metre")
    ratio = np.max(np.abs(per[1])) / np.max(np.abs(per[0]))
    corr = float(np.corrcoef(per[0], per[1])[0, 1])
    print(f"half-cell / quarter-cell step: peak ratio {ratio:.3f}, pattern correlation {corr:.4f}")
    assert 0.8 < ratio < 1.25 and corr > 0.98, (ratio, corr)


def check_resolve_and_guard():
    req = base_request()
    # data made with known properties (2: 0.25, 3: 0.40) from the model's own forward, plus a base level; the re-solve must find them
    from app.main import ImplicitModelRequest
    mreq = ImplicitModelRequest(**req["model"])
    res = [24, 24, 24]
    base = structfit._solve(mreq, res)
    mesh, idx, lo = structfit._mesh(mreq, res, base["xyz"])
    st = np.asarray(req["stations"], float) - lo
    vm = np.zeros(mesh.n_cells); mm = np.ones(mesh.n_cells, bool)
    # absolute densities with a background of 2.67 (the reference, kept as entered): the contrasts 0.25 and 0.40 are densities 2.92 and 3.07
    vals = np.select([base["lith"] == 2, base["lith"] == 3], [0.25, 0.40], 0.0)
    vm[idx] = vals
    obs = structfit._forward("grav", mesh, mm, vm, st, {}) + 1.5
    areq = {**req, "properties": {"1": 2.67, "2": 2.80, "3": 2.85}, "observed": obs.tolist(), "movable": req["movable"][:1], "resolve": {"2": [2.67, 4.0], "3": [2.67, 4.0]}}
    out = structfit.run_job(areq, lambda e: None)
    r = out["resolved"]
    print(f"re-solved: {r['properties']} (true 2.92, 3.07; background {r['background']} kept), base level {r['baseLevel']:.3f} (1.5); rms {r['rms']:.2e} vs entered {r['rmsEntered']:.1f}")
    assert abs(r["properties"]["2"] - 2.92) < 0.01 and abs(r["properties"]["3"] - 3.07) < 0.02 and r["rms"] < 0.1 * r["rmsEntered"] and r["background"] == 2.67
    # a bound on the background is ignored (it is the reference)
    out2 = structfit.run_job({**areq, "resolve": {**areq["resolve"], "1": [0.0, 1.0]}}, lambda e: None)
    assert set(out2["resolved"]["properties"]) == {"2", "3"}
    # the size guard: a 10-minute limit at about the measured solve time refuses before the points are run
    old = structfit.MAX_SECONDS
    structfit.MAX_SECONDS = 0.5
    try:
        structfit.run_job(req, lambda e: None)
        raise AssertionError("the size guard did not refuse")
    except ValueError as e:
        assert "mark fewer points" in str(e), e
        print("size guard:", str(e)[:120])
    finally:
        structfit.MAX_SECONDS = old


def check_validation():
    from fastapi import HTTPException
    from app.main import _validate_structfit
    good = base_request()
    _validate_structfit(good)
    hole = base_request(); hole["model"]["surfaces"][0]["points"][4]["hole_id"] = "DDH-7"
    no_max = base_request(); del no_max["movable"][0]["maxM"]
    no_floor = base_request(); no_floor["uncertainty"] = {"percent": 2}
    mag = {**base_request(), "method": "mag"}
    for bad, why in [(hole, "a drillhole contact moved"), (no_max, "no distance"), (no_floor, "no uncertainty floor"), (mag, "magnetics without the field")]:
        try:
            _validate_structfit(bad)
        except HTTPException as e:
            if bad is hole:
                assert "never moves" in str(e.detail), e.detail
            continue
        raise AssertionError(f"accepted {why}")
    print("validation: a good request passes; a drillhole point, no distance, no floor, magnetics without a field are refused")


def check_full_record_3633():
    """TASKS.csv #3633 — what the app sends from a record that carries the run's relation, packages, fault offsets, range multiplier and precision:
    onlap, two surfaces sharing one conformable package ahead of a second package, a fault offsetting all three, range x0.7, float64. The engine
    builds it as sent (a vertical column reads units 1, 2, 3, 4 top-down: the pass numbers a unit by the surface whose top it is, packages
    included), the range multiplier changes the field it solves, and the sensitivity job runs on a point of the second surface of a package."""
    from app.main import ImplicitModelRequest

    def surf(name, z0, dip, pts, **extra):
        g = math.tan(math.radians(dip))
        return {"name": name, "points": [{"x": x, "y": y, "z": z0 - g * (x - 1000)} for x, y in pts],
                "orientations": [{"x": 1000.0, "y": 1000.0, "z": z0, "dip": dip, "azimuth": 90.0, "polarity": 1}], **extra}
    pts = [(x, y) for x in (300.0, 700.0, 1000.0, 1300.0, 1700.0) for y in (500.0, 1500.0)]
    fpts = [(900.0, y) for y in (300.0, 900.0, 1500.0)]
    fault = {"name": "F1", "points": [{"x": x, "y": y, "z": -z} for (x, y) in fpts for z in (100.0, 500.0, 900.0)],
             "orientations": [{"x": 900.0, "y": 900.0, "z": -500.0, "dip": 85.0, "azimuth": 270.0, "polarity": 1}], "offsets": ["top_B", "top_B2", "top_C"]}
    model = {"extent": [0, 2000, 0, 2000, -1000, 0], "resolution": [20, 20, 20], "relation": "onlap", "range_multiplier": 0.7, "precision": "float64",
             "surfaces": [surf("top_B", -150.0, 8.0, pts, package=0), surf("top_B2", -350.0, 8.0, pts, package=0), surf("top_C", -750.0, 4.0, pts, package=1)],
             "faults": [fault]}
    req = ImplicitModelRequest(**model)
    assert req.relation == "onlap" and req.range_multiplier == 0.7 and req.precision == "float64" and [s.package for s in req.surfaces] == [0, 0, 1]
    res = [20, 20, 20]
    sol = structfit._solve(req, res)
    xyz, lith = sol["xyz"], sol["lith"]
    col = np.flatnonzero((np.abs(xyz[:, 0] - xyz[:, 0][np.argmin(np.abs(xyz[:, 0] - 400))]) < 1e-6) & (np.abs(xyz[:, 1] - xyz[:, 1][np.argmin(np.abs(xyz[:, 1] - 400))]) < 1e-6))
    order = col[np.argsort(-xyz[col, 2])]
    seq = [int(lith[order[0]])]
    for i in order[1:]:
        if int(lith[i]) != seq[-1]:
            seq.append(int(lith[i]))
    print(f"onlap + two packages + a fault + range x0.7 + float64: unit ids down a column {seq}")
    assert seq == [1, 2, 3, 4], seq
    plain = structfit._solve(ImplicitModelRequest(**{**model, "range_multiplier": None, "precision": "float32"}), res)
    d = float(np.abs(sol["phi"] - plain["phi"]).max())
    print(f"the range multiplier / precision change the solved field: max |d phi| {d:.3g}")
    assert d > 1e-6
    st = [[x, y, 30.0] for x in np.linspace(150, 1850, 8) for y in np.linspace(150, 1850, 8)]
    out = structfit.run_job({"model": model, "method": "grav", "stations": st, "uncertainty": {"floor": 0.05, "percent": 0.0},
                             "properties": {"1": 0.0, "2": 0.30, "3": 0.35, "4": 0.40}, "movable": [{"surface": "top_B2", "index": 4, "maxM": 100.0}]}, lambda ev: None)
    a = out["points"][0]
    print(f"top_B2 (second surface of package 0): {a['rmsPerM']:.4f} sigma a metre, one sigma at {a['shiftForOneSigma']:.1f} m, seen {a['seen']}, units {a['units']}")
    assert a["units"] == [2, 3] and a["rmsPerM"] > 0


def check_magnetics():
    """TASKS.csv #3664 follow-up — the same two-contact model under a magnetic survey (induced only): a shallow contact with a strong susceptibility
    contrast is seen, a deep one with a small contrast is not; the job runs end to end with the field as sent by the panel"""
    req = base_request()
    req["method"] = "mag"
    req["field"] = {"strength": 57000.0, "inclination": 70.0, "declination": 15.0}
    req["properties"] = {"1": 0.0, "2": 0.05, "3": 0.052}  # SI
    req["uncertainty"] = {"floor": 1.0, "percent": 0.0}   # nT
    out = structfit.run_job(req, lambda ev: None)
    a, b = out["points"]
    print(f"magnetics: top_B {a['rmsPerM']:.4f} sigma a metre, one sigma at {a['shiftForOneSigma']:.1f} m, seen {a['seen']}; top_C {b['rmsPerM']:.5f} sigma a metre, seen {b['seen']}")
    assert a["seen"] and not b["seen"] and a["rmsPerM"] > 10 * b["rmsPerM"], (a, b)


if __name__ == "__main__":
    check_validation()
    check_sensitivity()
    check_step_stable()
    check_resolve_and_guard()
    check_full_record_3633()
    check_magnetics()
    print("structfit: all checks passed")
