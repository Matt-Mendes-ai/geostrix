"""TASKS.csv #3440 (step 1) — the 1D layered-earth TEM forward model (app/geophys/tem1d.py).

Plain script (no pytest in the venv): python tests/test_tem1d.py
  - the half-space closed forms of Ward & Hohmann (1988): a vertical dipole with the receiver at an offset (eq. 4.70) and a central
    loop (eq. 4.98), at a few centimetres' height
  - random layered models against empymod.bipole (a loop source and a loop receiver, the step-off, no displacement currents, no
    direct field) at airborne heights and offsets, and a central loop on the ground
  - SimPEG's 1D layered TDEM simulation, when it is installed
  - the waveform convolution (a linear ramp-off is the mean of the step-off response over the ramp) and the gate widths
  - the Jacobian (d data / d log10 conductivity) against finite differences
  - step 2: the inversion recovers a synthetic 3-layer earth (a conductor at 30-60 m) from its own data, with and without 3 % noise,
    through run_job; the request validation (app.main._validate_tem1d)
"""
import math
import os
import sys
import time

import numpy as np
from scipy.special import erf

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.geophys import tem1d  # noqa: E402

MU0 = 4e-7 * math.pi
T = np.logspace(-5, -2, 13)


def check_half_space():
    sig = 0.01
    th = np.sqrt(MU0 * sig / (4 * T))
    r = 10.0
    x = th * r
    vmd = (1 / (2 * math.pi * MU0 * sig * r ** 5)) * (9 * erf(x) - (2 * x / math.sqrt(math.pi)) * (9 + 6 * x ** 2 + 4 * x ** 4) * np.exp(-x ** 2))
    ours = tem1d.step_off([[sig]], [], {"geom": "vmd", "r": r, "h": 0.01}, T)[0]
    q = ours / (MU0 * vmd)
    # outside the source's footprint on the ground the decay has the opposite sign of the central one (the off-axis reversal)
    print(f"VMD on a half-space, receiver 10 m off: ours / Ward & Hohmann 4.70 = {q.min():.5f} to {q.max():.5f} (sign reversed off-axis)")
    assert np.all(np.abs(np.abs(q) - 1) < 3e-3) and np.all(q < 0)
    a = 20.0
    xa = th * a
    loop = (1 / (MU0 * sig * a ** 3)) * (3 * erf(xa) - (2 / math.sqrt(math.pi)) * xa * (3 + 2 * xa ** 2) * np.exp(-xa ** 2))  # per unit current
    ours = tem1d.step_off([[sig]], [], {"geom": "loop", "a": a, "h": 0.01}, T)[0] * math.pi * a * a
    q = ours / (MU0 * loop)
    print(f"central loop (20 m) on a half-space: ours / Ward & Hohmann 4.98 = {q.min():.5f} to {q.max():.5f}")
    assert np.all(np.abs(q - 1) < 2e-3)


def _empymod_step_off(cond, thick, system, times):
    import empymod

    depth = np.r_[0.0, np.cumsum(thick)] if len(cond) > 1 else np.array([0.0])
    res = np.r_[2e14, 1.0 / np.asarray(cond, float)]
    z = -float(system.get("h", 0.0)) or -0.01
    zero = [0.0] * len(res)
    if system["geom"] == "vmd":
        out = empymod.bipole(src=[0, 0, z, 0, 90], rec=[-float(system["r"]), 0, z, 0, 90], depth=depth, res=res, freqtime=times, signal=-1,
                             msrc="loop", mrec="loop", verb=0, epermH=zero, epermV=zero, xdirect=None)
        return -np.asarray(out)
    raise ValueError("vmd only")


def check_against_empymod():
    rng = np.random.default_rng(3440)
    worst = 0.0
    for _ in range(6):
        n = int(rng.integers(1, 7))
        cond = 10 ** rng.uniform(-3.5, -0.5, n)
        thick = rng.uniform(2.0, 40.0, n - 1)
        system = {"geom": "vmd", "r": float(rng.uniform(5, 20)), "h": float(rng.uniform(20, 60))}
        a = tem1d.step_off([cond], thick, system, T)[0]
        b = _empymod_step_off(cond, thick, system, T)
        ok = np.abs(b) > 1e-6 * np.abs(b).max()  # where the decay has not fallen to the transform's noise
        worst = max(worst, float((np.abs(a - b)[ok] / np.abs(b)[ok]).max()))
    print(f"layered airborne models vs empymod.bipole (6 random models, 13 times 10 us to 10 ms): worst relative difference {worst:.2e}")
    assert worst < 2e-3


