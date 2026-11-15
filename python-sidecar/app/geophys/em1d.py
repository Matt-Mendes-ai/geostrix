"""TASKS.csv #1986 — 1D layered-earth FDEM for loop-loop instruments (DUALEM, GEM-2, EM31 / EM34-style): forward modelling
and a smooth 1D inversion of every sounding, optionally tied to its neighbours along the line.

Forward. The secondary field over the primary (Hs / Hp) of a coil pair at height h over a layered earth, quasi-static, by the
Hankel transforms of the TE reflection coefficient (Ward & Hohmann 1988):
  HCP  horizontal coplanar (Tx z, Rx z):            Hs/Hp = -r^3 Int r_TE e^(-2 l h) l^2 J0(l r) dl
  VCP  vertical coplanar, broadside (Tx y, Rx y):   Hs/Hp = -r^2 Int r_TE e^(-2 l h) l   J1(l r) dl
  PRP  perpendicular (Tx z, Rx x along the line):   Hs/Hp = -r^3 Int r_TE e^(-2 l h) l^2 J1(l r) dl  (DUALEM's 1.1 / 2.1 / 4.1 m)
normalised by the coplanar free-space primary at that separation, signed so a conductive earth reads positive (as the
instruments report it), with Key's 2012 101-point J0 / J1 filter (libdlf). empymod (Werthmueller 2017, Apache-2.0) is the
reference: hs_hp_empymod computes the same with empymod.dipole, and tests/test_em1d.py holds the two together (equal to
the 5th decimal, displacement currents off in both: with them, GEM-2's 48 kHz in-phase over resistive ground moves ~0.3 %).
This kernel exists for speed: one empymod call is 3-5 ms, and an inversion needs hundreds of forwards per sounding. Here the
admittance recursion runs for a batch of soundings at once and carries its derivative with respect to every layer's log
conductivity (the Jacobian in one pass, not one forward per layer).

Data as instruments report them:
  - "eca": apparent conductivity (mS/m) from the quadrature by the low-induction-number relation (McNeill 1980),
           eca = 4 Im(Hs/Hp) / (omega mu0 s^2): DUALEM, EM31, and GEM-2's EC channels
  - "ppm": in-phase and quadrature, 1e6 Re / Im(Hs/Hp), per coil (GEM-2)

Inversion: log10 conductivity of N layers (thicknesses growing geometrically from `first` to a depth `bottom`, then a
half-space), Gauss-Newton with vertical smoothness and a weak pull toward a reference (the best half-space). The trade-off is
halved each iteration until the error-weighted RMS misfit reaches 1, then held. With `lateral` > 0 a second pass pulls each
sounding toward the mean of its neighbours' first-pass models (within `window` soundings on the same line, no gap over gapM):
a stand-in for a laterally constrained inversion, not the same thing.
A 1D model is wrong under a 3D conductor (a dyke, a pipe, a fence): the interface says so.
"""
from __future__ import annotations

import math
import time

import numpy as np

MU0 = 4e-7 * math.pi
AIR = 2e14  # empymod's air resistivity (Ohm m)
LN10 = math.log(10.0)
LOG_BOUNDS = (-5.0, 1.0)  # log10 S/m: 0.01 mS/m to 10 S/m
CHUNK = 64  # soundings per batch
DOI_FRAC = 0.8  # set so the medians bracket Workbench's standard DOI on the two USGS surveys (DUALEM 5.2 vs 4.7 m, GEM-2 2.4 vs 3.1 m)
ALPHA = 0.05  # the pull toward the reference (the best half-space) beside the vertical smoothness: depths the data do not
# reach stay at the half-space instead of drifting with the layer above

_FILTER = None


def _filt():
    global _FILTER
    if _FILTER is None:
        import libdlf
        b, j0, j1 = libdlf.hankel.key_101_2012()  # within 1.3e-5 of the 201-point filter on these geometries, half the work
        _FILTER = (np.asarray(b, float), np.asarray(j0, float), np.asarray(j1, float))
    return _FILTER


def layer_thicknesses(n=20, first=0.2, bottom=15.0):
    """n - 1 layers from `first` thick down to `bottom` (m), growing geometrically, then the half-space: n conductivities"""
    if n < 2:
        return np.array([])
    k = n - 1
    if first * k >= bottom:
        return np.full(k, bottom / k)
    lo, hi = 1.0 + 1e-12, 4.0
    for _ in range(200):
        q = 0.5 * (lo + hi)
        s = first * (q ** k - 1) / (q - 1)
        lo, hi = (q, hi) if s < bottom else (lo, q)
    return first * q ** np.arange(k)


