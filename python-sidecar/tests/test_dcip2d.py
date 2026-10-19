"""TASKS.csv #322 — 2D DC/IP inversion acceptance check (run: venv python tests/test_dcip2d.py).
A conductive, chargeable block (10 ohm.m, 50 mV/V) in a 100 ohm.m, non-chargeable half-space under a
dipole-dipole line (64 electrodes 10 m apart, a = 20 m, n = 1-6), gently sloping ground. Data are forward-
modelled with SimPEG on the same kind of mesh, 3 % noise added, then inverted by run_job. The inversion must
reach its target misfit and put the lowest resistivity and the highest chargeability inside (or right at)
the block, at far lower resistivity / higher chargeability than the background."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.geophys import dcip2d as D  # noqa: E402


def _synthetic():
    from discretize.utils import active_from_xyz
    from simpeg import maps
    from simpeg.electromagnetics.static import resistivity as dc, induced_polarization as ip
    x = np.arange(64) * 10.0
    rows = []
    for i in range(64):
        for n in range(1, 7):
            a, b = x[i], x[i] + 20
            m, nn = b + n * 20, b + n * 20 + 20
            if nn <= x[-1]:
                rows.append([a, b, m, nn])
    rows = np.array(rows)
    topo = np.c_[np.linspace(-500, 1200, 50), 1000 - 0.05 * np.linspace(-500, 1200, 50)]  # 5 % slope
    pos = np.unique(rows.ravel())
    locs = np.c_[pos, np.interp(pos, topo[:, 0], topo[:, 1])]
    idx = np.searchsorted(pos, rows)
    mesh, _ = D._mesh(pos, topo, 5.0, 150.0)
    tx = np.linspace(mesh.nodes_x[0], mesh.nodes_x[-1], 600)
    active = active_from_xyz(mesh, np.c_[tx, np.interp(tx, topo[:, 0], topo[:, 1])])
    cc = mesh.cell_centers[active]
    ground = np.interp(cc[:, 0], topo[:, 0], topo[:, 1])
    block = (cc[:, 0] > 280) & (cc[:, 0] < 360) & (ground - cc[:, 1] > 20) & (ground - cc[:, 1] < 60)
    sigma = np.where(block, 1 / 10.0, 1 / 100.0)
    cmap = maps.InjectActiveCells(mesh, active, 1e-8)
    survey = D._survey(idx, locs, "apparent_resistivity")
    survey.drape_electrodes_on_topography(mesh, active, topo_cell_cutoff="top", shift_horizontal=False)
    survey.set_geometric_factor()
    rho = dc.Simulation2DNodal(mesh, survey=survey, sigmaMap=cmap).dpred(sigma)
    ip_survey = D._survey(idx, locs, "apparent_chargeability")
    ip_survey.drape_electrodes_on_topography(mesh, active, topo_cell_cutoff="top", shift_horizontal=False)
    eta = np.where(block, 0.05, 0.0)
    charge = ip.Simulation2DNodal(mesh, survey=ip_survey, etaMap=maps.InjectActiveCells(mesh, active, 0.0), sigma=cmap * sigma).dpred(eta) * 1000
    rng = np.random.default_rng(7)
    rho_n = rho * (1 + 0.03 * rng.standard_normal(len(rho)))
    ch_n = charge + (0.03 * np.abs(charge) + 0.5) * rng.standard_normal(len(charge))
    return rows, rho_n, ch_n, topo


def test_dcip2d_recovers_block():
    rows, rho, ch, topo = _synthetic()
    req = {"readings": rows.tolist(), "rho": rho.tolist(), "chargeability": ch.tolist(), "topo": topo.tolist(),
           "mesh": {"cell": 5.0, "depth": 150.0}, "uncertainty": {"percent": 3, "floor": 0.0},
           "ipUncertainty": {"percent": 3, "floor": 0.5}, "maxIter": 20}
    events = []
    out = D.run_job(req, events.append)
    c = out["cells"]
    s, z, res, eta = (np.asarray(c[k]) for k in ("s", "z", "resistivity", "chargeability"))
    ground = np.interp(s, topo[:, 0], topo[:, 1])
    inb = (s > 280) & (s < 360) & (ground - z > 20) & (ground - z < 60)
    far = (s < 150) & (ground - z < 30)
    lo, hi = int(np.argmin(res)), int(np.argmax(eta))
    print(f"DC: {len(out['history'])} iterations, phi_d {out['phi_d']:.0f} / target {out['target']:.0f} (reached={out['reachedTarget']}); "
          f"min resistivity {res[lo]:.1f} at s={s[lo]:.0f} depth={ground[lo]-z[lo]:.0f}; block median {np.median(res[inb]):.1f} vs background {np.median(res[far]):.1f} ohm.m | "
          f"IP: phi_d {out['ip']['phi_d']:.0f}; max {eta[hi]:.1f} mV/V at s={s[hi]:.0f} depth={ground[hi]-z[hi]:.0f}; block median {np.median(eta[inb]):.1f} | {out['seconds']:.0f} s, stages {sorted({e.get('stage') for e in events})}")
    assert out["reachedTarget"]
    assert 260 <= s[lo] <= 380 and 5 <= ground[lo] - z[lo] <= 80
    assert np.median(res[inb]) < 0.5 * np.median(res[far])
    assert 260 <= s[hi] <= 380 and np.median(eta[inb]) > 5 * max(1e-3, np.median(eta[far]))
    # TASKS.csv #771 — no invented resistive patches at depth (sensitivity-weight threshold 1e-2; at SimPEG's
    # default 1e-12 the deep 100 ohm.m host read p95 236, max 661 ohm.m)
    deep = (ground - z > 80) & ~inb
    print(f"deep host (> 80 m): median {np.median(res[deep]):.0f}, p95 {np.percentile(res[deep], 95):.0f}, max {res[deep].max():.0f} ohm.m (true 100)")
    assert np.percentile(res[deep], 95) < 150 and res[deep].max() < 250


def test_pole_dipole_homogeneous():
    """A pole-dipole line (B at infinity, sent as None) over uniform 100 ohm.m ground: the data are exactly
    100 ohm.m apparent resistivity, and the inverted section must stay close to 100 everywhere it is supported."""
    x = np.arange(40) * 10.0
    rows = [[x[i], None, x[i] + n * 10, x[i] + n * 10 + 10] for i in range(40) for n in range(1, 7) if x[i] + n * 10 + 10 <= x[-1]]
    req = {"readings": rows, "rho": [100.0] * len(rows), "mesh": {"cell": 5.0, "depth": 80.0},
           "uncertainty": {"percent": 3}, "maxIter": 10}
    out = D.run_job(req, lambda e: None)
    res = np.asarray(out["cells"]["resistivity"]); sup = np.asarray(out["cells"]["support"])
    seen = res[sup > 0.01]
    print(f"pole-dipole: {len(rows)} readings, phi_d {out['phi_d']:.1f} / {out['target']:.0f}, supported cells {seen.min():.1f}-{seen.max():.1f} ohm.m")
    assert out["reachedTarget"] and seen.min() > 85 and seen.max() < 115


def test_support_not_biased_against_conductors():
    """TASKS.csv #505 — support must not grey out conductive ground just because its apparent resistivities are
    small. Flat line, left half 1000 ohm.m, right half 30 ohm.m: the share of shallow cells under the panel's
    default 0.02 cutoff must be about the same on both sides (unweighted support: ~77% conductive vs 0%)."""
    from discretize.utils import active_from_xyz
    from simpeg import maps
    from simpeg.electromagnetics.static import resistivity as dc
    x = np.arange(64) * 10.0
    rows = np.array([[x[i], x[i] + 20, x[i] + 20 + n * 20, x[i] + 40 + n * 20] for i in range(64) for n in range(1, 7) if x[i] + 40 + n * 20 <= x[-1]])
    topo = np.c_[[-500.0, 1200.0], [1000.0, 1000.0]]
    pos = np.unique(rows.ravel())
    locs = np.c_[pos, np.full(len(pos), 1000.0)]
    idx = np.searchsorted(pos, rows)
    mesh, _ = D._mesh(pos, topo, 5.0, 150.0)
    tx = np.linspace(mesh.nodes_x[0], mesh.nodes_x[-1], 600)
    active = active_from_xyz(mesh, np.c_[tx, np.full(len(tx), 1000.0)])
    cc = mesh.cell_centers[active]
    sigma = np.where(cc[:, 0] < 315, 1 / 1000.0, 1 / 30.0)
    survey = D._survey(idx, locs, "apparent_resistivity")
    survey.drape_electrodes_on_topography(mesh, active, topo_cell_cutoff="top", shift_horizontal=False)
    survey.set_geometric_factor()
    rho = dc.Simulation2DNodal(mesh, survey=survey, sigmaMap=maps.InjectActiveCells(mesh, active, 1e-8)).dpred(sigma)
    rho = rho * (1 + 0.03 * np.random.default_rng(11).standard_normal(len(rho)))
    out = D.run_job({"readings": rows.tolist(), "rho": rho.tolist(), "topo": topo.tolist(), "mesh": {"cell": 5.0, "depth": 150.0},
                     "uncertainty": {"percent": 3, "floor": 0.0}, "maxIter": 20}, lambda e: None)
    c = out["cells"]
    s, z, sup = (np.asarray(c[k]) for k in ("s", "z", "support"))
    shallow = (1000 - z) < 10
    res_side, con_side = shallow & (s > 100) & (s < 260), shallow & (s > 370) & (s < 530)
    g_res, g_con = np.mean(sup[res_side] < 0.02), np.mean(sup[con_side] < 0.02)
    print(f"support (0-10 m, cutoff 0.02): greyed {g_res:.0%} on the 1000 ohm.m side, {g_con:.0%} on the 30 ohm.m side; "
          f"median support {np.median(sup[res_side]):.3f} vs {np.median(sup[con_side]):.3f}")
    assert abs(g_con - g_res) <= 0.15, (g_res, g_con)


def test_ip_zero_reading_needs_a_floor():
    """TASKS.csv #564 — a 0 mV/V reading with a percent-only uncertainty would get std 0 (infinite weight):
    refused by the request validator and by run_job (before any inversion), accepted once a floor is given."""
    from fastapi import HTTPException
    from app.main import _validate_dcip2d
    x = np.arange(20) * 10.0
    rows = [[x[i], x[i] + 10, x[i] + 20 + n * 10, x[i] + 30 + n * 10] for i in range(20) for n in range(3) if x[i] + 30 + n * 10 <= x[-1]]
    base = {"readings": rows, "rho": [100.0] * len(rows), "chargeability": [0.0] + [5.0] * (len(rows) - 1),
            "mesh": {"cell": 5.0, "depth": 40.0}, "uncertainty": {"percent": 3}, "maxIter": 2}
    for iu, ok in (({"percent": 5}, False), ({}, False), ({"percent": 5, "floor": 0.5}, True)):
        req = dict(base, ipUncertainty=iu)
        try:
            _validate_dcip2d(req); valid = True
        except HTTPException as e:
            valid = False; print("  refused:", e.detail)
        assert valid == ok, iu
    try:
        D.run_job(dict(base, ipUncertainty={"percent": 5}), lambda e: None)
        raise AssertionError("run_job accepted a zero-std chargeability reading")
    except ValueError as e:
        print("  run_job:", e)


def test_flat_geometric_factor_on_a_ridge():
    """TASKS.csv #580 — uniform 100 ohm.m under a 60 m ridge (flanks to ~40 %), apparent resistivity written the way
    a receiver / contractor does: V over the geometric factor of the nominal FLAT spacings. Inverted with the
    draped factor this came back 76-127 ohm.m in the shallow supported cells (the factor difference fitted as
    structure); with the default flat factor it must stay within 85-115, and the run records the choice."""
    from discretize.utils import active_from_xyz
    from simpeg import maps
    from simpeg.electromagnetics.static import resistivity as dc
    from simpeg.electromagnetics.static.utils import static_utils
    x = np.arange(48) * 10.0
    rows = np.array([[x[i], x[i] + 20, x[i] + 20 + n * 20, x[i] + 40 + n * 20] for i in range(48) for n in range(1, 7) if x[i] + 40 + n * 20 <= x[-1]])
    tx_ = np.linspace(-500, 1000, 301)
    topo = np.c_[tx_, 1000 + 60 * np.exp(-((tx_ - 235) / 70.0) ** 2)]
    pos = np.unique(rows.ravel())
    idx = np.searchsorted(pos, rows)
    mesh, _ = D._mesh(pos, topo, 5.0, 120.0)
    tx = np.linspace(mesh.nodes_x[0], mesh.nodes_x[-1], 800)
    active = active_from_xyz(mesh, np.c_[tx, np.interp(tx, topo[:, 0], topo[:, 1])])
    survey = D._survey(idx, np.c_[pos, np.interp(pos, topo[:, 0], topo[:, 1])], "apparent_resistivity")
    survey.drape_electrodes_on_topography(mesh, active, topo_cell_cutoff="top", shift_horizontal=False)
    g_draped = survey.set_geometric_factor()
    volts = dc.Simulation2DNodal(mesh, survey=survey, sigmaMap=maps.InjectActiveCells(mesh, active, 1e-8)).dpred(np.full(int(active.sum()), 0.01)) * g_draped
    rho = volts / static_utils.geometric_factor(D._survey(idx, np.c_[pos, np.zeros_like(pos)], "apparent_resistivity"))
    out = D.run_job({"readings": rows.tolist(), "rho": rho.tolist(), "topo": topo.tolist(), "mesh": {"cell": 5.0, "depth": 120.0},
                     "uncertainty": {"percent": 3}, "maxIter": 12}, lambda e: None)
    c = out["cells"]
    s, z, res, sup = (np.asarray(c[k]) for k in ("s", "z", "resistivity", "support"))
    shallow = (sup > 0.05) & (np.interp(s, topo[:, 0], topo[:, 1]) - z < 25)
    p5, p95 = np.percentile(res[shallow], [5, 95])
    print(f"flat geometric factor on a ridge: shallow supported cells {p5:.1f}-{p95:.1f} ohm.m (true 100), recorded {out['geometricFactor']}")
    assert out["geometricFactor"] == "flat" and out["reachedTarget"] and 85 < p5 and p95 < 115


def test_n_block_file_order():
    """TASKS.csv #652 — contractor TDIP files list readings by n-block (every source's n = 1, then n = 2 ...), not
    source by source. SimPEG regroups them by source; before #652 the data were passed in file order and paired
    with the wrong electrodes (this block scored phi_d/N = 508). The same synthetic, listed by n-block, must fit and
    recover the block, and predicted[i] must belong to the file's reading i."""
    rows, rho, ch, topo = _synthetic()
    nlev = np.round((rows[:, 2] - rows[:, 1]) / 20.0).astype(int)
    perm = np.argsort(nlev, kind="stable")
    rows, rho, ch = rows[perm], rho[perm], ch[perm]
    req = {"readings": rows.tolist(), "rho": rho.tolist(), "chargeability": ch.tolist(), "topo": topo.tolist(),
           "mesh": {"cell": 5.0, "depth": 150.0}, "uncertainty": {"percent": 3, "floor": 0.0},
           "ipUncertainty": {"percent": 3, "floor": 0.5}, "maxIter": 20}
    out = D.run_job(req, lambda e: None)
    pred, std = np.asarray(out["predicted"]), np.asarray(out["standardDeviation"])
    chi_file = float(np.mean(((rho - pred) / std) ** 2))
    ip_pred, ip_std = np.asarray(out["ip"]["predicted"]), np.asarray(out["ip"]["standardDeviation"])
    chi_ip = float(np.mean(((ch - ip_pred) / ip_std) ** 2))
    c = out["cells"]
    s, z, res = (np.asarray(c[k]) for k in ("s", "z", "resistivity"))
    ground = np.interp(s, topo[:, 0], topo[:, 1])
    lo = int(np.argmin(res))
    print(f"n-block order: {len(rows)} readings, DC chi {out['phi_d'] / out['target']:.2f} (file-order recompute {chi_file:.2f}), "
          f"IP chi {chi_ip:.2f}, {out['iterations']} iterations, min resistivity {res[lo]:.1f} at s={s[lo]:.0f}")
    assert out["reachedTarget"] and chi_file <= 1.05 and chi_ip <= 1.5
    assert abs(chi_file - out["phi_d"] / out["target"]) < 1e-6
    assert 260 <= s[lo] <= 380 and 5 <= ground[lo] - z[lo] <= 80


