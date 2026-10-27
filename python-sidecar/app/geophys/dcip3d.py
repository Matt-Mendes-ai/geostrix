"""TASKS.csv #643 — true 3D DC resistivity and IP inversion of several survey lines together (SimPEG, octree mesh).

Matt (2026-10-17): "Is it possible to make a true 3d inversion?" The 2D route (#322: each line alone, 2.5D, then the
#640 merge between lines) assumes the ground does not change across each line and cannot use readings between lines.
This inverts every reading of every line in ONE 3D model, so cross lines and 3D structure are used as they are.

Input (built by the app from the saved lines, src/lib/dcip3d.js):
  readings  [[ax, ay, az, bx, by, bz, mx, my, mz, nx, ny, nz]] world metres; b* / n* null = a pole (at infinity)
  chain     [[a, b, m, n]] the same electrodes as distances along their line (null = pole), for the flat-ground
            geometric factor the file's apparent resistivities were computed with (#580)
  rho, chargeability (mV/V, optional), uncertainty {percent, floor, floorPerReadingPercent?},
            ipUncertainty {percent, floor, floorPerReadingMvV?} (per-reading floors from the files' error columns, null =
            none for that reading, as the 2D inversion takes them: TASKS.csv #683 / #929)
  topo      [[x, y, z]] ground points (station elevations, terrain samples)
  mesh      {core (m), depth (m below the electrodes where core-sized cells stop)}, maxIter, geometricFactor "flat" | "draped"
Method, as prototyped in #643 and as the 2D inversion does it:
  * TreeMesh: core x core x core/2 cells at the electrodes, 2x core cells to `depth` under every line, the surface
    refined, ~2 km padding; cells above the ground inactive (air);
  * DC: Simulation3DNodal on log conductivity, smooth L2 regularisation, reference / start = the median apparent
    resistivity, beta cooling to chi = 1 (#536: the iterate that fits to the stated uncertainty is returned);
    sensitivity weights (#771); the stored sensitivity matrix (storeJ) so each Gauss-Newton step reuses it;
  * IP (with chargeability): Simulation3DNodal for eta on the recovered conductivity, bounded 0..1 V/V;
  * support = the uncertainty-weighted sensitivity per cell, normalised (#505).
Reciprocity (the main cost saving): SimPEG's own 3D nodal simulation solves once per current position for the data
and once per READING for the sensitivities, with Python work per source on top (Woodjam, 6 lines, 2,249 readings: no
first Gauss-Newton step after 20+ minutes on a laptop with SciPy). The DC system matrix is symmetric and does not depend
on the source (SimPEG's Robin boundary uses a fixed reference point), so the field of a unit current at EVERY
electrode (238 at Woodjam) gives all readings - V(A,B,M,N) = Q_M.E_A - Q_M.E_B - Q_N.E_A + Q_N.E_B - and, with SimPEG's
own getADeriv, every row of the sensitivity matrix: J_i = -(dA/dm u_src)^T (E_M - E_N) / K_i. ReciprocalDC3D does this
and is checked against SimPEG's own dpred / getJ in tests/test_dcip3d.py. IP is then linear in chargeability (Seigel):
eta_a = -sum_j (dln V / dln sigma_j) eta_j, i.e. G = -J / rho_pred on the recovered DC model, inverted as a linear problem.
Solver: SciPy's SuperLU in symmetric mode (the matrix is symmetric; minimum-degree ordering on A + A^T and no pivoting gave
half the fill of the default and a 3.4x faster factorization on the Woodjam mesh). The regularisation Hessian is NOT
factorized as SimPEG does by default (bfgsH0): with SuperLU that alone took over 20 minutes on Woodjam; a Jacobi
preconditioner (UpdatePreconditioner) is used instead, as in 2D.
"""
import time

import numpy as np
from . import fit_target

PAD_M = 2000.0


def solver_name():
    return "superlu-symmetric"


def _solver_class():
    from pymatsolver.solvers import Base
    import scipy.sparse.linalg as sla

    class SymmetricLU(Base):
        def __init__(self, A, **kw):
            super().__init__(A, **{k: v for k, v in kw.items() if k in ("is_symmetric", "is_positive_definite", "is_hermitian", "check_accuracy", "check_rtol", "check_atol")})
            self._f = sla.splu(self.A.tocsc(), permc_spec="MMD_AT_PLUS_A", diag_pivot_thresh=0.0, options=dict(SymmetricMode=True))

        def _solve_single(self, rhs):
            return self._f.solve(np.asarray(rhs, dtype=np.float64))

        def _solve_multiple(self, rhs):
            return self._f.solve(np.asarray(rhs, dtype=np.float64))
    return SymmetricLU