class Survey:
    """The coils, the height and the filter points, laid out once: K = coils x 201 abscissae"""

    def __init__(self, coils, height, kind):
        base, w0, w1 = _filt()
        self.coils, self.height, self.kind = coils, float(height), kind
        C, L = len(coils), len(base)
        self.C, self.L = C, L
        self.lam = np.empty((C, L))
        self.G = np.empty((C, L))
        self.iwmu = np.empty((C, L), complex)
        for i, c in enumerate(coils):
            r, g = float(c["sep"]), c["geom"]
            lam = base / r
            ex = np.exp(-2.0 * lam * self.height)
            if g == "HCP":
                G = -r ** 2 * ex * lam ** 2 * w0
            elif g == "VCP":
                G = -r * ex * lam * w1
            elif g == "PRP":
                G = -r ** 2 * ex * lam ** 2 * w1
            else:
                raise ValueError(f"Unknown coil geometry {g!r}: HCP, VCP or PRP")
            self.lam[i], self.G[i] = lam, G
            self.iwmu[i] = 1j * MU0 * 2 * math.pi * float(c["freq"])
        self.lam, self.G, self.iwmu = (np.ascontiguousarray(a.ravel()) for a in (self.lam, self.G, self.iwmu))
        w = np.array([2 * math.pi * float(c["freq"]) for c in coils])
        s = np.array([float(c["sep"]) for c in coils])
        self.eca_factor = 1000.0 * 4.0 / (w * MU0 * s ** 2)  # Im(Hs/Hp) -> mS/m
        self.D = C if kind == "eca" else 2 * C

    def data(self, v):
        """(S, C) complex Hs/Hp -> (S, D) data (also for (S, C, N) derivatives: the same linear map on the coil axis)"""
        if self.kind == "eca":
            return v.imag * (self.eca_factor[:, None] if v.ndim == 3 else self.eca_factor)
        sh = list(v.shape)
        sh[1] = 2 * self.C
        out = np.empty(sh)
        out[:, 0::2] = 1e6 * v.real
        out[:, 1::2] = 1e6 * v.imag
        return out


def _numba_kernel():
    """the recursion for every (sounding, filter point), fused and in parallel over soundings; compiled on first use"""
    global _KERNEL
    if _KERNEL is not None:
        return _KERNEL
    import numba

    @numba.njit(parallel=True, fastmath=False, cache=False)
    def kern(sig, thick, lam, iwmu, G, C, L, jac, v, J):
        S, N = sig.shape
        for s in numba.prange(S):
            gs = np.int64(s) if G.shape[0] > 1 else np.int64(0)  # TASKS.csv #3440 — G has one row of weights, or one a sounding (TEM: each station's height)
            U = np.empty(N, np.complex128)
            dYdY = np.empty(N, np.complex128)
            dYdu = np.empty(N, np.complex128)
            for c in range(C):
                acc = 0j
                for jj in range(N):
                    J[s, c, jj] = 0j
                for l in range(L):
                    k = c * L + l
                    lk = lam[k]
                    l2 = lk * lk
                    for jj in range(N):
                        U[jj] = np.sqrt(l2 + iwmu[k] * sig[s, jj])
                    Y = U[N - 1]
                    dYdu[N - 1] = 1.0
                    for jj in range(N - 2, -1, -1):
                        u = U[jj]
                        d = thick[jj]
                        e = np.exp(-2.0 * u * d)  # tanh without overflow: Re(u) > 0
                        t = (1.0 - e) / (1.0 + e)
                        num = Y + u * t
                        den = u + Y * t
                        if jac:
                            dt = d * (1.0 - t * t)
                            dYdY[jj] = u * u * (1.0 - t * t) / (den * den)
                            dnum = t + u * dt
                            dden = 1.0 + Y * dt
                            dYdu[jj] = num / den + u * (dnum * den - num * dden) / (den * den)
                        Y = u * num / den
                    g = G[gs, k]
                    acc += (lk - Y) / (lk + Y) * g
                    if jac:
                        P = -2.0 * lk / ((lk + Y) * (lk + Y)) * g
                        for jj in range(N):
                            du = iwmu[k] * sig[s, jj] * 2.302585092994046 / (2.0 * U[jj])
                            J[s, c, jj] += P * dYdu[jj] * du
                            if jj < N - 1:
                                P = P * dYdY[jj]
                v[s, c] = acc
        return 0

    _KERNEL = kern
    return kern


