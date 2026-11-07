"""TASKS.csv #1986 — the 1D loop-loop FDEM kernel and inversion (app/geophys/em1d.py).

Plain script (no pytest in the venv): python tests/test_em1d.py
  - the kernel against empymod.dipole (the reference library) on random layered models, every coil geometry
  - against SimPEG's 1D layered FDEM simulation on one model
  - the low-induction limit: HCP apparent conductivity on the ground equals a half-space's conductivity
  - the analytic Jacobian against finite differences
  - the inversion recovers a known two-layer earth from its own noise-free data, and run_job's output
"""
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.geophys import em1d  # noqa: E402

COILS = [{"geom": g, "sep": s, "freq": f} for g, s, f in [
    ("HCP", 1.0, 9000.0), ("PRP", 1.1, 9000.0), ("HCP", 2.0, 9000.0), ("PRP", 2.1, 9000.0), ("HCP", 4.0, 9000.0), ("PRP", 4.1, 9000.0),  # DUALEM-421
    ("HCP", 1.66, 1530.0), ("HCP", 1.66, 47970.0),  # GEM-2
    ("VCP", 3.66, 9800.0), ("VCP", 10.0, 6400.0)]]  # EM31, EM34


def check_against_empymod():
    rng = np.random.default_rng(1986)
    worst = 0.0
    for _ in range(8):
        n = int(rng.integers(1, 8))
        cond = 10 ** rng.uniform(-3.5, -0.5, n)
        thick = rng.uniform(0.3, 4.0, n - 1)
        h = float(rng.uniform(0.0, 1.2))
        a = em1d.hs_hp_batch(cond[None], thick, COILS, h)[0]
        b = em1d.hs_hp_empymod(cond, thick, COILS, h)
        worst = max(worst, float((np.abs(a - b) / np.abs(b)).max()))
    print(f"kernel vs empymod (8 random models x {len(COILS)} coils): worst relative difference {worst:.2e}")
    assert worst < 1e-4


def check_against_simpeg():
    from simpeg.electromagnetics import frequency_domain as fdem
    from simpeg import maps
    sig = np.array([0.02, 0.005, 0.05, 0.01])
    thick = np.array([1.0, 2.5, 4.0])
    h = 0.9
    for geom, sep, f in [("HCP", 1.66, 1530.0), ("HCP", 1.66, 47970.0), ("HCP", 4.0, 9000.0), ("VCP", 3.66, 9800.0)]:
        o = "z" if geom == "HCP" else "y"
        rx = fdem.receivers.PointMagneticFieldSecondary(locations=np.array([[sep, 0.0, h]]), orientation=o, data_type="ppm", component="both")
        src = fdem.sources.MagDipole(receiver_list=[rx], frequency=f, location=np.array([0.0, 0.0, h]), orientation=o, moment=1.0)
        sim = fdem.Simulation1DLayered(survey=fdem.Survey([src]), thicknesses=thick, sigmaMap=maps.IdentityMap(nP=len(sig)))
        sp = sim.dpred(sig)
        ours = em1d.hs_hp_batch(sig[None], thick, [{"geom": geom, "sep": sep, "freq": f}], h)[0, 0] * 1e6
        d = max(abs(ours.real - sp[0]) / abs(sp[0]), abs(ours.imag - sp[1]) / abs(sp[1]))
        print(f"vs SimPEG {geom} {sep} m {f:.0f} Hz: in-phase {ours.real:.3f} / {sp[0]:.3f} ppm, quadrature {ours.imag:.3f} / {sp[1]:.3f} ppm")
        assert d < 1e-3


def check_low_induction():
    sv = em1d.Survey([c for c in COILS if c["geom"] == "HCP" and c["freq"] == 9000.0], 0.0, "eca")
    # the low-induction relation holds to a few % at small induction numbers and drifts low as they grow (the 4 m coil over
    # 5 mS/m: -5.7 %), which is the relation's own error, not the kernel's
    for s, tol in ((1.0, 0.03), (5.0, 0.07)):
        eca = em1d.forward(sv, np.full((1, 1), np.log10(s / 1000.0)), np.array([]))[0]
        print(f"half-space {s} mS/m, HCP 1 / 2 / 4 m on the ground: apparent conductivity {np.round(eca, 3)} mS/m")
        assert np.all(np.abs(eca / s - 1) < tol) and eca[0] > eca[1] > eca[2]
    sv = em1d.Survey(COILS[:6], 0.0, "eca")
    eca = em1d.forward(sv, np.full((1, 1), np.log10(0.001)), np.array([]))[0]
    assert np.all(eca > 0.95), "PRP reads positive over a conductor, as the instrument"


