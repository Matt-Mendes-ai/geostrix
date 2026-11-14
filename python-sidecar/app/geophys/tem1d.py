"""TASKS.csv #3440 (step 1 of 3) — 1D layered-earth TEM forward model: the decay dBz/dt a time-domain EM system measures over a stack of
flat layers, for an airborne system (SkyTEM-like: a transmitter loop at height h, the receiver at a horizontal offset) or a ground
central-loop system, through the transmitter's current waveform and averaged over each gate.

How.
1. Frequency domain. The secondary field Hz of a unit-moment source at the receiver, by the Hankel transform of the TE reflection
   coefficient (Ward & Hohmann 1988), with the kernel FDEM 1D already uses (em1d._numba_kernel: the admittance recursion for a batch
   of models, with its derivative with respect to every layer's log conductivity, for the inversion in step 2):
     'vmd'   a vertical magnetic dipole at height h, the receiver (z) at offset r at the same height:
             Hz = 1/(4 pi) Int r_TE e^(-2 l h) l^2 J0(l r) dl
     'loop'  a horizontal circular loop of radius a at height h, the receiver at its centre (a ground central-loop system: h ~ 0):
             Hz = 1/(2 pi a^2) Int r_TE e^(-2 l h) l J1(l a) dl   (per unit moment: current x pi a^2)
   Quasi-static (no displacement currents): the time transform samples frequencies up to ~1e8 Hz, where free-space permittivity
   would spoil the diffusive response (found while checking against empymod, which needs epermH = epermV = 0 for the same reason).
2. Time domain. The step-off dB/dt, by the Fourier sine transform of mu0 Im(Hz) with Key's 2012 201-point filter, through empymod's
   lagged convolution (one set of frequencies for every time: empymod.utils.check_time / empymod.model.tem).
3. The waveform. A piecewise-linear current I(t) (1 while on, 0 after the turn-off ends at t = 0): the response at t is
   -Int I'(tau) y_off(t - tau) dtau, by 4-point Gauss-Legendre on every segment where the current changes (the ramp-on too, so a short
   on-time is honoured). An ideal step-off when no waveform is given.
4. Gates. A gate with a width is the mean of the response over [t - w/2, t + w/2] (3-point Gauss-Legendre); without, its centre.
Output: -dBz/dt in V / (A m^4): per unit transmitter moment (A m^2) and per unit receiver area, positive for a normal decay
(SkyTEM / Aarhus Workbench report dB/dt in pV / (A m^4), the same quantity x 1e12).

Checked (tests/test_tem1d.py): the half-space closed forms of Ward & Hohmann (a VMD with an offset receiver, eq. 4.70; a central loop,
eq. 4.98) at a few centimetres' height; a layered model against empymod.bipole (msrc = 'loop', mrec = 'loop', the step-off, no
displacement currents, no direct field) at an airborne height and offset; the waveform convolution against a direct integration;
SimPEG's 1D TDEM simulation when it is installed.

Not modelled: the receiver's own low-pass filters and the system's front gate (SkyTEM's filters are system-specific; the panel will
ask for them in step 3), a non-coincident transmitter and receiver height, the loop's true shape (a dipole stands for an airborne
loop, as GA-AEM and Aarhus Workbench do for a small loop high above the ground).
"""
from __future__ import annotations

import math

import numpy as np

from .em1d import MU0, _filt, _numba_kernel



def _fourier(times):
    """the frequencies (Hz) and the empymod transform arguments for these times (s), for the step-off of a quantity whose
    frequency-domain response is given (signal = -1)"""
    import empymod

    t = np.asarray(times, float)
    time, freq, ft, ftarg = empymod.utils.check_time(t, -1, "dlf", {"dlf": "key_201_2012", "pts_per_dec": -1}, 0)
    return time, np.asarray(freq, float), ft, ftarg


def _geometry(system, freqs):
    """the filter abscissae (lam), weights (G, with the geometry's factor) and i omega mu0, one row per frequency, flattened"""
    base, w0, w1 = _filt()
    F, L = len(freqs), len(base)
    h = float(system.get("h", 0.0))
    g = system.get("geom", "vmd")
    if g == "vmd":
        r = float(system["r"])
        if not r > 0:
            raise ValueError("A vertical-dipole system needs a receiver offset r > 0 (use geom 'loop' for a central-loop system).")
        lam = base / r
        G = np.exp(-2.0 * lam * h) * lam ** 2 * w0 / (4.0 * math.pi * r)
    elif g == "loop":
        a = float(system["a"])
        if not a > 0:
            raise ValueError("A central-loop system needs the loop radius a > 0.")
        lam = base / a
        G = np.exp(-2.0 * lam * h) * lam * w1 / (2.0 * math.pi * a * a)
    else:
        raise ValueError(f"Unknown system geometry {g!r}: 'vmd' or 'loop'")
    lamF = np.ascontiguousarray(np.tile(lam, F))
    GF = np.ascontiguousarray(np.tile(G, F))
    iwmu = np.ascontiguousarray(np.repeat(1j * MU0 * 2.0 * math.pi * np.asarray(freqs, float), L))
    return lamF, GF, iwmu, F, L