_KERNEL = None


def forward(sv, m, thick, jac=False):
    """m: (S, N) log10 S/m; thick: (N - 1,). -> data (S, D), and with jac the Jacobian (S, D, N) d data / d m"""
    m = np.ascontiguousarray(np.atleast_2d(m), float)
    S, N = m.shape
    v = np.empty((S, sv.C), np.complex128)
    J = np.empty((S, sv.C, N if jac else 1), np.complex128)
    _numba_kernel()(10.0 ** m, np.ascontiguousarray(thick, float), sv.lam, sv.iwmu, sv.G.reshape(1, -1), sv.C, sv.L, bool(jac), v, J if jac else np.empty((S, sv.C, N), np.complex128))
    out = sv.data(v)
    return (out, sv.data(J)) if jac else out


def hs_hp_batch(cond, thick, coils, height):
    """cond (B, N) S/m -> (B, C) complex Hs / Hp (the kernel, for the tests against empymod)"""
    sv = Survey(coils, height, "ppm")
    d = forward(sv, np.log10(np.atleast_2d(cond)), np.asarray(thick, float))
    return d[:, 0::2] / 1e6 + 1j * d[:, 1::2] / 1e6


def hs_hp_empymod(cond, thick, coils, height):
    """The same with empymod.dipole: the reference the kernel is tested against"""
    import empymod
    cond = np.asarray(cond, float)
    depth = np.concatenate([[0.0], np.cumsum(thick)]) if len(cond) > 1 else np.array([0.0])
    res = np.concatenate([[AIR], 1.0 / np.maximum(cond, 1e-12)])
    ab = {"HCP": 66, "VCP": 55, "PRP": 46}
    zero = np.zeros(len(res))
    out = np.empty(len(coils), complex)
    for i, c in enumerate(coils):
        kw = dict(src=[0.0, 0.0, -height], rec=[float(c["sep"]), 0.0, -height], freqtime=[float(c["freq"])], verb=0)
        tot = complex(np.atleast_1d(empymod.dipole(depth=depth, res=res, ab=ab[c["geom"]], epermH=zero, epermV=zero, **kw))[0])
        prim_ab = 55 if c["geom"] == "VCP" else 66
        prim = complex(np.atleast_1d(empymod.dipole(depth=[0.0], res=[AIR, AIR], ab=prim_ab, epermH=[0, 0], epermV=[0, 0], **kw))[0])
        free = 0.0 if c["geom"] == "PRP" else prim
        out[i] = (tot - free) / prim * (-1.0 if c["geom"] == "PRP" else 1.0)  # PRP: the instrument's sign
    return out


GEO_STEP = 0.1  # m: the finite-difference step of a freed geometry parameter's Jacobian column (TASKS.csv #1987)


