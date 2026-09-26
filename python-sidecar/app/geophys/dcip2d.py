"""TASKS.csv #322 — 2D DC resistivity and induced-polarisation (IP) inversion of one survey line with SimPEG.

Input: readings as electrode positions ALONG THE LINE (metres from the line start) — A, B, M, N; a missing B
or N is a pole electrode (at infinity; SimPEG's convention is B = A, N = M) — with apparent resistivity
(ohm.m) and optionally apparent chargeability (mV/V); an elevation profile along the line (distance,
elevation) to put the electrodes on the ground and mark the air; uncertainties stated by the caller.

Method (SimPEG 0.25 static.resistivity / induced_polarization, the standard 2.5D approach):
  * 2D TensorMesh: core cells of `cell` m across the electrode spread down to `depth`, 8 padding cells on
    the sides and bottom growing x1.3; cells above the topography profile are inactive (air);
  * electrodes draped on the surface of the active cells;
  * DC: Simulation2DNodal on log-conductivity (ExpMap), data = apparent resistivity, smooth L2
    regularisation, reference / starting model = the median apparent resistivity, beta cooling to the
    target misfit (chi = 1);
  * IP (when chargeability is given): Simulation2DNodal for eta on the RECOVERED DC conductivity, data =
    apparent chargeability (V/V inside, mV/V outside), bounded 0..1 V/V.
Output: core, active cells (distance along the line, elevation, sizes) with resistivity, chargeability and a
normalised sensitivity ("data support", the depth-of-investigation proxy — deep cells the data barely see
say more about the regularisation than the ground), predicted data and misfit history.
"""
import time

import numpy as np


def _mesh(stations_s, topo_sz, cell, depth, pad=8, factor=1.3):
    import discretize
    s0, s1 = float(np.min(stations_s)), float(np.max(stations_s))
    nx = int(np.ceil((s1 - s0) / cell)) + 4
    dz = cell / 2.0
    zmax = float(np.max(topo_sz[:, 1]))
    zmin_core = float(np.min(topo_sz[:, 1])) - depth
    nz = int(np.ceil((zmax - zmin_core) / dz)) + 1
    padw = [cell * factor ** (i + 1) for i in range(pad)]
    padz = [dz * factor ** (i + 1) for i in range(pad)]
    hx = [(w,) for w in padw[::-1]] + [(cell, nx)] + [(w,) for w in padw]
    hz = [(w,) for w in padz[::-1]] + [(dz, nz)]
    hx = np.concatenate([np.full(t[1], t[0]) if len(t) == 2 else np.array([t[0]]) for t in hx])
    hz = np.concatenate([np.full(t[1], t[0]) if len(t) == 2 else np.array([t[0]]) for t in hz])
    x0 = s0 - 2 * cell - float(np.sum(padw))
    # The mesh's top NODE is the highest ground point. Electrodes then sit on nodes (the nodal formulation's
    # own unknowns): measured on uniform 100 ohm.m ground with 5 m cells / 10 m electrodes, a top node half a
    # cell above the ground gave apparent resistivities up to 47 % wrong (95th percentile), on the node <= 3 %.
    z0 = zmax - float(np.sum(hz))
    mesh = discretize.TensorMesh([hx, hz], origin=[x0, z0])
    core = (mesh.cell_centers[:, 0] >= s0 - 2 * cell) & (mesh.cell_centers[:, 0] <= s0 - 2 * cell + nx * cell) \
        & (mesh.cell_centers[:, 1] >= zmin_core)
    return mesh, core


def _survey(ab_mn, locs, data_type):
    from simpeg.electromagnetics.static.utils import generate_survey_from_abmn_locations
    a, b, m, n = (locs[ab_mn[:, k]] for k in range(4))
    return generate_survey_from_abmn_locations(locations_a=a, locations_b=b, locations_m=m, locations_n=n, data_type=data_type)


