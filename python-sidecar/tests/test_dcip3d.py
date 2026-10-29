"""TASKS.csv #643 — 3D DC/IP inversion checks (run: venv python tests/test_dcip3d.py).
1. ReciprocalDC3D (one solve per electrode) predicts exactly what SimPEG's own Simulation3DNodal predicts and has the
   same sensitivity matrix, for pole-dipole and dipole-dipole readings, on a model that is not uniform.
2. run_job on three pole-dipole lines over a conductive, chargeable block (10 ohm.m, 50 mV/V in 100 ohm.m, 0 mV/V)
   with 3 % noise: the DC fit reaches its target, the lowest resistivity and the highest chargeability lie in or next
   to the block, and the flat-ground geometric factor path gives the same answer as the draped one on flat ground.
3. TASKS.csv #929: the per-reading floors of the files' error columns raise each reading's floor (request order ->
   survey order), as the 2D inversion does (#683).
"""
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.geophys import dcip3d as D  # noqa: E402

LINES_Y = (0.0, 100.0, 200.0)
X = np.arange(0.0, 501.0, 25.0)  # 21 electrodes per line, 25 m apart
GROUND = 1000.0


def _readings(dipole=False):
    rows, chain = [], []
    for y in LINES_Y:
        for i, xa in enumerate(X):
            for n in range(1, 6):
                if dipole:
                    j = i + 1 + n
                    if j + 1 >= len(X):
                        continue
                    a, b, m, nn = xa, X[i + 1], X[j], X[j + 1]
                    rows.append([a, y, GROUND, b, y, GROUND, m, y, GROUND, nn, y, GROUND]); chain.append([a, b, m, nn])
                else:
                    j = i + n
                    if j + 1 >= len(X):
                        continue
                    a, m, nn = xa, X[j], X[j + 1]
                    rows.append([a, y, GROUND, None, None, None, m, y, GROUND, nn, y, GROUND]); chain.append([a, None, m, nn])
    return rows, chain


def _req(rows, chain, **kw):
    return {"readings": rows, "chain": chain, "rho": [100.0] * len(rows), "uncertainty": {"percent": 3, "floor": 0.0},
            "topo": [[x, y, GROUND] for x in np.arange(-300, 801, 100) for y in np.arange(-300, 501, 100)],
            "mesh": {"core": 25.0, "depth": 150.0}, "maxIter": 15, "geometricFactor": "draped", **kw}


def _block(mesh, active):
    cc = mesh.cell_centers[active]
    return (cc[:, 0] > 200) & (cc[:, 0] < 300) & (cc[:, 1] > 50) & (cc[:, 1] < 150) & (cc[:, 2] < GROUND - 25) & (cc[:, 2] > GROUND - 100)


def _surveys(dc, mesh, active, rows):
    from simpeg.electromagnetics.static.utils import generate_survey_from_abmn_locations
    r = np.asarray([[np.nan if v is None else v for v in row] for row in rows], dtype=float)
    a, b, m, n = r[:, 0:3], r[:, 3:6], r[:, 6:9], r[:, 9:12]
    b = np.where(np.isnan(b), a, b); n = np.where(np.isnan(n), m, n)
    _, order = generate_survey_from_abmn_locations(locations_a=a, locations_b=b, locations_m=m, locations_n=n, data_type="apparent_resistivity", output_sorting=True)
    s = generate_survey_from_abmn_locations(locations_a=a[order], locations_b=b[order], locations_m=m[order], locations_n=n[order], data_type="apparent_resistivity")
    s.drape_electrodes_on_topography(mesh, active, topo_cell_cutoff="top", shift_horizontal=False)
    s.set_geometric_factor()
    return s, np.asarray(order)


def test_reciprocal_matches_simpeg():
    from simpeg import maps
    from simpeg.electromagnetics.static import resistivity as dc
    for dipole in (False, True):
        rows, chain = _readings(dipole)
        mesh, active, _, _ = D.build_mesh(_req(rows, chain))
        n_act = int(active.sum())
        cmap = maps.InjectActiveCells(mesh, active, 1e-8) * maps.ExpMap(nP=n_act)
        rng = np.random.default_rng(3)
        m = np.log(np.where(_block(mesh, active), 1 / 10.0, 1 / 100.0)) + 0.2 * rng.standard_normal(n_act)
        s1, _ = _surveys(dc, mesh, active, rows)
        ref = dc.Simulation3DNodal(mesh, survey=s1, sigmaMap=cmap, storeJ=True, solver=D._solver_class())
        s2, _ = _surveys(dc, mesh, active, rows)
        rec = D._reciprocal_class(dc)(mesh, survey=s2, sigmaMap=cmap, solver=D._solver_class())
        rec.setup_reciprocal(*D.survey_electrodes(s2))
        t = time.time(); d_ref = ref.dpred(m); J_ref = ref.getJ(m); t_ref = time.time() - t
        t = time.time(); d_rec = rec.dpred(m); J_rec = rec.getJ(m); t_rec = time.time() - t
        derr = np.max(np.abs(d_rec - d_ref) / np.abs(d_ref))
        jerr = np.max(np.abs(J_rec - J_ref)) / np.max(np.abs(J_ref))
        print(f"  {'dipole-dipole' if dipole else 'pole-dipole'}: {len(rows)} readings, {n_act} cells; dpred rel err {derr:.1e}, J err {jerr:.1e}; SimPEG {t_ref:.1f} s, reciprocal {t_rec:.1f} s")
        assert derr < 1e-8, derr
        assert jerr < 1e-8, jerr
        v = rng.standard_normal(n_act)
        assert np.allclose(rec.Jvec(m, v), J_ref @ v, rtol=1e-8, atol=1e-12 * np.abs(J_ref @ v).max())