def invert_batch(sv, d, sd, thick, m_ref=None, alpha=ALPHA, max_iter=15, smooth=1.0, prior=None, free=None, info=False):
    """d, sd: (S, D) data and standard deviations (NaN = missing). -> m (S, N), chi (S,), pred (S, D), J (S, D, N), w (S, D)
    [, and with info=True a dict: sd (S, N) the posterior standard deviation of log10 cond (decades), g {name: (S,)} the solved geometry,
    gsd {name: (S,)} its posterior sd].
    TASKS.csv #1987 (Stage A) —
    prior: (m_pr, s_pr), each (N,) or (S, N): a reference model (log10 S/m) with its own uncertainty per layer (decades); the term
      |(m - m_pr) / s_pr|^2 is added as it is, not scaled by the trade-off beta (a typed uncertainty keeps its meaning while beta cools),
      so s -> 0 returns the reference and s -> inf today's result. NaN or a non-positive sd: no prior on that layer.
    free: {name: (g0, s)} geometry solved for beside the model (a survey with per_station geometry: TEM's 'h' and 'rz'), each with its
      prior mean (g0 (S,): the file's value) and sd (m, (S,) or one), its Jacobian column by a finite difference (one more forward a
      parameter an iteration).
    The posterior is linearised at the solution, C = (J' W^2 J + beta R + Q)^-1, so it depends on the regularisation: a figure of the
    same kind as Workbench's, not a sampled uncertainty."""
    S, Dn = d.shape
    N = len(thick) + 1
    # apparent conductivity is fitted in log space (Workbench's choice too): sd becomes the log of 1 + the relative error, so a
    # model over-predicting a near-zero reading is not punished as if the reading were exact; a reading <= 0 has no log and is
    # left out (counted by the caller). ppm (in-phase can be negative) stays linear.
    # TASKS.csv #3440 — a TEM survey (app/geophys/tem1d.py TemSurvey) brings its own forward (forward_fn) and kind "log": its decays span decades
    logd = sv.kind in ("eca", "log")
    fw = getattr(sv, "forward_fn", None) or (lambda mm, th, jac=False: forward(sv, mm, th, jac=jac))
    # TASKS.csv #1987 — a survey with a geometry per station (TEM: height, rz, tilt) takes the rows a call is for: the line search runs on
    # the stations still moving, and before this each such call fell back to the batch's mean height (the half-space grid's rule)
    per_station = bool(getattr(sv, "per_station", False))
    keys = list(free or {})
    K = len(keys)
    if K and not per_station:
        raise ValueError("Geometry can be solved for only on a survey with a geometry per station.")
    g0 = np.zeros((S, K))
    sg = np.ones((S, K))
    for k, name in enumerate(keys):
        a0, s0 = free[name]
        g0[:, k] = np.broadcast_to(np.asarray(a0, float), (S,))
        sg[:, k] = np.broadcast_to(np.asarray(s0, float), (S,))
    if K and not (np.all(np.isfinite(g0)) and np.all(np.isfinite(sg)) and np.all(sg > 0)):
        raise ValueError("A freed geometry parameter needs a prior value and a positive uncertainty at every station.")
    glo, ghi = g0 - 6.0 * sg, g0 + 6.0 * sg
    for k, name in enumerate(keys):
        if name == "h":
            glo[:, k] = np.maximum(glo[:, k], 1.0)  # the system stays above the ground
    ok = np.isfinite(d) & np.isfinite(sd) & (sd > 0) & ((d > 0) if logd else True)
    if logd:
        dd = np.where(ok, np.log(np.where(ok, d, 1.0)), 0.0)
        w = np.where(ok, 1.0 / np.log1p(np.where(ok, sd / np.where(ok, d, 1.0), 1.0)), 0.0)
    else:
        dd = np.where(ok, d, 0.0)
        w = np.where(ok, 1.0 / np.where(ok, sd, 1.0), 0.0)
    nd = np.maximum(ok.sum(1), 1)
    # TASKS.csv #3501 — a TEM decay (kind "log") predicted at or below zero (a gate inside the turn-off, where a receiver's filters make the
    # response cross zero: Workbench's own forward does too) is floored at a thousandth of its own reading, not at 1e-9: its misfit then
    # saturates (ln 1000 over its log uncertainty) and gives no gradient, instead of one gate's log(1e-9) swamping the station (measured on
    # the USGS SkyTEM file: chi median 2.33 with the two gates inside the ramp, against 1.20 without them)
    floor_rows = floor_any = 1e-9
    if sv.kind == "log":
        dpos = np.where(ok, np.abs(d), np.nan)
        floor_rows = np.where(np.isfinite(dpos), 1e-3 * dpos, 1e-9)
        floor_any = 1e-3 * float(np.nanmin(dpos)) if np.isfinite(dpos).any() else 1e-9

    def _floor(p, rows):
        if np.ndim(floor_rows) == 2:
            fr = floor_rows if rows is None else floor_rows[rows]
            if fr.shape == p.shape:
                return fr
        return floor_any  # the half-space search's grid rows take one floor

    def F(mm, jac=False, rows=None, gg=None):
        kw = {}
        if per_station:
            kw["rows"] = rows
            if K and gg is not None:
                kw["geo"] = {name: gg[:, k] for k, name in enumerate(keys)}
        if not jac:
            p = fw(mm, thick, **kw)
            return np.log(np.maximum(p, _floor(p, rows))) if logd else p
        p, Jm = fw(mm, thick, jac=True, **kw)
        if logd:
            fl = _floor(p, rows)
            pp = np.maximum(p, fl)
            return np.log(pp), np.where((p > fl)[:, :, None], Jm / pp[:, :, None], 0.0)
        return p, Jm

    def FJ(mm, gg):
        """the prediction and the Jacobian of the model and the freed geometry (S, D, N + K)"""
        p, Jm = F(mm, jac=True, gg=gg)
        if not K:
            return p, Jm, Jm
        Jg = np.empty((S, Dn, K))
        for k in range(K):
            gk = gg.copy()
            gk[:, k] += GEO_STEP
            Jg[:, :, k] = (F(mm, gg=gk) - p) / GEO_STEP
        return p, Jm, np.concatenate([Jm, Jg], axis=2)

    grid = np.linspace(-4.0, 0.5, 46)
    gp = F(np.repeat(grid[:, None], N, 1))  # the best half-space (as N equal layers)
    hs = grid[np.argmin((((gp[None, :, :] - dd[:, None, :]) * w[:, None, :]) ** 2).sum(-1), axis=1)]
    m = np.repeat(hs[:, None], N, 1)
    ref = m.copy() if m_ref is None else np.where(np.isfinite(m_ref), m_ref, m)
    a = np.broadcast_to(np.asarray(alpha, float), (S,)).copy()
    Dm = np.diff(np.eye(N), axis=0) * smooth
    R = Dm.T @ Dm
    Rs = R[None, :, :] + a[:, None, None] * np.eye(N)[None, :, :]  # (S, N, N)
    P = N + K
    Rb = np.zeros((S, P, P))
    Rb[:, :N, :N] = Rs
    # the prior's precision per unknown (not scaled by beta) and its mean: the typed reference on the layers, the file's geometry
    q = np.zeros((S, P))
    xp = np.zeros((S, P))
    if prior is not None:
        pm = np.broadcast_to(np.asarray(prior[0], float), (S, N))
        ps = np.broadcast_to(np.asarray(prior[1], float), (S, N))
        okp = np.isfinite(pm) & np.isfinite(ps) & (ps > 0)
        q[:, :N] = np.where(okp, 1.0 / np.where(okp, ps, 1.0) ** 2, 0.0)
        xp[:, :N] = np.where(okp, pm, 0.0)
    if K:
        q[:, N:] = 1.0 / sg ** 2
        xp[:, N:] = g0
    refx = np.concatenate([ref, np.zeros((S, K))], axis=1)
    lo = np.concatenate([np.full((S, N), LOG_BOUNDS[0]), glo], axis=1)
    hi = np.concatenate([np.full((S, N), LOG_BOUNDS[1]), ghi], axis=1)
    x = np.concatenate([m, g0], axis=1)
    beta = None
    active = ok.any(1)
    pred = F(m, gg=g0 if K else None)
    chi = np.sqrt((((pred - dd) * w) ** 2).sum(1) / nd)

    def _penalty(xx, rows):
        dr = xx - refx[rows]
        dp = xx - xp[rows]
        return beta[rows] * np.einsum("si,sij,sj->s", dr, Rb[rows], dr) + (q[rows] * dp * dp).sum(1)

    allrows = np.arange(S)
    for _ in range(max_iter):
        if not active.any():
            break
        pred, _, J = FJ(x[:, :N], x[:, N:])
        JW = J * w[:, :, None]
        A = np.einsum("sdi,sdj->sij", JW, JW)
        if beta is None:
            beta = 10.0 * np.trace(A[:, :N, :N], axis1=1, axis2=2) / np.trace(Rs, axis1=1, axis2=2)
            beta = np.maximum(beta, 1e-12)
            beta0 = beta.copy()
            frozen = np.zeros(S, bool)
        res = (dd - pred) * w
        grad = np.einsum("sdi,sd->si", JW, res) - beta[:, None] * np.einsum("sij,sj->si", Rb, x - refx) - q * (x - xp)
        H = A + beta[:, None, None] * Rb + q[:, :, None] * np.eye(P)[None, :, :]
        step = np.linalg.solve(H, grad[:, :, None])[:, :, 0]
        phi0 = (res ** 2).sum(1) + _penalty(x, allrows)
        t = np.ones(S)
        accepted = np.zeros(S, bool)
        x_new, p_new = x.copy(), pred.copy()
        for _ls in range(8):
            todo = active & ~accepted
            if not todo.any():
                break
            idx = np.flatnonzero(todo)
            xt = np.clip(x[idx] + t[idx][:, None] * step[idx], lo[idx], hi[idx])
            pt = F(xt[:, :N], rows=idx, gg=xt[:, N:] if K else None)
            phi = (((dd[idx] - pt) * w[idx]) ** 2).sum(1) + _penalty(xt, idx)
            good = phi < phi0[idx]
            x_new[idx[good]], p_new[idx[good]] = xt[good], pt[good]
            accepted[idx[good]] = True
            t[idx[~good]] *= 0.5
        moved = np.abs(x_new[:, :N] - x[:, :N]).max(1)
        if K:
            moved = np.maximum(moved, 0.1 * np.abs(x_new[:, N:] - x[:, N:]).max(1))  # 1 cm of height counts as 1e-3 decades
        x, pred = x_new, p_new
        chi_prev = chi
        chi = np.sqrt((((pred - dd) * w) ** 2).sum(1) / nd)
        active &= accepted
        # cool while the misfit is above the target and still falling; once it stalls (data no 1D model at this height can
        # fit: a near-zero reading in resistive sand), hold the trade-off instead of chasing it into extreme layers
        improving = chi < 0.98 * chi_prev
        cool = (chi > 1.0) & improving & (beta > beta0 * 1e-4)
        beta = np.where(cool, beta * 0.5, beta)
        active &= ~(~cool & (moved < 1e-3))
        active &= ~((chi > 1.0) & ~improving & (frozen))
        frozen = frozen | ((chi > 1.0) & ~improving)
    m, g = x[:, :N].copy(), x[:, N:].copy()
    # the final model's sensitivities, for the depth of investigation (and the posterior)
    if info:
        pred, J, Jx = FJ(m, g)
    else:
        pred, J = F(m, jac=True, gg=g if K else None)
    chi = np.sqrt((((pred - dd) * w) ** 2).sum(1) / nd)
    out_info = None
    if info:
        JW = Jx * w[:, :, None]
        A = np.einsum("sdi,sdj->sij", JW, JW)
        if beta is None:  # no iteration ran
            beta = np.maximum(10.0 * np.trace(A[:, :N, :N], axis1=1, axis2=2) / np.trace(Rs, axis1=1, axis2=2), 1e-12)
        H = A + beta[:, None, None] * Rb + q[:, :, None] * np.eye(P)[None, :, :]
        try:
            C = np.linalg.inv(H)
            var = np.diagonal(C, axis1=1, axis2=2).copy()
        except np.linalg.LinAlgError:
            var = np.full((S, P), np.nan)
            for i in range(S):
                try:
                    var[i] = np.diag(np.linalg.inv(H[i]))
                except np.linalg.LinAlgError:
                    pass
        psd = np.sqrt(np.where(var > 0, var, np.nan))
        out_info = {"sd": psd[:, :N], "g": {name: g[:, k] for k, name in enumerate(keys)},
                    "gsd": {name: psd[:, N + k] for k, name in enumerate(keys)}, "beta": beta}
    if logd:
        pred = np.exp(pred)  # back to mS/m for the caller
        J = J * pred[:, :, None]  # and the Jacobian with it (the depth of investigation weighs it by w, so in log terms again below)
        J = J / np.maximum(pred, 1e-9)[:, :, None]
    bad = ~ok.any(1)
    m[bad] = np.nan
    chi[bad] = np.nan
    if info:
        out_info["sd"][bad] = np.nan
        for name in keys:
            out_info["g"][name][bad] = np.nan
            out_info["gsd"][name][bad] = np.nan
        return m, chi, pred, J, w, out_info
    return m, chi, pred, J, w