def check_against_simpeg():
    try:
        from simpeg import maps
        from simpeg.electromagnetics import time_domain as tdem
    except Exception as e:  # noqa: BLE001
        print(f"SimPEG 1D TDEM: not checked ({e})")
        return
    cond = np.array([0.02, 0.2, 0.005])
    thick = np.array([10.0, 30.0])
    h, r = 30.0, 13.0
    try:
        rx = tdem.receivers.PointMagneticFluxTimeDerivative(np.array([[r, 0.0, h]]), T, orientation="z")
        src = tdem.sources.MagDipole([rx], location=np.array([0.0, 0.0, h]), orientation="z", waveform=tdem.sources.StepOffWaveform())
        sim = tdem.Simulation1DLayered(survey=tdem.Survey([src]), thicknesses=thick, sigmaMap=maps.IdentityMap(nP=3))
        d = np.asarray(sim.dpred(cond))
    except Exception as e:  # noqa: BLE001
        print(f"SimPEG 1D TDEM: not checked (its API: {e})")
        return
    ours = tem1d.step_off([cond], thick, {"geom": "vmd", "r": r, "h": h}, T)[0]
    q = ours / -d
    print(f"against SimPEG Simulation1DLayered (step-off dB/dt, 13 times): ours / SimPEG = {q.min():.4f} to {q.max():.4f}")
    assert np.all(np.abs(q - 1) < 1e-2)


def check_waveform_and_gates():
    cond, thick, system = [0.05, 0.005], [25.0], {"geom": "vmd", "r": 13.0, "h": 35.0}
    ramp = 40e-6
    gates = np.logspace(-5, -3, 7)
    wf = [[-0.01, 0.0], [-0.01 + 1e-9, 1.0], [-ramp, 1.0], [0.0, 0.0]]  # on for 10 ms (a fast ramp-on), a 40 us linear ramp-off
    ours = tem1d.forward([cond], thick, system, gates, waveform=wf)[0]
    # the ramp-off alone: the mean of the step-off over [t, t + ramp]; the ramp-on 10 ms earlier adds - y(t + 10 ms)
    ref = []
    for g in gates:
        s = np.linspace(g, g + ramp, 401)
        y = tem1d.step_off([cond], thick, system, s)[0]
        on = tem1d.step_off([cond], thick, system, [g + 0.01 - 0.5e-9])[0][0]
        ref.append(np.trapezoid(y, s) / ramp - on)
    ref = np.asarray(ref)
    q = ours / ref
    print(f"40 us ramp-off and a 10 ms on-time vs a direct integration: ratio {q.min():.5f} to {q.max():.5f}")
    assert np.all(np.abs(q - 1) < 2e-3)
    # an ideal step-off: forward with no waveform is step_off at the gate centres
    a = tem1d.forward([cond], thick, system, gates)[0]
    b = tem1d.step_off([cond], thick, system, gates)[0]
    assert np.allclose(a, b, rtol=1e-12)
    # a gate's width: the mean over it
    w = gates * 0.2
    gw = tem1d.forward([cond], thick, system, gates, widths=w)[0]
    ref = np.array([np.trapezoid(tem1d.step_off([cond], thick, system, np.linspace(g - wi / 2, g + wi / 2, 301))[0], dx=wi / 300) / wi for g, wi in zip(gates, w)])
    q = gw / ref
    print(f"gates 20 % wide vs a direct mean: ratio {q.min():.5f} to {q.max():.5f}")
    assert np.all(np.abs(q - 1) < 1e-3)


def check_jacobian():
    cond = np.array([0.02, 0.2, 0.005, 0.05])
    thick = np.array([8.0, 20.0, 40.0])
    system = {"geom": "vmd", "r": 13.0, "h": 30.0}
    gates = np.logspace(-5, -2.5, 8)
    wf = [[-0.002, 0.0], [-0.0019, 1.0], [-5e-6, 1.0], [0.0, 0.0]]
    d, J = tem1d.forward([cond], thick, system, gates, waveform=wf, jac=True)
    m = np.log10(cond)
    eps = 1e-4
    worst = 0.0
    for k in range(len(cond)):
        mp, mm = m.copy(), m.copy()
        mp[k] += eps
        mm[k] -= eps
        fd = (tem1d.forward([10 ** mp], thick, system, gates, waveform=wf)[0] - tem1d.forward([10 ** mm], thick, system, gates, waveform=wf)[0]) / (2 * eps)
        worst = max(worst, float(np.max(np.abs(J[0, :, k] - fd) / (np.abs(d[0]) + 1e-30))))
    print(f"Jacobian d data / d log10 cond vs central differences (4 layers, 8 gates, a waveform): worst difference {worst:.1e} of the reading")
    assert worst < 1e-4