def _reciprocal_class(dc):
    class ReciprocalDC3D(dc.Simulation3DNodal):
        """SimPEG's 3D nodal DC simulation (same matrix, boundary conditions, maps and derivatives), solved once per
        ELECTRODE instead of once per source and once per reading (see the module header)."""

        def setup_reciprocal(self, elocs, iA, iB, iM, iN, G):
            self._Q = self.mesh.get_interpolation_matrix(elocs, location_type="N").T.tocsr()  # nodes x electrodes
            self._iA, self._iB, self._iM, self._iN, self._G = iA, iB, iM, iN, np.asarray(G, dtype=float)
            groups = {}
            for i, k in enumerate(zip(iA.tolist(), iB.tolist())):
                groups.setdefault(k, []).append(i)
            self._groups = [(a, b, np.asarray(rows)) for (a, b), rows in groups.items()]
            self._E = self._Ekey = self._J = self._Jkey = None

        def _fields_e(self, m):
            if self._E is not None and np.array_equal(self._Ekey, m):
                return self._E
            self.model = m
            Ainv = self.solver(self.getA(), **(self.solver_opts or {}))
            E = Ainv * self._Q.toarray()
            if hasattr(Ainv, "clean"):
                Ainv.clean()
            self._E, self._Ekey, self._J = np.asarray(E), np.array(m, copy=True), None
            return self._E

        def fields(self, m=None, calcJ=True):
            return self._fields_e(self.model if m is None else m)

        def dpred(self, m=None, f=None):
            E = self._fields_e(self.model if m is None else m)
            V = np.asarray(self._Q.T @ E)  # electrode x electrode potentials (symmetric by reciprocity)
            iA, iB, iM, iN = self._iA, self._iB, self._iM, self._iN
            hb, hn = iB >= 0, iN >= 0
            b0, n0 = np.where(hb, iB, 0), np.where(hn, iN, 0)
            v = V[iM, iA] - np.where(hb, V[iM, b0], 0.0) - np.where(hn, V[n0, iA], 0.0) + np.where(hb & hn, V[n0, b0], 0.0)
            return v / self._G

        def getJ(self, m, f=None):
            if self._J is not None and np.array_equal(self._Jkey, m):
                return self._J
            E = self._fields_e(m)
            self.model = m
            J = np.empty((len(self._iA), self.sigmaMap.shape[1]))
            for a, b, rows in self._groups:
                u = E[:, a] - E[:, b] if b >= 0 else E[:, a]
                W = E[:, self._iM[rows]].copy()
                hn = self._iN[rows] >= 0
                if hn.any():
                    W[:, hn] -= E[:, self._iN[rows][hn]]
                J[rows] = -np.asarray(self.getADeriv(u, W, adjoint=True)).T / self._G[rows, None]
            self._J, self._Jkey = J, np.array(m, copy=True)
            return J

        def Jvec(self, m, v, f=None):
            return self.getJ(m) @ v

        def Jtvec(self, m, v, f=None):
            return self.getJ(m).T @ v

        def getJtJdiag(self, m, W=None, f=None):
            J = self.getJ(m)
            w = np.ones(J.shape[0]) if W is None else W.diagonal() ** 2
            return np.einsum("i,ij,ij->j", w, J, J)
    return ReciprocalDC3D


def _linear_class():
    from simpeg import simulation

    class Linear(simulation.LinearSimulation):
        def getJtJdiag(self, m, W=None, f=None):
            w = np.ones(self.G.shape[0]) if W is None else W.diagonal() ** 2
            return np.einsum("i,ij,ij->j", w, self.G, self.G)
    return Linear