def check_jacobian():
    rng = np.random.default_rng(3)
    thick = em1d.layer_thicknesses(12, 0.3, 10.0)
    for kind in ("eca", "ppm"):
        sv = em1d.Survey(COILS, 0.7, kind)
        m = rng.uniform(-3, -1, (3, 12))
        d0, J = em1d.forward(sv, m, thick, jac=True)
        Jf = np.empty_like(J)
        for j in range(12):
            mp = m.copy()
            mp[:, j] += 1e-6
            Jf[:, :, j] = (em1d.forward(sv, mp, thick) - d0) / 1e-6
        e = float(np.abs(J - Jf).max() / np.abs(Jf).max())
        print(f"Jacobian ({kind}) vs finite differences: {e:.1e}")
        assert e < 1e-4


def check_inversion():
    thick = em1d.layer_thicknesses(20, 0.2, 15.0)
    tops = np.concatenate([[0.0], np.cumsum(thick)])
    true = np.where(tops < 1.5, np.log10(0.02), np.log10(0.004))  # 20 mS/m over 4 mS/m at 1.5 m
    for name, coils, h, kind, ab in [("DUALEM-421", COILS[:6], 0.75, "eca", 0.1),
                                     ("GEM-2", [{"geom": "HCP", "sep": 1.66, "freq": f} for f in (1530, 3930, 8250, 13590, 20370, 33030, 47970)], 1.0, "ppm", 20.0)]:
        sv = em1d.Survey(coils, h, kind)
        d = em1d.forward(sv, true[None], thick)[0]
        req = {"coils": coils, "height": h, "kind": kind, "data": [list(d)] * 3, "errRel": 0.05, "errAbs": ab,
               "layers": {"n": 20, "first": 0.2, "bottom": 15.0}, "lateral": 1.0, "line": [0, 0, 0], "x": [0, 1, 2], "y": [0, 0, 0]}
        t = time.perf_counter()
        out = em1d.run_job(req, lambda ev: None)
        ms = (time.perf_counter() - t) * 1000
        c = np.array(out["condMs"][1])
        shallow, deep = np.median(c[tops < 1.0]), np.median(c[(tops > 2.5) & (tops < 4.0)])
        print(f"{name}: true 20 over 4 mS/m at 1.5 m -> {shallow:.1f} mS/m above 1 m, {deep:.1f} mS/m at 2.5-4 m; "
              f"chi {out['chi'][1]}, DOI {out['doi'][1]} m, {ms:.0f} ms for 3 soundings (2 passes)")
        # the shallow layer to 25 %; below, a smooth model fitting the data to their errors only has to show the drop (the
        # 2.5-4 m layer is at or past the depth of investigation: 7-8 mS/m against the true 4)
        assert 15 < shallow < 25 and deep < 0.5 * shallow and deep < 9
        assert out["chi"][1] <= 1.2
        assert len(out["condMs"]) == 3 and len(out["thick"]) == 19 and len(out["pred"][0]) == len(d)
    # missing readings and a reading <= 0 (log space for eca): left out, not an error
    sv = em1d.Survey(COILS[:6], 0.75, "eca")
    d = list(em1d.forward(sv, np.full((1, 20), np.log10(0.01)), thick)[0])
    d[0], d[1] = None, -0.4
    out = em1d.run_job({"coils": COILS[:6], "height": 0.75, "kind": "eca", "data": [d, [None] * 6], "errRel": 0.1, "errAbs": 0.1}, lambda ev: None)
    assert out["condMs"][1][0] is None and out["chi"][1] is None and out["condMs"][0][0] is not None


if __name__ == "__main__":
    check_against_empymod()
    check_against_simpeg()
    check_low_induction()
    check_jacobian()
    check_inversion()
    print("ok")