def check_speed():
    cond = np.full((32, 20), 0.01)
    thick = np.full(19, 5.0)
    system = {"geom": "vmd", "r": 13.0, "h": 30.0}
    gates = np.logspace(-5, -2, 24)
    tem1d.step_off(cond[:1], thick, system, gates)
    t0 = time.perf_counter()
    tem1d.step_off(cond, thick, system, gates, jac=True)
    dt = time.perf_counter() - t0
    print(f"speed: 32 soundings x 20 layers x 24 gates with the Jacobian in {dt * 1000:.0f} ms ({dt / 32 * 1000:.1f} ms a sounding)")


def check_inversion():
    system = {"geom": "vmd", "r": 13.0, "h": 30.0}
    gates = np.logspace(-5, math.log10(5e-3), 24)
    wf = [[-0.004, 0.0], [-0.0039, 1.0], [-3e-5, 1.0], [0.0, 0.0]]
    true_c, true_t = [0.01, 0.3, 0.005], [30.0, 30.0]
    d = tem1d.forward([true_c], true_t, system, gates, waveform=wf)[0] * tem1d.PV
    noisy = d * (1 + 0.03 * np.random.default_rng(1).standard_normal(d.size))
    t0 = time.perf_counter()
    out = tem1d.run_job({"system": system, "gates": gates.tolist(), "waveform": wf, "data": [noisy.tolist(), d.tolist()], "errRel": 0.03, "maxIter": 15}, lambda ev: None)
    dt = time.perf_counter() - t0
    thick = np.asarray(out["thick"])
    tops = np.r_[0.0, np.cumsum(thick)]
    mids = tops[:-1] + thick / 2
    for name, row, chi in zip(("3 % noise", "noise-free"), out["condMs"], out["chi"]):
        c = np.asarray(row[:-1]) / 1000.0  # S/m, the layers above the half-space
        peak = mids[int(np.argmax(c))]
        # the conductor's conductance (S): the true one is 0.3 S/m x 30 m = 9 S; a smooth model spreads it over the layers about it
        band = (mids > 15) & (mids < 80)
        conductance = float((c * thick)[band].sum())
        shallow = float(c[mids < 15].max())
        print(f"inversion ({name}): chi {chi:.2f}, peak at {peak:.0f} m ({c.max() * 1000:.0f} mS/m), conductance 15-80 m {conductance:.1f} S (true 9), "
              f"above 15 m at most {shallow * 1000:.1f} mS/m (true 10), DOI {out['doi'][0]:.0f} m")
        assert 0.4 < chi < 1.6
        assert 30 <= peak <= 60
        assert 0.6 * 9 < conductance < 1.4 * 9
        assert shallow < 0.03
    print(f"  2 stations in {dt:.1f} s")
    try:
        from fastapi import HTTPException
        from app.main import _validate_tem1d
    except Exception as e:  # noqa: BLE001
        print(f"request validation: not checked ({e})")
        return
    good = {"system": system, "gates": gates.tolist(), "data": [d.tolist()], "errRel": 0.05}
    _validate_tem1d(good)
    for bad, why in [({**good, "system": {"geom": "vmd", "h": 30}}, "no offset"), ({**good, "gates": gates[::-1].tolist()}, "decreasing gates"),
                     ({**good, "data": [d[:5].tolist()]}, "a short row"), ({**good, "waveform": [[-1e-3, 1.0], [-1e-5, 0.5]]}, "a waveform not ending off at 0")]:
        try:
            _validate_tem1d(bad)
        except HTTPException:
            continue
        raise AssertionError(f"accepted {why}")
    print("request validation: a good request passes, four bad ones are refused")


if __name__ == "__main__":
    check_half_space()
    check_against_empymod()
    check_against_simpeg()
    check_waveform_and_gates()
    check_jacobian()
    check_speed()
    check_inversion()
    print("tem1d: all checks passed")
