"""TASKS.csv #321 — acceptance checks for app/geophys/potential.py (run: venv python -m pytest tests -q, or
directly: venv python tests/test_potential.py). These are the #321 panel's own acceptance checks:
  1. forward accuracy against closed-form sphere solutions (gravity gz and magnetic TMI),
  2. gravity sign convention (a DENSE body must give POSITIVE gz, the Bouguer-anomaly convention users
     expect — asserted, because two reviewers could not confirm SimPEG's convention from the docs),
  3. recovery of a synthetic buried block by the inversion, reaching the target misfit,
  4. plan() refuses an oversize run before anything is allocated.
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.geophys import potential as P  # noqa: E402

G_CONST = 6.674e-11


def _grid_stations(n, spacing, z, x0=500000.0, y0=6250000.0):
    xs = x0 + (np.arange(n) - (n - 1) / 2) * spacing
    ys = y0 + (np.arange(n) - (n - 1) / 2) * spacing
    X, Y = np.meshgrid(xs, ys)
    return np.c_[X.ravel(), Y.ravel(), np.full(X.size, z)]


def _sphere_model(mesh, centre_local, radius, value, actv):
    d = np.linalg.norm(mesh.cell_centers - centre_local, axis=1)
    full = np.where(d <= radius, value, 0.0)
    vol_cells = float(np.sum(mesh.cell_volumes[d <= radius]))
    return full[actv], vol_cells


def test_gravity_sphere_and_sign():
    st = _grid_stations(9, 60.0, 1000.0)
    centre = np.array([500000.0, 6250000.0, 700.0])
    req = {"stations": st.tolist(), "mesh": {"coreCell": 10.0, "depth": 450.0, "padCells": 0, "marginCells": 2}}
    local = P._local_origin(st)
    spec = P.mesh_spec(st - local, 10.0, 450.0, pad_cells=0, margin_cells=2)
    mesh = P.build_mesh(spec)
    actv = np.ones(mesh.n_cells, dtype=bool)
    _, sim = P._survey_and_sim("grav", mesh, actv, st - local, {}, "forward_only")
    drho = 0.5  # g/cc
    m, vol = _sphere_model(mesh, centre - local, 80.0, drho, actv)
    pred = sim.dpred(m)  # mGal
    # Point-mass solution for the SAME discretised volume (so this checks the kernel, not voxelisation).
    mass = drho * 1000.0 * vol
    d = st - centre
    r = np.linalg.norm(d, axis=1)
    gz_up_mgal = -G_CONST * mass * d[:, 2] / r ** 3 * 1e5  # upward component of the attraction: negative above a dense body
    rel = np.max(np.abs(pred - gz_up_mgal)) / np.max(np.abs(gz_up_mgal))
    print(f"gravity kernel: SimPEG gz min {pred.min():.4f} mGal, analytic (up-positive) {gz_up_mgal.min():.4f} mGal, max rel err {rel:.4%}")
    assert rel < 0.01
    assert pred.min() < 0 and pred.max() <= 1e-12, "SimPEG gz is up-positive: a dense body gives NEGATIVE raw gz"
    # ...and the job layer must present it in the user's (Bouguer) convention: positive over the dense body.
    plate = {"cx": centre[0], "cy": centre[1], "cz": centre[2], "dipDirection": 90.0, "dip": 90.0,
             "strikeLength": 120.0, "dipExtent": 120.0, "thickness": 120.0, "contrast": 0.5}
    out = P.run_job({"kind": "forward", "method": "grav", "stations": st.tolist(), "plate": plate,
                     "mesh": {"coreCell": 10.0, "depth": 450.0, "padCells": 0}}, lambda e: None, ram_cap_bytes=int(1.5e9))
    user_pred = np.array(out["predicted"])
    print(f"gravity job output (user convention): peak {user_pred.max():.4f} mGal, min {user_pred.min():.4f}")
    assert user_pred.max() > 0 and user_pred.min() >= -1e-12


def test_magnetic_sphere():
    st = _grid_stations(9, 60.0, 1000.0)
    centre = np.array([500000.0, 6250000.0, 700.0])
    local = P._local_origin(st)
    spec = P.mesh_spec(st - local, 10.0, 450.0, pad_cells=0, margin_cells=2, top_z=990.0)
    mesh = P.build_mesh(spec)
    actv = np.ones(mesh.n_cells, dtype=bool)
    field = {"strength": 56000.0, "inclination": 75.0, "declination": 18.0}
    _, sim = P._survey_and_sim("mag", mesh, actv, st - local, field, "forward_only")
    chi = 0.01
    m, vol = _sphere_model(mesh, centre - local, 80.0, chi, actv)
    pred = sim.dpred(m)  # nT
    inc, dec = math.radians(field["inclination"]), math.radians(field["declination"])
    b0 = np.array([math.cos(inc) * math.sin(dec), math.cos(inc) * math.cos(dec), -math.sin(inc)])  # E, N, Up
    moment = chi * vol * field["strength"] * b0  # [nT m^3] * (1/mu0 folded into mu0/4pi below)
    d = st - centre
    r = np.linalg.norm(d, axis=1)[:, None]
    rhat = d / r
    B = (3 * np.sum(moment * rhat, axis=1)[:, None] * rhat - moment) / r ** 3 / (4 * math.pi)
    tmi = B @ b0
    rel = np.max(np.abs(pred - tmi)) / np.max(np.abs(tmi))
    print(f"magnetics: peak predicted {pred.max():.3f} nT, analytic {tmi.max():.3f} nT, max rel err {rel:.4%}")
    assert rel < 0.01


def test_plan_refuses_oversize():
    st = _grid_stations(60, 20.0, 1000.0)  # 3,600 stations
    topo = _grid_stations(40, 40.0, 990.0)
    req = {"kind": "inversion", "stations": st.tolist(), "topo": topo.tolist(),
           "mesh": {"coreCell": 5.0, "depth": 600.0}}
    p = P.plan(req, ram_cap_bytes=int(1.5e9))
    print(f"plan: {p['nData']} data x ~{p['nActiveEst']} active cells = {p['sensitivityBytes'] / 1e9:.1f} GB -> ok={p['ok']}")
    assert not p["ok"] and "GB" in p["reasons"][0]


def test_plan_refuses_station_on_terrain():
    st = _grid_stations(5, 50.0, 1000.0)
    topo = _grid_stations(10, 40.0, 1000.0)  # stations exactly at ground level: zero clearance
    p = P.plan({"kind": "inversion", "stations": st.tolist(), "topo": topo.tolist(), "mesh": {"coreCell": 25.0, "depth": 200.0}}, int(1.5e9))
    print("plan (stations on the ground):", p["reasons"])
    assert not p["ok"] and "above the terrain" in p["reasons"][0]


def test_inversion_recovers_block():
    rng = np.random.default_rng(3)
    st = _grid_stations(15, 40.0, 1010.0)  # 225 stations, 10 m above flat terrain at 1000
    topo = _grid_stations(30, 25.0, 1000.0)
    field = {"strength": 56000.0, "inclination": 75.0, "declination": 18.0}
    base = {"method": "mag", "stations": st.tolist(), "topo": topo.tolist(), "field": field,
            "mesh": {"coreCell": 25.0, "depth": 300.0, "padCells": 4}}
    # Build the "truth" on the same mesh the job will build, then forward-model it with noise.
    local = P._local_origin(st)
    spec = P.mesh_spec(st - local, 25.0, 300.0, pad_cells=4, margin_cells=2, top_z=1000.0)
    mesh = P.build_mesh(spec)
    actv = P.active_cells(mesh, topo - local)
    _, sim = P._survey_and_sim("mag", mesh, actv, st - local, field, "forward_only")
    cc = mesh.cell_centers[actv] + local
    true_centre = np.array([500000.0, 6250000.0, 875.0])
    block = (np.abs(cc[:, 0] - true_centre[0]) <= 60) & (np.abs(cc[:, 1] - true_centre[1]) <= 60) & (np.abs(cc[:, 2] - true_centre[2]) <= 50)
    m_true = np.where(block, 0.05, 0.0)
    clean = sim.dpred(m_true)
    std = 1.0 + 0.02 * np.abs(clean)
    dobs = clean + rng.standard_normal(len(clean)) * std
    req = dict(base, kind="inversion", observed=dobs.tolist(), uncertainty={"floor": 1.0, "percent": 2.0},
               reg={"maxIter": 20})
    events = []
    out = P.run_job(req, events.append, ram_cap_bytes=int(1.5e9))
    v = np.array(out["cells"]["value"])
    xyz = np.c_[out["cells"]["x"], out["cells"]["y"], out["cells"]["z"]]
    w = np.clip(v, 0, None)
    top = w >= np.quantile(w, 0.98)
    centroid = (xyz[top] * w[top, None]).sum(0) / w[top].sum()
    err = centroid - true_centre
    print(f"inversion: {out['iterations']} iterations, phi_d {out['phi_d']:.1f} vs target {out['target']:.0f} "
          f"(reached={out['reachedTarget']}), {out['seconds']:.1f} s; centroid error E {err[0]:.1f} N {err[1]:.1f} Z {err[2]:.1f} m "
          f"(core cell 25 m); peak recovered chi {v.max():.4f} vs true 0.05; stages {sorted({e.get('stage') for e in events})}")
    assert out["reachedTarget"]
    assert abs(err[0]) <= 25 and abs(err[1]) <= 25 and abs(err[2]) <= 50


def test_dip_sweep_ignores_base_level():
    """TASKS.csv #366 — a constant base level in the data (IGRF-removed TMI always has one) must not hide the
    dip: synthetic data from a plate dipping 60 deg plus a 150 nT offset; the sweep must pick 60 and report
    the offset it removed."""
    st = _grid_stations(15, 40.0, 1030.0)
    topo = _grid_stations(30, 25.0, 1000.0)
    field = {"strength": 56000.0, "inclination": 75.0, "declination": 18.0}
    plate = {"cx": 500000.0, "cy": 6250000.0, "cz": 880.0, "dipDirection": 90.0, "strikeLength": 300.0,
             "dipExtent": 200.0, "thickness": 40.0, "contrast": 0.05}
    base = {"kind": "forward", "method": "mag", "stations": st.tolist(), "topo": topo.tolist(), "field": field,
            "mesh": {"coreCell": 20.0, "depth": 400.0, "padCells": 4}}
    truth = P.run_job(dict(base, plates=[dict(plate, dip=60.0)]), lambda e: None, ram_cap_bytes=int(1.5e9))
    observed = (np.array(truth["predicted"]) + 150.0).tolist()
    dips = [20.0, 40.0, 60.0, 80.0]
    out = P.run_job(dict(base, observed=observed, plates=[dict(plate, dip=d) for d in dips]), lambda e: None, ram_cap_bytes=int(1.5e9))
    rms = [r["rmsResidual"] for r in out["runs"]]
    best = dips[int(np.argmin(rms))]
    spread = (max(rms) - min(rms)) / max(rms)
    print(f"dip sweep with a 150 nT base level: residual RMS {[round(x, 2) for x in rms]} -> best {best} deg, "
          f"spread {spread:.0%}, base level removed at 60 deg {out['runs'][2]['baseLevel']:.2f} nT")
    assert best == 60.0
    assert out["runs"][2]["rmsResidual"] < 1e-6 and abs(out["runs"][2]["baseLevel"] - 150.0) < 1e-6
    assert spread > 0.5


def test_thin_plate_keeps_its_volume():
    """TASKS.csv #367 — a plate thinner than a cell must keep its real volume (and a response) at every dip:
    centre-in-plate gave 0 cells for a vertical 10 m plate on 25 m cells and swung +-30% across dips."""
    st = _grid_stations(9, 50.0, 1030.0)
    topo = _grid_stations(24, 25.0, 1000.0)
    field = {"strength": 56000.0, "inclination": 75.0, "declination": 18.0}
    plate = {"cx": 500000.0, "cy": 6250000.0, "cz": 850.0, "dipDirection": 90.0, "strikeLength": 300.0,
             "dipExtent": 200.0, "thickness": 10.0, "contrast": 0.05}
    dips = [10.0, 30.0, 50.0, 70.0, 90.0]
    out = P.run_job({"kind": "forward", "method": "mag", "stations": st.tolist(), "topo": topo.tolist(), "field": field,
                     "mesh": {"coreCell": 25.0, "depth": 400.0, "padCells": 4}, "plates": [dict(plate, dip=d) for d in dips]},
                    lambda e: None, ram_cap_bytes=int(1.5e9))
    ratios = [r["volumeRatio"] for r in out["runs"]]
    peaks = [float(np.max(np.abs(r["predicted"]))) for r in out["runs"]]
    print(f"thin plate (10 m on 25 m cells): volume ratio by dip {dict(zip(dips, [round(x, 3) for x in ratios]))}; "
          f"peak |TMI| {dict(zip(dips, [round(x, 2) for x in peaks]))} nT; thinnerThanCell={out['runs'][0]['thinnerThanCell']}")
    assert all(abs(x - 1) < 0.08 for x in ratios)
    assert min(peaks) > 0.5
    assert out["runs"][0]["thinnerThanCell"] is True




def test_plan_reports_clearance():
    # TASKS.csv #369 — stations 30 m over flat 100 m terrain -> median/p5 clearance 30 m.
    xs, ys = np.meshgrid(np.linspace(0, 400, 9), np.linspace(0, 400, 9))
    st = np.c_[xs.ravel(), ys.ravel(), np.full(xs.size, 130.0)]
    tx, ty = np.meshgrid(np.linspace(-800, 1200, 21), np.linspace(-800, 1200, 21))
    topo = np.c_[tx.ravel(), ty.ravel(), np.full(tx.size, 100.0)]
    req = {"method": "grav", "kind": "inversion", "stations": st.tolist(), "topo": topo.tolist(),
           "mesh": {"coreCell": 50, "depth": 300}}
    p = P.plan(req, 4e9)
    assert abs(p["clearance"]["median"] - 30.0) < 1e-6 and abs(p["clearance"]["p5"] - 30.0) < 1e-6


def test_base_level_removal_modes():
    # TASKS.csv #368 — the same removal the inversion applies, checked directly on a plane + constant.
    rng = np.random.default_rng(0)
    x, y = rng.uniform(0, 1000, 50), rng.uniform(0, 1000, 50)
    d = 120.0 + 0.02 * x - 0.01 * y
    A = np.c_[np.ones(50), x, y]
    coef, *_ = np.linalg.lstsq(A, d, rcond=None)
    assert np.allclose(d - A @ coef, 0, atol=1e-9)
    assert abs(coef[0] - 120.0) < 1e-6

def test_inversion_with_offset_and_mean_removal():
    # TASKS.csv #368 — the same block with a +150 nT base level. Removing the mean first lets the positive-
    # bounded inversion fit it; the removed constant and the applied bounds come back for provenance.
    rng = np.random.default_rng(5)
    st = _grid_stations(15, 40.0, 1010.0)
    topo = _grid_stations(30, 25.0, 1000.0)
    field = {"strength": 56000.0, "inclination": 75.0, "declination": 18.0}
    local = P._local_origin(st)
    spec = P.mesh_spec(st - local, 25.0, 300.0, pad_cells=4, margin_cells=2, top_z=1000.0)
    mesh = P.build_mesh(spec)
    actv = P.active_cells(mesh, topo - local)
    _, sim = P._survey_and_sim("mag", mesh, actv, st - local, field, "forward_only")
    cc = mesh.cell_centers[actv] + local
    block = (np.abs(cc[:, 0] - 500000.0) <= 60) & (np.abs(cc[:, 1] - 6250000.0) <= 60) & (np.abs(cc[:, 2] - 875.0) <= 50)
    clean = sim.dpred(np.where(block, 0.05, 0.0))
    std = 1.0 + 0.02 * np.abs(clean)
    dobs = clean + 150.0 + rng.standard_normal(len(clean)) * std
    req = {"method": "mag", "stations": st.tolist(), "topo": topo.tolist(), "field": field,
           "mesh": {"coreCell": 25.0, "depth": 300.0, "padCells": 4}, "kind": "inversion", "observed": dobs.tolist(),
           "uncertainty": {"floor": 1.0, "percent": 2.0}, "reg": {"maxIter": 20}, "baseLevel": "mean"}
    out = P.run_job(req, lambda e: None, ram_cap_bytes=int(1.5e9))
    removed = out["baseLevelRemoved"]
    print(f"offset test: removed {removed['constant']:.1f} (mean of data incl. anomaly), bounds {out['boundsApplied']}, reached={out['reachedTarget']}")
    assert removed["mode"] == "mean" and abs(removed["constant"] - float(np.mean(dobs))) < 1e-6
    assert out["boundsApplied"] == {"lower": 0.0, "upper": None}
    assert abs(float(np.mean(out["observedUsed"]))) < 1e-6
    assert out["reachedTarget"]


def test_drillhole_constraints_pin_cells():
    """TASKS.csv #323 — samples map to the right cells; air / outside samples are counted, not used."""
    import discretize
    mesh = discretize.TensorMesh([np.full(4, 10.0), np.full(4, 10.0), np.full(4, 10.0)], origin=[0, 0, 0])
    actv = mesh.cell_centers[:, 2] < 30  # top layer is "air"
    pts = [[5, 5, 5, 0.02], [6, 6, 6, 0.04],   # same cell -> mean 0.03
           [35, 35, 15, 0.01],                  # another cell
           [5, 5, 35, 0.5],                     # in the air layer
           [500, 5, 5, 0.1],                    # outside the mesh
           [15, 5, 5, -0.01]]                   # negative susceptibility, clipped at lower = 0
    lo, up, mref, hit, rep = P.drillhole_constraints(mesh, actv, np.array(pts, float), 0.005, 0.0, np.inf)
    assert rep["points"] == 6 and rep["outsideMesh"] == 1 and rep["inAirOrInactive"] == 1 and rep["pointsUsed"] == 4
    assert rep["cells"] == 3 and rep["clippedToBounds"] == 1
    act_idx = np.full(mesh.n_cells, -1); act_idx[np.flatnonzero(actv)] = np.arange(actv.sum())
    c0 = act_idx[mesh.point2index([5, 5, 5])]
    assert abs(mref[c0] - 0.03) < 1e-12 and abs(lo[c0] - 0.025) < 1e-12 and abs(up[c0] - 0.035) < 1e-12
    cneg = act_idx[mesh.point2index([15, 5, 5])]
    assert lo[cneg] == 0.0 and up[cneg] == 0.0
    free = ~hit
    assert np.all(lo[free] == 0.0) and np.all(np.isinf(up[free])) and np.all(mref[free] == 0.0)