def test_per_reading_floor_from_the_file():
    """TASKS.csv #683 — the file's own error column as a per-reading floor: given in FILE order (here n-block order,
    which SimPEG regroups), each reading's returned standard deviation must be percent * |d| + max(floor, its own)."""
    rows, rho, ch, topo = _synthetic()
    nlev = np.round((rows[:, 2] - rows[:, 1]) / 20.0).astype(int)
    perm = np.argsort(nlev, kind="stable")
    rows, rho, ch = rows[perm], rho[perm], ch[perm]
    n = len(rho)
    fl_pct = np.where(np.arange(n) % 3 == 0, 10.0, 0.5)          # every third reading noisy (10 %)
    fl_ip = np.where(np.arange(n) % 4 == 0, 2.0, 0.0)            # every fourth chargeability reading +-2 mV/V
    req = {"readings": rows.tolist(), "rho": rho.tolist(), "chargeability": ch.tolist(), "topo": topo.tolist(),
           "mesh": {"cell": 5.0, "depth": 150.0}, "uncertainty": {"percent": 3, "floor": 0.0, "floorPerReadingPercent": fl_pct.tolist()},
           "ipUncertainty": {"percent": 3, "floor": 0.5, "floorPerReadingMvV": fl_ip.tolist()}, "maxIter": 2}
    out = D.run_job(req, lambda e: None)
    std = np.asarray(out["standardDeviation"])
    assert np.allclose(std, 0.03 * rho + np.maximum(0.0, fl_pct / 100.0 * rho))
    ip_std = np.asarray(out["ip"]["standardDeviation"])  # mV/V
    assert np.allclose(ip_std, 0.03 * np.abs(ch) + np.maximum(0.5, fl_ip))


if __name__ == "__main__":
    test_ip_zero_reading_needs_a_floor()
    test_pole_dipole_homogeneous()
    test_dcip2d_recovers_block()
    test_n_block_file_order()
    test_support_not_biased_against_conductors()
    test_flat_geometric_factor_on_a_ridge()
    test_per_reading_floor_from_the_file()
    print("ALL PASSED")

