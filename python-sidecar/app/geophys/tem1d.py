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

TASKS.csv #3485 — the system as a survey report gives it: 'cloop', a loop of the frame's area with the receiver at an offset (exact for
a circle; SkyTEM's octagon as the circle of its area), the receiver rz above the transmitter, the receiver's first-order low-pass filters
(applied to Hz in the frequency domain), a measured waveform table with gates inside the turn-off (the earth's instantaneous image-field
response counted when there is no filter), and a bipolar waveform's earlier half-periods (base_freq). The gate averaging, the waveform's
convolution, the half-periods and the time transform are folded once a moment into a (gates x frequencies) map (_operator), so an
inversion's every step is a small product (2.6x faster than a transform a step).
Checked against Aarhus Workbench (TASKS.csv #3488): our forward of the USGS's own models of its 2016 Yellowstone SkyTEM 312 survey, with the
contractor report's waveform tables, filters, frame and receiver position, against Workbench's forward of the same models in the release:
the high moment within 1.4 % at every gate; the low moment within 2.2 % from 35 us (its first gates, at the turn-off's end, 8-20 %).

Not modelled: the front gate's own transient (gates before it are left out), the frame's tilt, the X component, the octagon's shape
beyond its area.
"""
from __future__ import annotations

import math

import numpy as np

from .em1d import MU0, _filt, _numba_kernel



# TASKS.csv #3440 step 3 — airborne (the system 10 m or more above the ground), Key's 81-point 2009 sine filter: half the frequencies of the
# 201-point one (122 against 259 for 10 us to 13 ms) for 6e-4 of the reading (measured against the 201-point result on a 4-layer airborne
# model). On the ground it missed the half-space closed form by 1 %: the 201-point filter there. The kernel's work is frequencies x stations x layers.
def _filter_for(system):
    return "key_81_2009" if float(np.min(system.get("h", 0.0))) >= 10.0 else "key_201_2012"


def _fourier(times, filt="key_201_2012"):
    """the frequencies (Hz) and the empymod transform arguments for these times (s), for the step-off of a quantity whose
    frequency-domain response is given (signal = -1)"""
    import empymod

    t = np.asarray(times, float)
    time, freq, ft, ftarg = empymod.utils.check_time(t, -1, "dlf", {"dlf": filt, "pts_per_dec": -1}, 0)
    return time, np.asarray(freq, float), ft, ftarg


def _geometry(system, freqs):
    """the filter abscissae (lam), weights (G, with the geometry's factor) and i omega mu0, one row per frequency, flattened.
    G is (1, F L), or (S, F L) when system h is an array of S heights (TASKS.csv #3440 step 3: a station's own height, so a batch of
    stations at different heights is one kernel call)"""
    base, w0, w1 = _filt()
    F, L = len(freqs), len(base)
    h = np.atleast_1d(np.asarray(system.get("h", 0.0), float))[:, None]
    # TASKS.csv #3485 — the receiver rz metres above the transmitter (SkyTEM's Z coil: 2 m above the frame; a file's RX_ALTITUDE less
    # TX_ALTITUDE): the reflected path runs from the source down and up to the receiver, e^(-l (h_s + h_r))
    rz = np.atleast_1d(np.asarray(system.get("rz", 0.0), float))[:, None]
    hh = 2.0 * h + rz
    if np.any(hh <= 0):
        raise ValueError("The receiver must be above the ground.")
    g = system.get("geom", "vmd")
    if g == "vmd":
        r = float(system["r"])
        if not r > 0:
            raise ValueError("A vertical-dipole system needs a receiver offset r > 0 (use geom 'loop' for a central-loop system).")
        lam = base / r
        G = np.exp(-lam * hh) * lam ** 2 * w0 / (4.0 * math.pi * r)
    elif g == "cloop":
        # TASKS.csv #3485 — a circular loop of radius a (a frame's area as a circle: SkyTEM's 337 m2 octagon) with the receiver at offset r
        # from its centre: Hz = 1 / (2 pi a) Int r_TE e^(-l (h_s + h_r)) l J1(l a) J0(l r) dl per unit moment (the dipole as a -> 0), on the
        # J0 filter at r; e^(-2 l h) keeps the integrand smooth where J1(l a) would oscillate, so the filter holds (checked against the
        # loop's area integrated as dipoles in tests/test_tem1d.py)
        from scipy.special import j1

        a, r = float(system["a"]), float(system["r"])
        if not (a > 0 and r > 0):
            raise ValueError("A loop with an offset receiver needs the loop radius a > 0 and the offset r > 0.")
        lam = base / r
        G = np.exp(-lam * hh) * lam * j1(lam * a) * w0 / (2.0 * math.pi * a * r)
    elif g == "loop":
        a = float(system["a"])
        if not a > 0:
            raise ValueError("A central-loop system needs the loop radius a > 0.")
        lam = base / a
        G = np.exp(-lam * hh) * lam * w1 / (2.0 * math.pi * a * a)
    else:
        raise ValueError(f"Unknown system geometry {g!r}: 'vmd', 'cloop' or 'loop'")
    lamF = np.ascontiguousarray(np.tile(lam, F))
    GF = np.ascontiguousarray(np.tile(G, (1, F)))
    iwmu = np.ascontiguousarray(np.repeat(1j * MU0 * 2.0 * math.pi * np.asarray(freqs, float), L))
    return lamF, GF, iwmu, F, L


def fd_hz(cond, thick, freqs, system, jac=False):
    """cond (S, N) S/m; thick (N - 1,) m; freqs (F,) Hz -> the secondary Hz per unit moment (S, F) complex [and d/d log10(cond) (S, F, N)].
    The kernel's sign: r_TE = (l - Y) / (l + Y), as in em1d."""
    sig = np.ascontiguousarray(np.atleast_2d(np.asarray(cond, float)))
    S, N = sig.shape
    lam, G, iwmu, F, L = _geometry(system, freqs)
    if G.shape[0] not in (1, S):
        raise ValueError(f"{G.shape[0]} heights for {S} models")
    v = np.empty((S, F), np.complex128)
    J = np.empty((S, F, N), np.complex128)
    _numba_kernel()(sig, np.ascontiguousarray(np.asarray(thick, float)), lam, iwmu, G, F, L, bool(jac), v, J)
    return (v, J) if jac else v


def step_off(cond, thick, system, times, jac=False):
    """-dBz/dt after an ideal step turn-off (V / (A m^4)), at times (s): (S, T) [and its Jacobian (S, T, N) d / d log10(cond)]"""
    import empymod

    time, freq, ft, ftarg = _fourier(times, _filter_for(system))
    out = fd_hz(cond, thick, freq, system, jac=jac)
    v, J = out if jac else (out, None)
    S, T = v.shape[0], len(time)
    iwmu = 2j * math.pi * freq * MU0
    # B = mu0 H; the step-off of B from the frequency-domain H, then d/dt by the iw factor (empymod: signal -1 of iw mu0 H). Every station in
    # one transform (step 3: one call, the stations as its columns, instead of one call a station)
    fEM = iwmu[:, None] * v.T  # (F, S)
    tEM, _ = empymod.model.tem(fEM, np.ones(S), freq, time, -1, ft, ftarg)
    res = -np.real(np.asarray(tEM)).reshape(T, S).T  # positive for a normal decay
    if not jac:
        return res
    N = J.shape[2]
    fJ = iwmu[:, None] * J.transpose(1, 0, 2).reshape(len(freq), S * N)  # (F, S * N)
    tJ, _ = empymod.model.tem(fJ, np.ones(S * N), freq, time, -1, ft, ftarg)
    Jt = -np.real(np.asarray(tJ)).reshape(T, S, N).transpose(1, 0, 2)
    return res, Jt


_GL4 = np.polynomial.legendre.leggauss(4)
_GL3 = np.polynomial.legendre.leggauss(3)

# TASKS.csv #3485 — a bipolar transmitter (SkyTEM: each half-period's pulse the opposite sign of the last) is read in its steady state:
# the earlier pulses' decays, alternating in sign, are summed. Ten half-periods: the next term is under ~1e-3 of a late gate.
N_HALF_PERIODS = 10


def _sample_times(gates, widths):
    """the times at which a gate is read: its centre, or 3 Gauss-Legendre points over its width -> (times (G, k), weights (k,))"""
    g = np.asarray(gates, float)
    if widths is None:
        return g[:, None], np.array([1.0])
    w = np.asarray(widths, float)
    x, wt = _GL3
    return g[:, None] + 0.5 * w[:, None] * x[None, :], wt / 2.0


def _segments(waveform):
    """[[t, I], ...] ending at t = 0 with I = 0 -> [(a, b, dI/dt)] where the current changes, and the waveform's start"""
    wf = np.asarray(waveform, float)
    tw, I = wf[:, 0], wf[:, 1]
    if not (abs(I[-1]) < 1e-12 and abs(tw[-1]) < 1e-15):
        raise ValueError("The waveform must end at t = 0 with the current off.")
    segs = []
    for k in range(len(tw) - 1):
        dt = tw[k + 1] - tw[k]
        if dt <= 0:
            raise ValueError("The waveform's times must increase.")
        s = (I[k + 1] - I[k]) / dt
        if s != 0.0:
            segs.append((float(tw[k]), float(tw[k + 1]), float(s)))
    return segs, float(tw[0])


def _pieces(s_lo, s_hi):
    """Gauss-Legendre points and weights over s in [s_lo, s_hi], graded toward s_lo when it is near 0 (the response's sharp start)"""
    xq, wq = _GL4
    L = s_hi - s_lo
    if s_lo >= 0.25 * L:
        edges = np.array([s_lo, s_hi])
    else:
        # halving toward s_lo down to 5 ns (well inside a receiver filter's ~0.5 us rise)
        m = int(max(0, math.ceil(math.log2(max(L, 1e-12) / max(s_lo, 5e-9)))))
        edges = np.concatenate([[s_lo], s_lo + L * 2.0 ** -np.arange(min(m, 30), -1, -1)])
    d = np.diff(edges)
    mid = 0.5 * (edges[1:] + edges[:-1])
    return (mid[:, None] + 0.5 * d[:, None] * xq[None, :]).ravel(), (0.5 * d[:, None] * wq[None, :]).ravel()


def _time_weights(gates, widths, waveform, base_freq):
    """How a gate is read from the step-off response y_off(s) (s > 0): gate g = sum_j w_j y_off(s_j) over its own j, plus
    delta_g * (-mu0 Hs_inf) — the instantaneous part (the earth's image field following the current), which only a gate inside the
    turn-off sees, and only without receiver filters (a filter turns it into part of y_off).
    The waveform's response at t: -Int I'(tau) y_off(t - tau) dtau over the times before t, so a gate may sit inside the ramp (TASKS.csv
    #3485: SkyTEM's low-moment gates from 6 us, its ramp 18 us long). With a base frequency, the earlier half-periods' pulses, alternating
    in sign. -> times (T,), gate index (T,), weights (T,), delta (G,)"""
    tg, wg = _sample_times(gates, widths)
    G, k = tg.shape
    ts, gi, ww = [], [], []
    delta = np.zeros(G)
    if waveform is None:
        if np.any(tg <= 0):
            raise ValueError("Without a waveform every gate must be after the turn-off (t > 0).")
        for q in range(k):
            ts.append(tg[:, q]); gi.append(np.arange(G)); ww.append(np.full(G, wg[q]))
        return np.concatenate(ts), np.concatenate(gi), np.concatenate(ww), delta
    segs, t0 = _segments(waveform)
    if np.any(tg <= t0):
        raise ValueError("A gate starts before the waveform.")
    half = 0.5 / float(base_freq) if base_freq else None
    if half is not None and half <= -t0:
        raise ValueError("The base frequency's half-period must be longer than the waveform.")
    for rep in range(N_HALF_PERIODS if half else 1):
        sign = -1.0 if rep % 2 else 1.0
        for g in range(G):
            for q in range(k):
                t = tg[g, q] + (rep * half if half else 0.0)
                for a, b, s in segs:
                    hi = min(b, t)
                    if hi <= a:
                        continue
                    sp, wp = _pieces(t - hi, t - a)  # s = t - tau
                    ts.append(sp); gi.append(np.full(sp.size, g)); ww.append(-s * sign * wg[q] * wp)
                    if a < t < b:
                        delta[g] += sign * wg[q] * s
    return np.concatenate(ts), np.concatenate(gi), np.concatenate(ww), delta


_OPS = {}


def _operator(gates, widths, waveform, base_freq, filt):
    """The gates as a linear map of the secondary field at a set of frequencies, for this moment: the gate averaging, the waveform's
    convolution, the earlier half-periods and the Fourier transform folded into two (G, F) matrices, once a moment (TASKS.csv #3485).
    gate = Re(Hs) . Cre + Im(Hs) . Cim (+ delta . (-mu0 Hs_inf)), Hs the secondary Hz per unit moment (with the receiver's filters applied).
    An inversion's every step is then a small product instead of a time transform. -> (freq, Cre, Cim, delta)"""
    import empymod

    key = (np.asarray(gates, float).tobytes(), None if widths is None else np.asarray(widths, float).tobytes(),
           None if waveform is None else np.asarray(waveform, float).tobytes(), float(base_freq or 0.0), filt)
    if key in _OPS:
        return _OPS[key]
    ts, gi, ww, delta = _time_weights(gates, widths, waveform, base_freq)
    time, freq, ft, ftarg = _fourier(ts, filt)
    F, G = len(freq), len(np.asarray(gates))
    iwmu = 2j * math.pi * freq * MU0
    C = {}
    for part, unit in (("re", 1.0), ("im", 1j)):
        Cp = np.zeros((G, F))
        for c0 in range(0, F, 16):
            n = min(16, F - c0)
            E = np.zeros((F, n), np.complex128)
            E[c0 + np.arange(n), np.arange(n)] = unit * iwmu[c0:c0 + n]
            tEM, _ = empymod.model.tem(E, np.ones(n), freq, time, -1, ft, ftarg)
            Y = -np.real(np.asarray(tEM)).reshape(len(time), n)  # y_off at every time for a unit input at each frequency
            block = np.zeros((G, n))
            np.add.at(block, gi, ww[:, None] * Y)
            Cp[:, c0:c0 + n] = block
        C[part] = Cp
    if len(_OPS) > 32:
        _OPS.clear()
    _OPS[key] = (freq, C["re"], C["im"], delta)
    return _OPS[key]


def _filters(system, freq):
    """the receiver's low-pass filters, e^(i w t) convention: a cut-off in Hz (first order), or [cut-off, order] (TASKS.csv #3501: a
    receiver coil is a resonant circuit, a second-order low-pass; SkyTEM lists the coil's and the instrument's cut-offs). Measured on
    the USGS 2016 Yellowstone SkyTEM file against Workbench's forward of the USGS models: the report's 210 kHz coil and 300 kHz
    instrument cut-offs, both first order, left the low moment's first gates after the turn-off 8-20 % low (log-ratio rms 0.083 over
    20-110 us); the coil as second order brings them within 6 % and the later gates within 0.9 % (rms 0.030)"""
    H = np.ones(len(freq), np.complex128)
    f = np.asarray(freq, float)
    for spec in system.get("filters") or []:
        fc, order = (float(spec[0]), int(spec[1])) if isinstance(spec, (list, tuple)) else (float(spec), 1)
        H = H / (1.0 + 1j * f / fc) ** order
    return H


def forward(cond, thick, system, gates, widths=None, waveform=None, jac=False, base_freq=None):
    """The decays a system reads: cond (S, N) S/m, thick (N - 1,) m, gates (G,) s after the end of the turn-off (a gate may be inside the
    turn-off when a waveform is given: a negative time), widths (G,) s or None, waveform [[t, I], ...] (s, current, ending at t = 0 with
    I = 0) or None for an ideal step-off, base_freq (Hz) for a bipolar waveform repeated in its steady state.
    system: geom 'vmd' (r) | 'cloop' (a, r) | 'loop' (a), h (m, or one a station), rz (the receiver above the transmitter, m, or one a
    station), filters (low-pass cut-offs, Hz).
    -> -dBz/dt (S, G) in V / (A m^4) [and its Jacobian (S, G, N) d / d log10(cond)]"""
    freq, Cre, Cim, delta = _operator(gates, widths, waveform, base_freq, _filter_for(system))
    out = fd_hz(cond, thick, freq, system, jac=jac)
    v, J = out if jac else (out, None)
    H = _filters(system, freq)
    vf = v * H[None, :]
    res = vf.real @ Cre.T + vf.imag @ Cim.T
    if not system.get("filters") and np.any(delta != 0):
        res = res + (-MU0 * hs_inf(system, len(v)))[:, None] * delta[None, :]
    if not jac:
        return res
    JH = J * H[None, :, None]
    Jr = np.einsum("sfn,gf->sgn", JH.real, Cre) + np.einsum("sfn,gf->sgn", JH.imag, Cim)
    return res, Jr


def hs_inf(system, S=1):
    """the secondary Hz per unit moment over a perfect conductor (r_TE = -1): the earth's instantaneous response, (S,)"""
    _, G, _, _, L = _geometry(system, np.array([1.0]))
    v = -G[:, :L].sum(axis=1)
    return np.broadcast_to(v, (S,)) if v.size == 1 else v


# ---------------------------------------------------------------------------------------------------------------------------------
# TASKS.csv #3440 (step 2 of 3) — the inversion: FDEM 1D's (em1d.invert_batch: log10 conductivity of N layers, Gauss-Newton with vertical
# smoothness and a weak pull toward the best half-space, the trade-off cooled to a misfit of 1), with TEM's forward through its hook and
# the decays fitted in log space (they span decades). The data are in pV / (A m^4) (SkyTEM / Workbench's unit), so the log's floor
# (em1d clamps at 1e-9) is far below any reading.

PV = 1e12  # V / (A m^4) -> pV / (A m^4)
TEM_LAYERS = {"n": 20, "first": 3.0, "bottom": 300.0}  # ~3 m at the top, a half-space below 300 m (an airborne system's reach)


class TemSurvey:
    """A system and its moments as em1d.invert_batch expects a survey: kind 'log' and forward_fn(m (S, N) log10 S/m, thick, jac).
    moments: [{gates (s), widths (s) or None, waveform or None, baseFreq (Hz) or None}, ...]: one (a single moment) or two (SkyTEM's low
    and high moment, each with its own gates and waveform, their readings one after the other in a station's row: step 3)."""

    kind = "log"
    per_station = True  # TASKS.csv #1987: forward_fn takes rows (the stations a call is for) and geo (a solved height / rz per row)

    def __init__(self, system, gates=None, widths=None, waveform=None, moments=None):
        self.system = dict(system)
        ms = moments if moments else [{"gates": gates, "widths": widths, "waveform": waveform}]
        self.moments = [{"gates": np.asarray(m["gates"], float), "widths": None if m.get("widths") is None else np.asarray(m["widths"], float),
                         "waveform": m.get("waveform"), "baseFreq": m.get("baseFreq")} for m in ms]

    def forward_fn(self, m, thick, jac=False, rows=None, geo=None):
        cond = 10.0 ** np.atleast_2d(np.asarray(m, float))
        system = self.system
        for key in ("h", "rz", "tilt"):
            if geo is not None and key in geo:
                system = {**system, key: np.asarray(geo[key], float)}  # TASKS.csv #1987: the height / rz being solved for, one a row
                continue
            v = np.atleast_1d(np.asarray(system.get(key, 0.0), float))
            if len(v) > 1 and rows is not None:
                system = {**system, key: v[rows]}  # TASKS.csv #1987: the line search's stations (a subset of the batch)
            elif len(v) > 1 and len(v) != len(cond):
                # step 3 — the stations' own heights, but not one model a station (em1d.invert_batch's half-space search: a grid of 46 models):
                # the mean, for that starting guess only
                system = {**system, key: float(v.mean())}
        outs = [forward(cond, thick, system, mo["gates"], mo["widths"], mo["waveform"], jac=jac, base_freq=mo["baseFreq"]) for mo in self.moments]
        # TASKS.csv #3502 — the frame's tilt: the transmitter and the receiver coil tilt together, which scales the reading by cos(pitch) cos(roll)
        # (empymod, a SkyTEM frame 40 m up: 0.9986 at 3 degrees of pitch, 0.9945 at 6, 0.9987 at 3 of roll; the cross-couplings cancel). The
        # receiver's move up or down with the pitch is its height (rz), which matters far more (1.7 % at 3 degrees) and is set apart.
        k = np.atleast_1d(np.asarray(system.get("tilt", 1.0), float))[:, None] * PV
        if jac:
            return np.concatenate([o[0] for o in outs], axis=1) * k, np.concatenate([o[1] for o in outs], axis=1) * k[:, :, None]
        return np.concatenate(outs, axis=1) * k


def run_job(req, progress):
    """req: system {geom 'vmd' | 'loop', r | a, h}; either gates (s) [+ widths, waveform] or moments [{gates, widths?, waveform?}, ...]
    (step 3: two moments in one station's row, one after the other); data (rows of pV / (A m^4), null = missing); std (rows of relative
    uncertainties, optional) or errRel / errAbs (pV / (A m^4)); heights (m above the ground per station, optional: the system's h otherwise);
    layers {n, first, bottom}; lateral, window, gapM, maxIter, line, x, y.
    TASKS.csv #1987 — prior {condMs: (N) or (S, N) mS/m, null = none on that layer; sdLog: decades, one, (N) or (S, N)}: a reference model
    with its own uncertainty per layer; free {height: {sd}, rz: {sd}} (m): the height and the receiver's rz solved for, each with the
    file's value as its prior mean and the typed sd.
    Progress events carry each finished batch ('partial': idx, condMs, chi, doi, pred, sdLog [, heightM, heightSdM, rzM, rzSdM]), so a
    cancelled run keeps the stations it finished.
    -> thick, condMs (mS/m per layer), chi, doi, pred (pV / (A m^4)), sdLog (the posterior sd of log10 cond per layer, linearised: it
    depends on the regularisation), [heightM, heightSdM, rzM, rzSdM], seconds, leftOut (readings <= 0)"""
    import time as _time

    from .em1d import ALPHA, DOI_FRAC, depth_of_investigation, invert_batch, layer_thicknesses, neighbour_mean

    t0 = _time.time()
    system = dict(req["system"])
    moments = req.get("moments") or [{"gates": req["gates"], "widths": req.get("widths"), "waveform": req.get("waveform")}]
    data = np.array([[np.nan if v is None else float(v) for v in row] for row in req["data"]], float)
    rel, ab = float(req.get("errRel", 0.05)), float(req.get("errAbs", 0.0))
    if req.get("std") is not None:
        std = np.array([[np.nan if v is None else float(v) for v in row] for row in req["std"]], float)
        sd = np.where(np.isfinite(std), np.abs(std) * np.abs(data), rel * np.abs(data)) + ab
    else:
        sd = rel * np.abs(data) + ab
    lay = {**TEM_LAYERS, **(req.get("layers") or {})}
    thick = layer_thicknesses(int(lay["n"]), float(lay["first"]), float(lay["bottom"]))
    lateral = float(req.get("lateral", 0.0))
    max_iter = int(req.get("maxIter", 15))
    S = len(data)
    line = req.get("line") or [0] * S
    x = np.asarray(req.get("x") or [0.0] * S, float)
    y = np.asarray(req.get("y") or [0.0] * S, float)
    # TASKS.csv #3440 step 3 — the system's height at each station (a SkyTEM file's altitude column), each station modelled at its own
    # height (the kernel takes a row of weights a station). Binning them per metre left batches of a station or two on a real survey (the
    # USGS MudPot file: 60 heights from 19 to 81 m), so the cores sat idle. Without heights, every station at the system's h.
    h0 = float(system.get("h", 0.0))
    hs = np.asarray(req.get("heights") or [h0] * S, float)
    hs = np.where(np.isfinite(hs) & (hs >= 0), hs, h0)
    # TASKS.csv #3485 — the receiver above the transmitter at each station (a SkyTEM file's RX_ALTITUDE less TX_ALTITUDE)
    rz0 = float(system.get("rz", 0.0))
    rzs = np.asarray([rz0 if v is None else v for v in req["rz"]] if req.get("rz") is not None else [rz0] * S, float)
    rzs = np.where(np.isfinite(rzs), rzs, rz0)
    # TASKS.csv #3502 — each station's tilt factor, cos(pitch) cos(roll) (1 without)
    tilts = np.asarray([1.0 if v is None else v for v in req["tilt"]] if req.get("tilt") is not None else [1.0] * S, float)
    tilts = np.where(np.isfinite(tilts) & (tilts > 0), tilts, 1.0)
    left_out = int((np.isfinite(data) & (data <= 0)).sum())
    N = len(thick) + 1
    # TASKS.csv #1987 — the prior on the layers, broadcast to (S, N) (NaN: no prior on that layer)
    pm = ps = None
    pr = req.get("prior")
    if pr:
        pc = np.array([[np.nan if v is None else float(v) for v in row] for row in pr["condMs"]], float) if np.ndim(pr["condMs"]) == 2             else np.array([np.nan if v is None else float(v) for v in pr["condMs"]], float)
        pm = np.broadcast_to(np.log10(np.where(pc > 0, pc, np.nan) / 1000.0), (S, N))
        sdl = pr.get("sdLog")
        sa = np.array(sdl if np.ndim(sdl) else [sdl], dtype=float) if sdl is not None else np.array([np.nan])
        ps = np.broadcast_to(np.where(np.isfinite(sa), sa, np.nan), (S, N)) if sa.ndim < 2 else sa
    fr = req.get("free") or {}
    free_sd = {k: float(fr[name]["sd"]) for name, k in (("height", "h"), ("rz", "rz")) if fr.get(name)}
    sd_log = np.full((S, N), np.nan)
    geo_out = {k: np.full(S, np.nan) for k in free_sd}
    geo_sd = {k: np.full(S, np.nan) for k in free_sd}
    passes = 2 if lateral > 0 else 1
    m = np.full((S, len(thick) + 1), np.nan)
    chi = np.full(S, np.nan)
    pred = np.full_like(data, np.nan)
    doi = np.full(S, np.nan)
    # batches: in file order, BATCH stations at a time (numba spreads a batch over the engine's threads)
    batches = [np.arange(c0, min(c0 + BATCH, S)) for c0 in range(0, S, BATCH)]
    nan = lambda a: [None if not np.isfinite(v) else round(float(v), 6) for v in np.ravel(a)]
    done = 0
    first = None  # (seconds, stations) at the end of the first batch: it carries numba's compile, so the time left is timed from the next ones
    recent = []  # the last few finished batches: the app reads the latest progress event about once a second, so one event carries several
    # at once: the first batch (32 stations and numba's compile) takes a minute on a laptop, and the app should say it has started
    progress({"stage": "inverting", "message": f"0 of {S:,} stations…", "iter": 0, "maxIter": passes * S, "etaS": None, "pass": 0, "passes": passes, "stations": S})
    for p in range(passes):
        ref = None if p == 0 else neighbour_mean(m, line, x, y, int(req.get("window", 3)), float(req.get("gapM", 100.0)))
        for idx in batches:
            mr = None if ref is None else ref[idx]
            alpha = ALPHA if ref is None else np.where(np.isfinite(mr[:, 0]), max(lateral, ALPHA), ALPHA)
            free = {k: ({"h": hs, "rz": rzs}[k][idx], v) for k, v in free_sd.items()} or None
            mm, cc, pp, JJ, ww, inf = invert_batch(TemSurvey({**system, "h": hs[idx], "rz": rzs[idx], "tilt": tilts[idx]}, moments=moments), data[idx], sd[idx], thick,
                                                   m_ref=mr, alpha=alpha, max_iter=max_iter, prior=None if pm is None else (pm[idx], ps[idx]), free=free, info=True)
            m[idx], chi[idx], pred[idx], sd_log[idx] = mm, cc, pp, inf["sd"]
            for k in free_sd:
                geo_out[k][idx], geo_sd[k][idx] = inf["g"][k], inf["gsd"][k]
            doi[idx] = depth_of_investigation(JJ, ww, thick, float(req.get("doiFrac", DOI_FRAC)))
            pp_out = pp.copy()
            pp_out[~np.isfinite(data[idx])] = np.nan
            done += len(idx)
            el = _time.time() - t0
            if first is None:
                first = (el, done)
            eta = round((el - first[0]) / (done - first[1]) * (passes * S - done)) if done > first[1] else None
            part = {"idx": [int(i) for i in idx], "condMs": [nan(1000.0 * 10.0 ** row) for row in mm], "chi": nan(cc), "doi": nan(doi[idx]),
                    "pred": [nan(row) for row in pp_out], "sdLog": [nan(row) for row in inf["sd"]], "pass": p}
            part.update(_geo_fields(free_sd, inf["g"], inf["gsd"], nan))
            recent = (recent + [part])[-RECENT_BATCHES:]
            progress({"stage": "inverting", "message": (f"Pass {p + 1} of {passes}: " if passes > 1 else "") + f"{done - p * S:,} of {S:,} stations…",
                      "iter": done, "maxIter": passes * S, "etaS": eta, "pass": p, "passes": passes, "stations": S, "partials": recent})
    pred[~np.isfinite(data)] = np.nan
    return {
        "thick": [round(float(t), 4) for t in thick],
        "condMs": [nan(1000.0 * 10.0 ** row) for row in m],
        "chi": nan(chi), "doi": nan(doi),
        "pred": [nan(row) for row in pred],
        "sdLog": [nan(row) for row in sd_log],
        **_geo_fields(free_sd, geo_out, geo_sd, nan),
        "leftOut": left_out,
        "seconds": round(_time.time() - t0, 1),
    }


def _geo_fields(free_sd, g, gsd, nan):
    """TASKS.csv #1987 — the solved height / rz and their posterior sd (m), under the names the app reads"""
    out = {}
    for k, name in (("h", "height"), ("rz", "rz")):
        if k in free_sd:
            out[name + "M"], out[name + "SdM"] = nan(g[k]), nan(gsd[k])
    return out


RECENT_BATCHES = 4  # finished batches carried by each progress event (a batch takes seconds; the app polls every second)
BATCH = 32  # stations a batch: numba's prange spreads them over the engine's threads (2.7x on 3 threads, measured)