def fd_hz(cond, thick, freqs, system, jac=False):
    """cond (S, N) S/m; thick (N - 1,) m; freqs (F,) Hz -> the secondary Hz per unit moment (S, F) complex [and d/d log10(cond) (S, F, N)].
    The kernel's sign: r_TE = (l - Y) / (l + Y), as in em1d."""
    sig = np.ascontiguousarray(np.atleast_2d(np.asarray(cond, float)))
    S, N = sig.shape
    lam, G, iwmu, F, L = _geometry(system, freqs)
    v = np.empty((S, F), np.complex128)
    J = np.empty((S, F, N), np.complex128)
    _numba_kernel()(sig, np.ascontiguousarray(np.asarray(thick, float)), lam, iwmu, G, F, L, bool(jac), v, J)
    return (v, J) if jac else v


def step_off(cond, thick, system, times, jac=False):
    """-dBz/dt after an ideal step turn-off (V / (A m^4)), at times (s): (S, T) [and its Jacobian (S, T, N) d / d log10(cond)]"""
    import empymod

    time, freq, ft, ftarg = _fourier(times)
    out = fd_hz(cond, thick, freq, system, jac=jac)
    v, J = out if jac else (out, None)
    S = v.shape[0]
    res = np.empty((S, len(time)))
    for s in range(S):
        # B = mu0 H; the step-off of B from the frequency-domain H, then d/dt by the iw factor (empymod: signal -1 of iw mu0 H)
        fEM = (2j * math.pi * freq * MU0 * v[s])[:, None]
        tEM, _ = empymod.model.tem(fEM, np.array([1.0]), freq, time, -1, ft, ftarg)
        res[s] = -np.real(np.squeeze(tEM))  # positive for a normal decay
    if not jac:
        return res
    N = J.shape[2]
    Jt = np.empty((S, len(time), N))
    for s in range(S):
        fEM = 2j * math.pi * freq[:, None] * MU0 * J[s]
        tEM, _ = empymod.model.tem(fEM, np.ones(N), freq, time, -1, ft, ftarg)
        Jt[s] = -np.real(np.asarray(tEM)).reshape(len(time), N)
    return res, Jt


_GL4 = np.polynomial.legendre.leggauss(4)
_GL3 = np.polynomial.legendre.leggauss(3)


def _sample_times(gates, widths):
    """the times at which a gate is read: its centre, or 3 Gauss-Legendre points over its width -> (times (G, k), weights (k,))"""
    g = np.asarray(gates, float)
    if widths is None:
        return g[:, None], np.array([1.0])
    w = np.asarray(widths, float)
    x, wt = _GL3
    return g[:, None] + 0.5 * w[:, None] * x[None, :], wt / 2.0


def forward(cond, thick, system, gates, widths=None, waveform=None, jac=False):
    """The decays a system reads: cond (S, N) S/m, thick (N - 1,) m, gates (G,) s after the end of the turn-off, widths (G,) s or None,
    waveform [[t, I], ...] (s, current 0..1, ending at t = 0 with I = 0) or None for an ideal step-off.
    -> -dBz/dt (S, G) in V / (A m^4) [and its Jacobian (S, G, N) d / d log10(cond)]"""
    tg, wg = _sample_times(gates, widths)  # (G, k)
    if waveform is None:
        need = tg.ravel()
        y = step_off(cond, thick, system, need, jac=jac)
        Y, JY = y if jac else (y, None)
        S = Y.shape[0]
        out = (Y.reshape(S, *tg.shape) * wg).sum(axis=2)
        if not jac:
            return out
        return out, (JY.reshape(S, *tg.shape, -1) * wg[None, None, :, None]).sum(axis=2)
    wf = np.asarray(waveform, float)
    tw, I = wf[:, 0], wf[:, 1]
    if not (abs(I[-1]) < 1e-12 and abs(tw[-1]) < 1e-15):
        raise ValueError("The waveform must end at t = 0 with the current off.")
    xq, wq = _GL4
    segs = []  # (a, b, slope) for every segment where the current changes
    for k in range(len(tw) - 1):
        dt = tw[k + 1] - tw[k]
        if dt <= 0:
            raise ValueError("The waveform's times must increase.")
        s = (I[k + 1] - I[k]) / dt
        if s != 0.0:
            segs.append((tw[k], tw[k + 1], s))
    # every time the convolution needs: for each gate sample t and each segment, t - tau at the quadrature points
    pts = []
    for a, b, s in segs:
        tau = 0.5 * (b - a) * xq + 0.5 * (a + b)
        pts.append(tg[:, :, None] - tau[None, None, :])  # (G, k, 4), all > 0 since tau <= 0 < t
    allt = np.concatenate([p.ravel() for p in pts])
    y = step_off(cond, thick, system, allt, jac=jac)
    Y, JY = y if jac else (y, None)
    S = Y.shape[0]
    resp = np.zeros((S,) + tg.shape)
    Jresp = np.zeros((S,) + tg.shape + (JY.shape[2],)) if jac else None
    off = 0
    for (a, b, s), p in zip(segs, pts):
        n = p.size
        ys = Y[:, off:off + n].reshape((S,) + p.shape)
        # response = - Int I'(tau) y_off(t - tau) dtau over the segment
        resp += -s * 0.5 * (b - a) * (ys * wq).sum(axis=3)
        if jac:
            js = JY[:, off:off + n, :].reshape((S,) + p.shape + (JY.shape[2],))
            Jresp += -s * 0.5 * (b - a) * (js * wq[None, None, None, :, None]).sum(axis=3)
        off += n
    out = (resp * wg).sum(axis=2)
    if not jac:
        return out
    return out, (Jresp * wg[None, None, :, None]).sum(axis=2)