def survey_electrodes(survey):
    """Per reading, in the survey's own order: indices of A, B, M, N (-1 = pole) into the unique (draped) electrode
    positions, and the geometric factor the predicted voltages are divided by."""
    pts, G = [], []
    for src in survey.source_list:
        a = np.asarray(src.location_a if hasattr(src, "location_a") else src.location, dtype=float).reshape(3)
        b = np.asarray(src.location_b, dtype=float).reshape(3) if hasattr(src, "location_b") else np.full(3, np.nan)
        for rx in src.receiver_list:
            if hasattr(rx, "locations_m"):
                mm, nn = np.asarray(rx.locations_m, dtype=float), np.asarray(rx.locations_n, dtype=float)
            else:
                mm = np.asarray(rx.locations, dtype=float).reshape(-1, 3)
                nn = np.full_like(mm, np.nan)
            for k in range(len(mm)):
                pts.append((a, b, mm[k], nn[k]))
            G.append(np.asarray(rx.geometric_factor[src], dtype=float).reshape(-1))
    allp = np.vstack([p for row in pts for p in row if not np.isnan(p[0])])
    elocs, inv = np.unique(np.round(allp, 6), axis=0, return_inverse=True)
    inv = np.asarray(inv).reshape(-1)
    idx = np.full((len(pts), 4), -1)
    k = 0
    for i, row in enumerate(pts):
        for j, p in enumerate(row):
            if not np.isnan(p[0]):
                idx[i, j] = inv[k]
                k += 1
    return elocs, idx[:, 0], idx[:, 1], idx[:, 2], idx[:, 3], np.concatenate(G)


def _electrodes(req):
    r = np.asarray([[np.nan if v is None else v for v in row] for row in req["readings"]], dtype=float).reshape(-1, 12)
    a, b, m, n = r[:, 0:3], r[:, 3:6], r[:, 6:9], r[:, 9:12]
    b = np.where(np.isnan(b), a, b)  # SimPEG's pole convention: B = A, N = M
    n = np.where(np.isnan(n), m, n)
    return a, b, m, n


def build_mesh(req):
    """The octree mesh and its active cells (numpy + discretize only: also used by the plan, in the sidecar process)."""
    import discretize  # noqa: F401
    from discretize.utils import mesh_builder_xyz, refine_tree_xyz, active_from_xyz
    a, b, m, n = _electrodes(req)
    core, depth = float(req["mesh"]["core"]), float(req["mesh"]["depth"])
    elec = np.unique(np.round(np.vstack([a, b, m, n]), 1), axis=0)
    topo = np.asarray(req.get("topo") or [], dtype=float).reshape(-1, 3)
    topo = np.vstack([topo, elec]) if len(topo) else elec
    mesh = mesh_builder_xyz(elec, [core, core, core / 2], depth_core=depth + 200, padding_distance=[[PAD_M, PAD_M], [PAD_M, PAD_M], [PAD_M, 0]], mesh_type="tree")
    mesh = refine_tree_xyz(mesh, topo, octree_levels=[0, 1, 2], method="surface", finalize=False)
    deep = np.vstack([elec + [0, 0, -dz] for dz in np.arange(0, depth + 1, core)])
    mesh = refine_tree_xyz(mesh, deep, octree_levels=[0, 2, 2], method="radial", finalize=False)
    mesh = refine_tree_xyz(mesh, elec, octree_levels=[2, 2], method="radial", finalize=True)
    active = active_from_xyz(mesh, topo)
    return mesh, active, elec, topo


# Seconds per Gauss-Newton iteration ~ K * electrodes * nodes^1.13 (one factorization + one solve per electrode, then the
# sensitivity rows). SuperLU measured in #643 on Matt's 8-core laptop with other work open: Woodjam, 6 lines, 50 m core,
# 238 electrodes, 48,167 nodes: ~40 s per iteration (the 4,326-cell synthetic: ~1 s); all 455 electrodes: ~65 s.
# (#643 prototype: Intel MKL Pardiso factorized ~4x faster, but with reciprocity the standard solver already inverts the
# Woodjam survey in 5-9 minutes, so the 185 MB MKL download is not offered; revisit as an optional add-on if larger
# surveys need it.)
K_SECONDS = {"superlu-symmetric": 8.6e-7}