def _synthetic_data(rows, chain):
    from simpeg import maps
    from simpeg.electromagnetics.static import resistivity as dc
    req = _req(rows, chain)
    mesh, active, _, _ = D.build_mesh(req)
    n_act = int(active.sum())
    blk = _block(mesh, active)
    cmap = maps.InjectActiveCells(mesh, active, 1e-8) * maps.ExpMap(nP=n_act)
    s, order = _surveys(dc, mesh, active, rows)
    sim = D._reciprocal_class(dc)(mesh, survey=s, sigmaMap=cmap, solver=D._solver_class())
    sim.setup_reciprocal(*D.survey_electrodes(s))
    m = np.log(np.where(blk, 1 / 10.0, 1 / 100.0))
    rho_s = sim.dpred(m)
    eta = np.where(blk, 0.05, 0.0)
    ip_s = (-sim.getJ(m) / rho_s[:, None]) @ eta * 1000.0  # mV/V, the linearized response (Seigel)
    rng = np.random.default_rng(7)
    back = np.argsort(order)  # survey order -> the request's order
    rho = (rho_s * (1 + 0.03 * rng.standard_normal(len(rho_s))))[back]
    ip = (ip_s + 0.03 * np.abs(ip_s) * rng.standard_normal(len(ip_s)) + 0.2 * rng.standard_normal(len(ip_s)))[back]
    return req, rho, ip


def test_recovers_block():
    rows, chain = _readings(False)
    req, rho, ip = _synthetic_data(rows, chain)
    req.update(rho=rho.tolist(), chargeability=ip.tolist(), ipUncertainty={"percent": 3, "floor": 0.5})
    t = time.time()
    events = []
    res = D.run_job(req, events.append)
    c = res["cells"]
    x, y, z = (np.asarray(c[k]) for k in ("x", "y", "z"))
    rr, ch, sup = np.asarray(c["resistivity"]), np.asarray(c["chargeability"]), np.asarray(c["support"])
    seen = sup >= 0.01
    in_blk = (x > 200) & (x < 300) & (y > 50) & (y < 150) & (z < GROUND - 25) & (z > GROUND - 100)  # the true block
    i_lo, i_hi = np.argmin(np.where(seen, rr, np.inf)), np.argmax(np.where(seen, ch, -np.inf))
    print(f"  {len(rr)} cells kept, {time.time() - t:.0f} s; DC phi_d/N {res['phi_d'] / res['target']:.2f} ({res['iterations']} it), IP {res['ip']['phi_d'] / res['target']:.2f}; "
          f"min rho {rr[i_lo]:.1f} at {x[i_lo]:.0f},{y[i_lo]:.0f},{GROUND - z[i_lo]:.0f} m deep; max eta {ch[i_hi]:.1f} at {x[i_hi]:.0f},{y[i_hi]:.0f},{GROUND - z[i_hi]:.0f}; "
          f"block mean log10 rho {np.mean(np.log10(rr[in_blk & seen])):.2f} vs outside {np.mean(np.log10(rr[~in_blk & seen])):.2f}; mean eta {np.mean(ch[in_blk & seen]):.1f} vs {np.mean(ch[~in_blk & seen]):.1f} mV/V")
    print("  fit choice DC", res["fitChoice"], "IP", res["ip"]["fitChoice"])
    assert 0.6 <= res["phi_d"] / res["target"] <= 1.1, res["phi_d"] / res["target"]
    assert 0.6 <= res["ip"]["phi_d"] / res["target"] <= 1.1, res["ip"]["phi_d"] / res["target"]
    near = lambda i: abs(x[i] - 250) <= 75 and abs(y[i] - 100) <= 75 and 0 < GROUND - z[i] <= 125  # in or next to the block
    assert near(i_lo) and near(i_hi)
    assert np.mean(np.log10(rr[in_blk & seen])) < np.mean(np.log10(rr[~in_blk & seen])) - 0.2
    assert np.mean(ch[in_blk & seen]) > 5 * max(0.5, np.mean(ch[~in_blk & seen]))
    assert any(e.get("stage") == "dc" and e.get("iter") for e in events) and any(e.get("stage") == "ip" for e in events)


