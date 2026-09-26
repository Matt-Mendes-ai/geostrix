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


if __name__ == "__main__":
    test_pole_dipole_homogeneous()
    test_dcip2d_recovers_block()
    print("ALL PASSED")