def plan(req, cap_bytes, ram_budget_bytes=None):
    """ram_budget_bytes (TASKS.csv #972): the peak memory the run may take, else 1.25 x the sensitivity cap + 0.4 GB (the
    potential-field plan's own peak rule at its cap)."""
    mesh, active, elec, _ = build_mesh(req)
    a, b, _, _ = _electrodes(req)
    n_data = len(a)
    n_src = len(np.unique(np.round(np.hstack([a, b]), 1), axis=0))
    n_act = int(active.sum())
    j_bytes = n_data * n_act * 8
    solver = solver_name()
    it = K_SECONDS[solver] * len(elec) * mesh.n_nodes ** 1.13
    max_iter = int(req.get("maxIter", 12))
    ip = req.get("chargeability") is not None
    # Woodjam reached the target in 6 iterations; allow 8 plus up to 2 retried steps (#536). IP is linear on the stored
    # sensitivities: seconds, not iterations' worth of solves
    seconds = it * (min(max_iter, 8) + 2) + 15
    # the sensitivities (and their IP copy), one field per electrode, the factorization (~5.4 kB per node at Woodjam)
    ram = j_bytes * (2 if ip else 1) + 8 * mesh.n_nodes * len(elec) + 5400 * mesh.n_nodes + 0.4e9
    reasons = []
    if j_bytes > cap_bytes:
        reasons.append(f"The sensitivity matrix would need {j_bytes / 1e9:.1f} GB; this computer allows {cap_bytes / 1e9:.1f} GB right now. Use a larger cell or every 2nd current position.")
    # TASKS.csv #972 — the matrix alone was judged, while the run also holds its IP copy, one field per electrode and the
    # factorization: Woodjam's six lines passed at J 0.94 GB with a 2.7 GB peak, the OOM case of #321 on an 8 GB laptop
    budget = ram_budget_bytes if ram_budget_bytes else 1.25 * cap_bytes + 0.4e9
    if not reasons and ram > budget:
        reasons.append(f"The run would need about {ram / 1e9:.1f} GB of memory at its peak; this computer can spare about {budget / 1e9:.1f} GB right now. Use every 2nd current position or a larger cell, or close other programs.")
    return {"ok": not reasons, "reasons": reasons, "cells": int(mesh.n_cells), "active": n_act, "nodes": int(mesh.n_nodes), "readings": n_data, "sources": n_src,
            "electrodes": int(len(elec)), "sensitivityBytes": int(j_bytes), "peakRamBytes": int(ram), "secondsPerIteration": round(it, 1), "seconds": round(seconds),
            "solver": solver, "maxIter": max_iter, "ramBudgetBytes": int(budget)}


def data_std(req, rho, charge, order):
    """TASKS.csv #929 — the standard deviations of the resistivity (ohm.m) and chargeability (V/V, or None) readings, both
    already in the survey's order: percent x |datum| + floor, where each reading's floor is the larger of the typed floor
    and its own error from the file's error column (floorPerReadingPercent / floorPerReadingMvV, in request order), as
    dcip2d.py does it (#683)."""
    # The per-reading floors of the files' own error columns (request order -> survey order):
    # each reading's floor is the larger of the typed floor and its own error
    def _per_reading(arr, name):
        if arr is None:
            return None
        v = np.asarray([np.nan if x is None else x for x in arr], dtype=float)
        if v.shape != (len(order),):
            raise ValueError(f"{name}: one value per reading expected.")
        v = v[order]
        v[~np.isfinite(v)] = 0.0
        return np.clip(v, 0.0, None)

    unc = req["uncertainty"]
    _fl_pct = _per_reading(unc.get("floorPerReadingPercent"), "uncertainty.floorPerReadingPercent")
    _floor = float(unc.get("floor", 0))
    _floor_dc = np.maximum(_floor, _fl_pct / 100.0 * np.abs(rho)) if _fl_pct is not None else _floor
    std = float(unc.get("percent", 0)) / 100.0 * np.abs(rho) + _floor_dc
    if np.any(~np.isfinite(std)) or np.any(std <= 0):
        raise ValueError("Every reading needs a positive uncertainty.")
    if charge is not None:
        iu = req.get("ipUncertainty") or {}
        _ip_fl = _per_reading(iu.get("floorPerReadingMvV"), "ipUncertainty.floorPerReadingMvV")
        _ip_floor = np.maximum(float(iu.get("floor", 0)), _ip_fl) / 1000.0 if _ip_fl is not None else float(iu.get("floor", 0)) / 1000.0
        ip_std = float(iu.get("percent", 0)) / 100.0 * np.abs(charge / 1000.0) + _ip_floor
        if np.any(~np.isfinite(ip_std)) or np.any(ip_std <= 0):
            raise ValueError("Every chargeability reading needs a positive uncertainty (a 0 mV/V reading needs a floor).")
    return std, (ip_std if charge is not None else None)