def run_job(req, progress):
    t0 = time.time()
    progress({"stage": "loading", "message": "Loading SimPEG"})
    from discretize.utils import active_from_xyz
    from simpeg import maps, data as sdata, data_misfit, regularization, optimization, inverse_problem, inversion, directives
    from simpeg.electromagnetics.static import resistivity as dc, induced_polarization as ip

    readings = np.asarray([[np.nan if v is None else v for v in row] for row in req["readings"]], dtype=float)  # a pole = NaN
    rho = np.asarray(req["rho"], dtype=float)
    charge = np.asarray(req["chargeability"], dtype=float) if req.get("chargeability") is not None else None
    topo = np.asarray(req.get("topo") or [], dtype=float).reshape(-1, 2)
    cell = float(req["mesh"]["cell"])
    depth = float(req["mesh"]["depth"])

    # unique electrode positions; a pole (NaN) is the same position as its partner (SimPEG: B = A, N = M)
    abmn = readings.copy()
    abmn[:, 1] = np.where(np.isnan(abmn[:, 1]), abmn[:, 0], abmn[:, 1])
    abmn[:, 3] = np.where(np.isnan(abmn[:, 3]), abmn[:, 2], abmn[:, 3])
    pos = np.unique(np.round(abmn.ravel(), 6))
    if not len(topo):
        topo = np.c_[[pos.min() - 1e4, pos.max() + 1e4], [0.0, 0.0]]
    topo = topo[np.argsort(topo[:, 0])]
    z_at = np.interp(pos, topo[:, 0], topo[:, 1])
    locs = np.c_[pos, z_at]
    idx = np.searchsorted(pos, np.round(abmn, 6))

    mesh, core = _mesh(pos, topo, cell, depth)
    # topography as (x, z) points sampled across the whole mesh width (flat extension beyond the profile)
    tx = np.linspace(mesh.nodes_x[0], mesh.nodes_x[-1], max(200, mesh.shape_cells[0] * 2))
    active = active_from_xyz(mesh, np.c_[tx, np.interp(tx, topo[:, 0], topo[:, 1])])
    n_act = int(active.sum())
    progress({"stage": "mesh", "message": f"Mesh {mesh.shape_cells[0]} x {mesh.shape_cells[1]}, {n_act} cells below ground, {len(rho)} readings"})

    # shift_horizontal=False: the default moves every electrode to the nearest cell centre (2.5 m with 5 m
    # cells) and short-offset readings came out up to 140 % wrong on uniform ground; unshifted <= 2 %.
    survey = _survey(idx, locs, "apparent_resistivity")
    survey.drape_electrodes_on_topography(mesh, active, topo_cell_cutoff="top", shift_horizontal=False)
    survey.set_geometric_factor()

    unc = req["uncertainty"]
    std = float(unc["percent"]) / 100.0 * np.abs(rho) + float(unc.get("floor", 0))
    if np.any(~np.isfinite(std)) or np.any(std <= 0):
        raise ValueError("Every reading needs a positive uncertainty.")
    dc_data = sdata.Data(survey, dobs=rho, standard_deviation=std)

    # ExpMap acts FIRST (maps compose right to left), so the air value is a conductivity, not a log: 1e-8 S/m.
    # (Passing log(1e-8) here made the air -18 S/m and every prediction negative.)
    cmap = maps.InjectActiveCells(mesh, active, 1e-8) * maps.ExpMap(nP=n_act)
    m0 = np.full(n_act, np.log(1.0 / np.median(rho)))
    sim = dc.Simulation2DNodal(mesh, survey=survey, sigmaMap=cmap, storeJ=True)
    max_iter = int(req.get("maxIter", 20))

    def inv_run(dmis, reg, opt, m_start, label, target):
        history = []

        class Progress(directives.InversionDirective):
            def endIter(self):
                h = {"iter": int(self.opt.iter), "beta": float(self.invProb.beta), "phi_d": float(self.invProb.phi_d), "phi_m": float(self.invProb.phi_m)}
                history.append(h)
                progress({"stage": label, "iter": h["iter"], "maxIter": max_iter, "phi_d": h["phi_d"], "target": target})

        prob = inverse_problem.BaseInvProblem(dmis, reg, opt)
        dirs = [directives.UpdateSensitivityWeights(), directives.BetaEstimate_ByEig(beta0_ratio=1.0, random_seed=1),
                directives.BetaSchedule(coolingFactor=2.0, coolingRate=1), directives.TargetMisfit(chifact=1.0),
                directives.UpdatePreconditioner(), Progress()]
        return inversion.BaseInversion(prob, directiveList=dirs).run(m_start), history

    progress({"stage": "dc", "iter": 0, "maxIter": max_iter, "message": "Inverting resistivity"})
    reg = regularization.WeightedLeastSquares(mesh, active_cells=active, reference_model=m0)
    # Bounded log-conductivity (0.01 - 100,000 ohm.m): an unbounded Gauss-Newton step can drive a cell to an
    # absurd conductivity during the line search and make the forward matrix singular ("Factor is exactly
    # singular" — hit on the synthetic test before these bounds). Real rocks are well inside them.
    opt = optimization.ProjectedGNCG(maxIter=max_iter, lower=np.log(1e-5), upper=np.log(1e2), cg_maxiter=30)
    m_dc, hist_dc = inv_run(data_misfit.L2DataMisfit(data=dc_data, simulation=sim), reg, opt, m0, "dc", float(len(rho)))
    pred = sim.dpred(m_dc)
    phi_d = float(np.sum(((rho - pred) / std) ** 2))
    J = sim.getJ(m_dc)
    sens = np.sqrt(np.einsum("ij,ij->j", J, J))
    sens = sens / sens.max() if sens.max() > 0 else sens

    out_ip = None
    if charge is not None:
        progress({"stage": "ip", "iter": 0, "maxIter": max_iter, "message": "Inverting chargeability"})
        eta_obs = charge / 1000.0  # mV/V -> V/V
        ip_survey = _survey(idx, locs, "apparent_chargeability")
        ip_survey.drape_electrodes_on_topography(mesh, active, topo_cell_cutoff="top", shift_horizontal=False)
        ip_unc = req.get("ipUncertainty") or {}
        ip_std = float(ip_unc.get("percent", 5)) / 100.0 * np.abs(eta_obs) + float(ip_unc.get("floor", 1.0)) / 1000.0
        ip_data = sdata.Data(ip_survey, dobs=eta_obs, standard_deviation=ip_std)
        eta_map = maps.InjectActiveCells(mesh, active, 0.0)
        ip_sim = ip.Simulation2DNodal(mesh, survey=ip_survey, etaMap=eta_map, sigma=cmap * m_dc, storeJ=True)
        ip_reg = regularization.WeightedLeastSquares(mesh, active_cells=active, mapping=maps.IdentityMap(nP=n_act))
        ip_opt = optimization.ProjectedGNCG(maxIter=max_iter, lower=0.0, upper=1.0, cg_maxiter=30)
        m_ip, hist_ip = inv_run(data_misfit.L2DataMisfit(data=ip_data, simulation=ip_sim), ip_reg, ip_opt, np.full(n_act, 1e-3), "ip", float(len(eta_obs)))
        ip_pred = ip_sim.dpred(m_ip)
        out_ip = {"model": m_ip, "predicted": (ip_pred * 1000).tolist(), "phi_d": float(np.sum(((eta_obs - ip_pred) / ip_std) ** 2)),
                  "history": hist_ip, "standardDeviation": (ip_std * 1000).tolist()}

    keep_full = core & np.isin(np.arange(mesh.n_cells), np.flatnonzero(active))
    act_index = np.full(mesh.n_cells, -1)
    act_index[np.flatnonzero(active)] = np.arange(n_act)
    ai = act_index[keep_full]
    cc = mesh.cell_centers[keep_full]
    ii, jj = np.unravel_index(np.flatnonzero(keep_full), mesh.shape_cells, order="F")
    f32 = lambda a: np.asarray(a, dtype=np.float32).astype(float).tolist()
    result = {
        "kind": "dcip2d",
        "cells": {"s": np.round(cc[:, 0], 3).tolist(), "z": np.round(cc[:, 1], 3).tolist(),
                  "ds": np.round(mesh.h[0][ii], 3).tolist(), "dz": np.round(mesh.h[1][jj], 3).tolist(),
                  "resistivity": f32(1.0 / np.exp(m_dc[ai])), "support": np.round(sens[ai], 4).tolist(),
                  **({"chargeability": f32(out_ip["model"][ai] * 1000)} if out_ip else {})},
        "electrodes": np.round(survey.unique_electrode_locations, 3).tolist(),
        "predicted": pred.tolist(), "standardDeviation": std.tolist(), "phi_d": phi_d, "target": float(len(rho)),
        "reachedTarget": phi_d <= 1.05 * len(rho), "history": hist_dc, "iterations": len(hist_dc),
        "ip": ({k: v for k, v in out_ip.items() if k != "model"} if out_ip else None),
        "mesh": {"shape": list(mesh.shape_cells), "cell": cell, "depth": depth, "nActive": n_act, "nCore": int(keep_full.sum())},
        "seconds": time.time() - t0,
    }
    import simpeg, discretize
    result["versions"] = {"simpeg": simpeg.__version__, "discretize": discretize.__version__}
    return result