def depth_of_investigation(J, w, thick, frac=0.9):
    """(S, D, N) Jacobian -> (S,) the depth above which `frac` of the error-weighted sensitivity of the column lies (the
    half-space counted as one cell): an approximation of the depth the data constrain, not Christiansen & Auken's (2012)
    calibrated DOI."""
    s = np.abs(J * w[:, :, None]).sum(1)  # (S, N)
    tot = s.sum(1, keepdims=True)
    c = np.cumsum(s, 1) / np.where(tot > 0, tot, 1.0)
    tops = np.concatenate([[0.0], np.cumsum(thick)])
    out = np.full(len(s), np.nan)
    for i in range(len(s)):
        if tot[i, 0] <= 0:
            continue
        k = int(np.searchsorted(c[i], frac))
        if k >= len(thick):
            out[i] = tops[-1]
            continue
        c0 = c[i, k - 1] if k > 0 else 0.0
        out[i] = tops[k] + (frac - c0) / max(1e-12, c[i, k] - c0) * thick[k]
    return out


def neighbour_mean(m, line, x, y, window, gap):
    """the mean of each sounding's neighbours' models (itself left out), within `window` soundings on the same line with no
    jump over `gap` metres between consecutive soundings; NaN where it has none"""
    S, N = m.shape
    out = np.full((S, N), np.nan)
    seg = np.zeros(S, int)
    for i in range(1, S):
        seg[i] = seg[i - 1] + (line[i] != line[i - 1] or math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]) > gap)
    for i in range(S):
        lo, hi = max(0, i - window), min(S, i + window + 1)
        idx = [k for k in range(lo, hi) if k != i and seg[k] == seg[i] and np.isfinite(m[k, 0])]
        if idx:
            out[i] = m[idx].mean(0)
    return out