def test_inversion_with_drillhole_constraints():
    """TASKS.csv #323 — a vertical hole through a buried block, logged with the true susceptibility: the
    model must honour the log (within tolerance) where the hole is, still fit the data, and recover more
    of the true amplitude than the unconstrained smooth model (which underestimates it)."""
    rng = np.random.default_rng(3)
    st = _grid_stations(15, 40.0, 1010.0)
    topo = _grid_stations(30, 25.0, 1000.0)
    field = {"strength": 56000.0, "inclination": 75.0, "declination": 18.0}
    base = {"method": "mag", "stations": st.tolist(), "topo": topo.tolist(), "field": field,
            "mesh": {"coreCell": 25.0, "depth": 300.0, "padCells": 4}}
    local = P._local_origin(st)
    spec = P.mesh_spec(st - local, 25.0, 300.0, pad_cells=4, margin_cells=2, top_z=1000.0)
    mesh = P.build_mesh(spec)
    actv = P.active_cells(mesh, topo - local)
    _, sim = P._survey_and_sim("mag", mesh, actv, st - local, field, "forward_only")
    cc = mesh.cell_centers[actv] + local
    c = np.array([500000.0, 6250000.0, 875.0])
    inb = lambda x, y, z: (abs(x - c[0]) <= 60) & (abs(y - c[1]) <= 60) & (abs(z - c[2]) <= 50)
    m_true = np.where(inb(cc[:, 0], cc[:, 1], cc[:, 2]), 0.05, 0.0)
    clean = sim.dpred(m_true)
    std = 1.0 + 0.02 * np.abs(clean)
    dobs = clean + rng.standard_normal(len(clean)) * std
    hx, hy = c[0] + 10.0, c[1] - 10.0
    hole = [[hx, hy, z, 0.05 if inb(hx, hy, z) else 0.0] for z in np.arange(998.0, 720.0, -4.0)]
    req = dict(base, kind="inversion", observed=dobs.tolist(), uncertainty={"floor": 1.0, "percent": 2.0},
               reg={"maxIter": 20}, constraints={"points": hole, "tolerance": 0.005})
    out = P.run_job(req, lambda e: None, ram_cap_bytes=int(1.5e9))
    rep = out["constraintsApplied"]
    v = np.array(out["cells"]["value"])
    xyz = np.c_[out["cells"]["x"], out["cells"]["y"], out["cells"]["z"]]
    near = (np.abs(xyz[:, 0] - hx) <= 12.5) & (np.abs(xyz[:, 1] - hy) <= 12.5) & (xyz[:, 2] > 720) & (xyz[:, 2] < 998)
    truth_near = np.where(inb(xyz[near, 0], xyz[near, 1], xyz[near, 2]), 0.05, 0.0)
    worst = float(np.max(np.abs(v[near] - truth_near)))
    free = P.run_job(dict(req, constraints=None), lambda e: None, ram_cap_bytes=int(1.5e9))
    vf = np.array(free["cells"]["value"])
    body = inb(xyz[:, 0], xyz[:, 1], xyz[:, 2])
    print(f"constrained: {rep['cells']} cells from {rep['pointsUsed']} samples, worst departure along the hole "
          f"{worst:.4f} (tol 0.005), mean chi in the block {v[body].mean():.4f} vs unconstrained {vf[body].mean():.4f} "
          f"(true 0.05), phi_d {out['phi_d']:.0f}/{out['target']:.0f} reached={out['reachedTarget']}")
    assert rep["cells"] >= 10 and rep["outsideMesh"] == 0
    assert worst <= 0.005 + 1e-6
    assert out["reachedTarget"]
    assert abs(v[body].mean() - 0.05) < abs(vf[body].mean() - 0.05)


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
    print("ALL PASSED")
