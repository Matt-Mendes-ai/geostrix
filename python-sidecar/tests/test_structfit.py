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
    vals = np.select([base["lith"] == 2, base["lith"] == 3], [0.25, 0.40], 0.0)
    vm[idx] = vals
    obs = structfit._forward("grav", mesh, mm, vm, st, {}) + 1.5
    out = structfit.run_job({**req, "observed": obs.tolist(), "movable": req["movable"][:1], "resolve": {"2": [0.0, 1.0], "3": [0.0, 1.0]}}, lambda e: None)
    r = out["resolved"]
    print(f"re-solved: {r['properties']} (true 0.25, 0.40), base level {r['baseLevel']:.3f} (1.5); rms {r['rms']:.2e} vs entered {r['rmsEntered']:.1f}")
    assert abs(r["properties"]["2"] - 0.25) < 0.01 and abs(r["properties"]["3"] - 0.40) < 0.02 and r["rms"] < 0.1 * r["rmsEntered"]
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


if __name__ == "__main__":
    check_validation()
    check_sensitivity()
    check_step_stable()
    check_resolve_and_guard()
    print("structfit: all checks passed")