def run_job(req, progress):
    """req: coils [{geom, sep, freq}], height, kind ('eca' | 'ppm'), data (n rows of D, None = missing), errRel, errAbs,
    layers {n, first, bottom}, lateral (0 = none), window, gapM, maxIter, line, x, y."""
    t0 = time.time()
    coils, kind, height = req["coils"], req["kind"], float(req["height"])
    sv = Survey(coils, height, kind)
    data = np.array([[np.nan if v is None else float(v) for v in row] for row in req["data"]], float)
    rel, ab = float(req.get("errRel", 0.1)), float(req.get("errAbs", 0.5))
    lay = req.get("layers") or {}
    thick = layer_thicknesses(int(lay.get("n", 20)), float(lay.get("first", 0.2)), float(lay.get("bottom", 15.0)))
    lateral = float(req.get("lateral", 0.0))
    max_iter = int(req.get("maxIter", 15))
    S = len(data)
    line = req.get("line") or [0] * S
    x = np.asarray(req.get("x") or [0.0] * S, float)
    y = np.asarray(req.get("y") or [0.0] * S, float)
    sd = rel * np.abs(data) + ab
    passes = 2 if lateral > 0 else 1
    m = np.full((S, len(thick) + 1), np.nan)
    chi = np.full(S, np.nan)
    pred = np.full_like(data, np.nan)
    doi = np.full(S, np.nan)
    for p in range(passes):
        ref = None if p == 0 else neighbour_mean(m, line, x, y, int(req.get("window", 3)), float(req.get("gapM", 25.0)))
        for c0 in range(0, S, CHUNK):
            c1 = min(S, c0 + CHUNK)
            mr = None if ref is None else ref[c0:c1]
            alpha = ALPHA if ref is None else np.where(np.isfinite(mr[:, 0]), max(lateral, ALPHA), ALPHA)
            mm, cc, pp, JJ, ww = invert_batch(sv, data[c0:c1], sd[c0:c1], thick, m_ref=mr, alpha=alpha, max_iter=max_iter)
            m[c0:c1], chi[c0:c1], pred[c0:c1] = mm, cc, pp
            doi[c0:c1] = depth_of_investigation(JJ, ww, thick, float(req.get("doiFrac", DOI_FRAC)))
            done = p * S + c1
            el = time.time() - t0
            progress({"stage": "inverting", "message": (f"Pass {p + 1} of {passes}: " if passes > 1 else "") + f"sounding {c1:,} of {S:,}…",
                      "iter": done, "maxIter": passes * S, "etaS": round(el / done * (passes * S - done))})
    nan = lambda a: [None if not np.isfinite(v) else round(float(v), 5) for v in np.ravel(a)]
    pred[~np.isfinite(data)] = np.nan
    return {
        "thick": [round(float(t), 4) for t in thick],
        "condMs": [nan(1000.0 * 10.0 ** row) for row in m],  # mS/m per layer
        "chi": nan(chi), "doi": nan(doi),
        "pred": [nan(row) for row in pred],
        "seconds": round(time.time() - t0, 1),
    }