def test_flat_factor_equals_draped_on_flat_ground():
    from simpeg.electromagnetics.static import resistivity as dc
    rows, chain = _readings(True)
    req = _req(rows, chain, maxIter=1)
    mesh, active, _, _ = D.build_mesh(req)
    s, order = _surveys(dc, mesh, active, rows)
    g_draped = np.concatenate([rx.geometric_factor[src] for src in s.source_list for rx in src.receiver_list])
    ch = np.asarray([[np.nan if v is None else v for v in r] for r in chain])[order]
    inv = lambda p, q: np.where(np.isnan(np.abs(p - q)), 0.0, 1.0 / np.abs(p - q))
    g_flat = (inv(ch[:, 0], ch[:, 2]) - inv(ch[:, 0], ch[:, 3]) - inv(ch[:, 1], ch[:, 2]) + inv(ch[:, 1], ch[:, 3])) / (2 * np.pi)
    err = np.max(np.abs(g_flat - g_draped) / np.abs(g_draped))
    print(f"  flat vs draped geometric factor on flat ground: max rel diff {err:.1e}")
    assert err < 1e-6


def test_plan_is_cheap_and_honest():
    rows, chain = _readings(False)
    p = D.plan(_req(rows, chain), 1.5e9)
    print(f"  plan: {p['cells']} cells, {p['active']} active, {p['readings']} readings, {p['electrodes']} electrodes, ~{p['seconds']} s, solver {p['solver']}")
    assert p["ok"] and p["readings"] == len(rows) and p["electrodes"] == 63
    assert not D.plan(_req(rows, chain), 1e5)["ok"], "a matrix over the cap is refused"
    # TASKS.csv #972 — under the matrix cap but over the peak-memory budget: refused, with the cheaper options named
    tight = D.plan(_req(rows, chain), 1.5e9, p["peakRamBytes"] * 0.9)
    assert not tight["ok"] and "every 2nd current position" in tight["reasons"][0], tight["reasons"]
    assert D.plan(_req(rows, chain), 1.5e9, p["peakRamBytes"] * 1.1)["ok"]


def test_per_reading_floors():
    rho = np.array([100.0, 200.0, 50.0])
    charge = np.array([10.0, 0.0, 30.0])  # mV/V
    order = np.array([2, 0, 1])  # survey order = request readings 2, 0, 1
    req = {"uncertainty": {"percent": 2, "floor": 1.0, "floorPerReadingPercent": [5.0, None, 0.1]},
           "ipUncertainty": {"percent": 0, "floor": 0.5, "floorPerReadingMvV": [None, 2.0, 1.0]}}
    std, ip_std = D.data_std(req, rho[order], charge[order], order)
    # request reading 2 (50 ohm.m, 0.1 % -> 0.05 < floor 1): 1 + 1; reading 0 (100, 5 % -> 5): 2 + 5; reading 1 (200, none): 4 + 1
    assert np.allclose(std, [2.0, 7.0, 5.0]), std
    # IP floors in V/V: max(0.5, own) / 1000 -> reading 2: 1.0, reading 0: 0.5 (none), reading 1: 2.0
    assert np.allclose(ip_std * 1000, [1.0, 0.5, 2.0]), ip_std
    plain, none = D.data_std({"uncertainty": {"percent": 2, "floor": 1.0}}, rho[order], None, order)
    assert np.allclose(plain, 0.02 * rho[order] + 1.0) and none is None
    try:
        D.data_std({"uncertainty": {"percent": 2, "floorPerReadingPercent": [1.0]}}, rho, None, order)
        raise AssertionError("a wrong-length floor list is refused")
    except ValueError:
        pass


def test_support_per_volume():
    """TASKS.csv #1045 — support per unit volume: it falls with depth (the raw column norm rose again in the deep coarse
    cells), and at one depth a coarse cell does not read as better seen than the fine cells beside it."""
    rows, chain = _readings(False)
    req, rho, _ = _synthetic_data(rows, chain)
    req.update(rho=rho.tolist())
    c = D.run_job(req, lambda e: None)["cells"]
    z, dx, sup = np.asarray(c["z"]), np.asarray(c["dx"]), np.asarray(c["support"])
    depth = GROUND - z
    bands = [(0, 50), (50, 100), (100, 200), (200, 300), (300, 400)]
    med = [float(np.median(sup[(depth > a) & (depth <= b)])) if np.any((depth > a) & (depth <= b)) else None for a, b in bands]
    print("  median support by depth", dict(zip([f"{a}-{b} m" for a, b in bands], med)))
    seq = [m for m in med if m is not None]
    assert all(b <= a for a, b in zip(seq, seq[1:])), seq
    band = (depth > 25) & (depth <= 75)
    fine, coarse = band & (dx <= 25), band & (dx >= 50)
    if fine.any() and coarse.any():
        mf, mc = float(np.median(sup[fine])), float(np.median(sup[coarse]))
        print(f"  25-75 m deep: median support {mf:.4f} in 25 m cells, {mc:.4f} in 50 m+ cells")
        assert mc <= mf, (mf, mc)
    # the default 0.02 cutoff now stops near the array's reach (n = 1-5, a = 25 m: ~70 m of pseudo-depth), not at 125 m
    kept = depth[sup >= 0.02]
    print(f"  deepest cell at support >= 0.02: {kept.max():.0f} m")
    assert kept.max() <= 110, kept.max()


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            print(name)
            fn()
    print("all passed")
