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


# ---------------------------------------------------------------------------------------------------------------------------------
# TASKS.csv #3440 (step 2 of 3) — the inversion: FDEM 1D's (em1d.invert_batch: log10 conductivity of N layers, Gauss-Newton with vertical
# smoothness and a weak pull toward the best half-space, the trade-off cooled to a misfit of 1), with TEM's forward through its hook and
# the decays fitted in log space (they span decades). The data are in pV / (A m^4) (SkyTEM / Workbench's unit), so the log's floor
# (em1d clamps at 1e-9) is far below any reading.

PV = 1e12  # V / (A m^4) -> pV / (A m^4)
TEM_LAYERS = {"n": 20, "first": 3.0, "bottom": 300.0}  # ~3 m at the top, a half-space below 300 m (an airborne system's reach)


class TemSurvey:
    """A system and its moments as em1d.invert_batch expects a survey: kind 'log' and forward_fn(m (S, N) log10 S/m, thick, jac).
    moments: [{gates (s), widths (s) or None, waveform or None}, ...]: one (a single moment) or two (SkyTEM's low and high moment, each with
    its own gates and waveform, their readings one after the other in a station's row: step 3)."""

    kind = "log"

    def __init__(self, system, gates=None, widths=None, waveform=None, moments=None):
        self.system = dict(system)
        ms = moments if moments else [{"gates": gates, "widths": widths, "waveform": waveform}]
        self.moments = [{"gates": np.asarray(m["gates"], float), "widths": None if m.get("widths") is None else np.asarray(m["widths"], float),
                         "waveform": m.get("waveform")} for m in ms]

    def forward_fn(self, m, thick, jac=False):
        cond = 10.0 ** np.atleast_2d(np.asarray(m, float))
        system = self.system
        h = np.atleast_1d(np.asarray(system.get("h", 0.0), float))
        if len(h) > 1 and len(h) != len(cond):
            # step 3 — the stations' own heights, but not one model a station (em1d.invert_batch's half-space search: a grid of 46 models):
            # the mean height, for that starting guess only
            system = {**system, "h": float(h.mean())}
        outs = [forward(cond, thick, system, mo["gates"], mo["widths"], mo["waveform"], jac=jac) for mo in self.moments]
        if jac:
            return np.concatenate([o[0] for o in outs], axis=1) * PV, np.concatenate([o[1] for o in outs], axis=1) * PV
        return np.concatenate(outs, axis=1) * PV


def run_job(req, progress):
    """req: system {geom 'vmd' | 'loop', r | a, h}; either gates (s) [+ widths, waveform] or moments [{gates, widths?, waveform?}, ...]
    (step 3: two moments in one station's row, one after the other); data (rows of pV / (A m^4), null = missing); std (rows of relative
    uncertainties, optional) or errRel / errAbs (pV / (A m^4)); heights (m above the ground per station, optional: the system's h otherwise);
    layers {n, first, bottom}; lateral, window, gapM, maxIter, line, x, y.
    Progress events carry each finished batch ('partial': idx, condMs, chi, doi, pred), so a cancelled run keeps the stations it finished.
    -> thick, condMs (mS/m per layer), chi, doi, pred (pV / (A m^4)), seconds, leftOut (readings <= 0)"""
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
    left_out = int((np.isfinite(data) & (data <= 0)).sum())
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
            mm, cc, pp, JJ, ww = invert_batch(TemSurvey({**system, "h": hs[idx]}, moments=moments), data[idx], sd[idx], thick, m_ref=mr, alpha=alpha, max_iter=max_iter)
            m[idx], chi[idx], pred[idx] = mm, cc, pp
            doi[idx] = depth_of_investigation(JJ, ww, thick, float(req.get("doiFrac", DOI_FRAC)))
            pp_out = pp.copy()
            pp_out[~np.isfinite(data[idx])] = np.nan
            done += len(idx)
            el = _time.time() - t0
            if first is None:
                first = (el, done)
            eta = round((el - first[0]) / (done - first[1]) * (passes * S - done)) if done > first[1] else None
            recent = (recent + [{"idx": [int(i) for i in idx], "condMs": [nan(1000.0 * 10.0 ** row) for row in mm], "chi": nan(cc), "doi": nan(doi[idx]),
                                 "pred": [nan(row) for row in pp_out], "pass": p}])[-RECENT_BATCHES:]
            progress({"stage": "inverting", "message": (f"Pass {p + 1} of {passes}: " if passes > 1 else "") + f"{done - p * S:,} of {S:,} stations…",
                      "iter": done, "maxIter": passes * S, "etaS": eta, "pass": p, "passes": passes, "stations": S, "partials": recent})
    pred[~np.isfinite(data)] = np.nan
    return {
        "thick": [round(float(t), 4) for t in thick],
        "condMs": [nan(1000.0 * 10.0 ** row) for row in m],
        "chi": nan(chi), "doi": nan(doi),
        "pred": [nan(row) for row in pred],
        "leftOut": left_out,
        "seconds": round(_time.time() - t0, 1),
    }


RECENT_BATCHES = 4  # finished batches carried by each progress event (a batch takes seconds; the app polls every second)
BATCH = 32  # stations a batch: numba's prange spreads them over the engine's threads (2.7x on 3 threads, measured)