def run_job(req, progress, cap_bytes=None):
    t0 = time.time()
    progress({"stage": "loading", "message": "Loading SimPEG"})
    import warnings
    from simpeg import maps, data as sdata, data_misfit, regularization, optimization, inverse_problem, inversion, directives
    from simpeg.electromagnetics.static import resistivity as dc
    from simpeg.electromagnetics.static.utils import generate_survey_from_abmn_locations

    progress({"stage": "mesh", "message": "Building the 3D mesh"})
    mesh, active, elec, topo = build_mesh(req)
    n_act = int(active.sum())
    a, b, m, n = _electrodes(req)
    rho = np.asarray(req["rho"], dtype=float)
    charge = np.asarray(req["chargeability"], dtype=float) if req.get("chargeability") is not None else None
    if cap_bytes and len(rho) * n_act * 8 > cap_bytes:
        raise ValueError(f"The sensitivity matrix would need {len(rho) * n_act * 8 / 1e9:.1f} GB; this computer allows {cap_bytes / 1e9:.1f} GB right now. Use a larger cell or every 2nd current position.")

    # #652 — SimPEG groups readings by source; every per-reading vector goes in ITS order, outputs back to the request's
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        _, order = generate_survey_from_abmn_locations(locations_a=a, locations_b=b, locations_m=m, locations_n=n, data_type="apparent_resistivity", output_sorting=True)
    order = np.asarray(order, dtype=int)
    back = np.argsort(order)
    a, b, m, n, rho = a[order], b[order], m[order], n[order], rho[order]
    if charge is not None:
        charge = charge[order]
    chain = np.asarray([[np.nan if v is None else v for v in row] for row in req["chain"]], dtype=float)[order] if req.get("chain") is not None else None

    def make_survey(dtype):
        s = generate_survey_from_abmn_locations(locations_a=a, locations_b=b, locations_m=m, locations_n=n, data_type=dtype)
        s.drape_electrodes_on_topography(mesh, active, topo_cell_cutoff="top", shift_horizontal=False)  # unshifted, as in 2D (#322)
        # each receiver's interpolation matrix is built once, not on every forward / sensitivity call (SimPEG's default
        # rebuilds it: on 2 Woodjam lines that was 26 of the 52 s of one Gauss-Newton iteration, 2,349 rebuilds)
        for src in s.source_list:
            for rx in src.receiver_list:
                rx.storeProjections = True
        return s
    survey = make_survey("apparent_resistivity")
    survey.set_geometric_factor()
    gf_mode = req.get("geometricFactor") or "flat"
    if gf_mode == "flat" and chain is not None:
        # #580 — K from the nominal along-line spacings on flat ground, as the receiver computed the file's rho_a
        def inv_d(p, q):
            d = np.abs(p - q)
            return np.where(np.isnan(d), 0.0, 1.0 / np.where(d > 0, d, np.nan))
        ca, cb, cm, cn = chain[:, 0], chain[:, 1], chain[:, 2], chain[:, 3]
        g = (inv_d(ca, cm) - inv_d(ca, cn) - inv_d(cb, cm) + inv_d(cb, cn)) / (2 * np.pi)
        g = np.nan_to_num(g)
        if np.any(np.abs(g) <= 0):
            raise ValueError("Some readings have coincident electrodes along their line: no geometric factor.")
        slices = survey.get_all_slices()
        for src in survey.source_list:
            for rx in src.receiver_list:
                rx._geometric_factor[src] = g[slices[src, rx]]

    std, ip_std = data_std(req, rho, charge, order)
    n_src = len(survey.source_list)
    progress({"stage": "mesh", "message": f"Mesh {mesh.n_cells:,} cells ({n_act:,} below ground), {len(rho):,} readings from {n_src} current positions"})

    Slv = _solver_class()
    cmap = maps.InjectActiveCells(mesh, active, 1e-8) * maps.ExpMap(nP=n_act)
    m0 = np.full(n_act, np.log(1.0 / np.median(rho)))
    sim = _reciprocal_class(dc)(mesh, survey=survey, sigmaMap=cmap, solver=Slv)
    sim.setup_reciprocal(*survey_electrodes(survey))
    dc_data = sdata.Data(survey, dobs=rho, standard_deviation=std)
    max_iter = int(req.get("maxIter", 12))

    def inv_run(dmis, reg, opt, m_start, label, target, phi_fn=None, opt_factory=None):
        history = []
        track = fit_target.Track(target)

        class Progress(directives.InversionDirective):
            def endIter(self):
                h = {"iter": int(self.opt.iter), "beta": float(self.invProb.beta), "phi_d": float(self.invProb.phi_d), "phi_m": float(self.invProb.phi_m), "seconds": round(time.time() - t0, 1)}
                history.append(h)
                progress({"stage": label, "iter": h["iter"], "maxIter": max_iter, "phi_d": h["phi_d"], "target": target})

        prob = inverse_problem.BaseInvProblem(dmis, reg, opt)
        prob.init_bfgs = False  # no factorization of the regularisation Hessian (see the header)
        dirs = [directives.UpdateSensitivityWeights(every_iteration=False, threshold_value=1e-2), directives.BetaEstimate_ByEig(beta0_ratio=100.0, random_seed=1, n_pw_iter=2),
                fit_target.track_directive(directives, track), directives.BetaSchedule(coolingFactor=2.0, coolingRate=1),
                directives.TargetMisfit(chifact=1.0), directives.UpdatePreconditioner(), Progress()]
        mm = inversion.BaseInversion(prob, directiveList=dirs).run(m_start)

        # #536 — when the last step jumped from above the target to below the band, retry it at a beta in between
        def refine(m0_, beta):
            p = inverse_problem.BaseInvProblem(dmis, reg, opt_factory())
            p.init_bfgs = False
            p.beta = beta
            m1 = inversion.BaseInversion(p, directiveList=[directives.UpdatePreconditioner()]).run(m0_)
            return m1, phi_fn(m1)
        choice = fit_target.choose(track, refine if (phi_fn and opt_factory) else None)
        # 3D: one Gauss-Newton step from the previous model fits almost as well at the previous beta as at the last
        # one (the IP synthetic: 0.61-0.69 x the target across that whole range), so the bisection can stay below the
        # band; then bracket the band from above (2, 4, 8 x the previous beta) and bisect, as single steps from the
        # previous model, at most 5 more steps. An overshoot on the FIRST iteration (Woodjam IP: 0.26 x the target) has
        # no previous model: the step is retried from the starting model, from 2 x its beta up.
        if choice and choice.get("how") == "last" and choice.get("overshot") and phi_fn and opt_factory and track.cur is not None:
            lo, hi = fit_target.BAND
            base_m = track.prev[3] if track.prev is not None else m_start
            choice.setdefault("tried", [])
            b_lo = max([t["beta"] for t in choice["tried"]] + [track.prev[2] if track.prev is not None else track.cur[2]])
            b_hi = None
            for _ in range(5):
                b = b_lo * 2.0 if b_hi is None else float(np.sqrt(b_lo * b_hi))
                m1, phi = refine(base_m, b)
                choice["tried"].append({"beta": b, "phi": float(phi)})
                if lo * target <= phi <= hi * target:
                    choice.update(model=m1, phi=float(phi), how="refined", beta=b, iteration=(track.prev[0] + 1) if track.prev is not None else 1)
                    break
                if phi > hi * target:
                    b_hi = b
                else:
                    b_lo = b
        return (choice["model"] if choice else mm), history, fit_target.fit_report(choice)

    progress({"stage": "dc", "iter": 0, "maxIter": max_iter, "message": "Inverting resistivity in 3D"})
    reg = regularization.WeightedLeastSquares(mesh, active_cells=active, reference_model=m0)
    opt = optimization.ProjectedGNCG(maxIter=max_iter, lower=np.log(1e-5), upper=np.log(1e2), cg_maxiter=10, cg_atol=1e-3, cg_rtol=0.0)
    m_dc, hist_dc, fit_dc = inv_run(data_misfit.L2DataMisfit(data=dc_data, simulation=sim), reg, opt, m0, "dc", float(len(rho)),
                                    phi_fn=lambda mm: float(np.sum(((rho - sim.dpred(mm)) / std) ** 2)),
                                    opt_factory=lambda: optimization.ProjectedGNCG(maxIter=1, lower=np.log(1e-5), upper=np.log(1e2), cg_maxiter=10, cg_atol=1e-3, cg_rtol=0.0))
    pred = sim.dpred(m_dc)
    phi_d = float(np.sum(((rho - pred) / std) ** 2))
    J = sim.getJ(m_dc)
    sens = np.sqrt(np.einsum("ij,ij->j", J / std[:, None], J / std[:, None]))
    sens = sens / sens.max() if sens.max() > 0 else sens

    out_ip = None
    if charge is not None:
        progress({"stage": "ip", "iter": 0, "maxIter": max_iter, "message": "Inverting chargeability in 3D"})
        eta_obs = charge / 1000.0
        ip_sim = _linear_class()(G=-J / pred[:, None], model_map=maps.IdentityMap(nP=n_act))  # Seigel, see the header
        ip_data = sdata.Data(ip_sim.survey, dobs=eta_obs, standard_deviation=ip_std)
        ip_reg = regularization.WeightedLeastSquares(mesh, active_cells=active, mapping=maps.IdentityMap(nP=n_act))
        ip_opt = optimization.ProjectedGNCG(maxIter=max_iter, lower=0.0, upper=1.0, cg_maxiter=10, cg_atol=1e-3, cg_rtol=0.0)
        m_ip, hist_ip, fit_ip = inv_run(data_misfit.L2DataMisfit(data=ip_data, simulation=ip_sim), ip_reg, ip_opt, np.full(n_act, 1e-3), "ip", float(len(eta_obs)),
                                        phi_fn=lambda mm: float(np.sum(((eta_obs - ip_sim.dpred(mm)) / ip_std) ** 2)),
                                        opt_factory=lambda: optimization.ProjectedGNCG(maxIter=1, lower=0.0, upper=1.0, cg_maxiter=10, cg_atol=1e-3, cg_rtol=0.0))
        ip_pred = ip_sim.dpred(m_ip)
        ip_phi = float(np.sum(((eta_obs - ip_pred) / ip_std) ** 2))
        out_ip = {"model": m_ip, "predicted": (ip_pred[back] * 1000).tolist(), "phi_d": ip_phi, "reachedTarget": ip_phi <= 1.05 * len(eta_obs), "iterations": len(hist_ip),
                  "history": hist_ip, "standardDeviation": (ip_std[back] * 1000).tolist(), "fitChoice": fit_ip}

    # cells: below ground, within 300 m of the electrodes' footprint and down to depth + 300 m below the lowest electrode
    cc = mesh.cell_centers[active]
    hh = mesh.h_gridded[active]
    lo, hi = elec.min(axis=0), elec.max(axis=0)
    depth = float(req["mesh"]["depth"])
    keep = (cc[:, 0] > lo[0] - 300) & (cc[:, 0] < hi[0] + 300) & (cc[:, 1] > lo[1] - 300) & (cc[:, 1] < hi[1] + 300) & (cc[:, 2] > lo[2] - depth - 300)
    f32 = lambda v: np.asarray(v, dtype=np.float32).astype(float).tolist()
    result = {
        "kind": "dcip3d",
        "cells": {"x": np.round(cc[keep, 0], 2).tolist(), "y": np.round(cc[keep, 1], 2).tolist(), "z": np.round(cc[keep, 2], 2).tolist(),
                  "dx": np.round(hh[keep, 0], 2).tolist(), "dy": np.round(hh[keep, 1], 2).tolist(), "dz": np.round(hh[keep, 2], 2).tolist(),
                  "resistivity": f32(1.0 / np.exp(m_dc[keep])), "support": np.round(sens[keep], 4).tolist(),
                  **({"chargeability": f32(out_ip["model"][keep] * 1000)} if out_ip else {})},
        "predicted": pred[back].tolist(), "standardDeviation": std[back].tolist(), "phi_d": phi_d, "target": float(len(rho)),
        "reachedTarget": phi_d <= 1.05 * len(rho), "history": hist_dc, "iterations": len(hist_dc), "fitChoice": fit_dc,
        "ip": ({k: v for k, v in out_ip.items() if k != "model"} if out_ip else None),
        "mesh": {"cells": int(mesh.n_cells), "nActive": n_act, "core": float(req["mesh"]["core"]), "depth": depth, "kept": int(keep.sum()), "sources": n_src},
        "geometricFactor": gf_mode, "solver": solver_name(), "seconds": time.time() - t0,
    }
    import simpeg
    import discretize
    result["versions"] = {"simpeg": simpeg.__version__, "discretize": discretize.__version__}
    return result
