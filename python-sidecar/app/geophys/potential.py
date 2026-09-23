"""TASKS.csv #321 — magnetic (TMI) and gravity (gz) forward modelling and smooth inversion with SimPEG.

Scope decided by the #321 specialist panel (geophysicist, exploration geologist, QP, Leapfrog, Micromine,
GIS, structural, database, performance, security, software design, UX, visual design):
  * potential fields only (mag TMI scalar susceptibility, gravity gz density contrast) — no DC/IP/EM/MT,
    no MVI, no sparse/IRLS, no joint inversion in v1;
  * TENSOR mesh (maps 1:1 onto GeoStrix's existing UBC tensor voxel path; OcTree is not displayable yet);
  * integral-equation simulation with the choclo engine; the dense sensitivity matrix is float32
    (SimPEG 0.25.2's default sensitivity_dtype, checked in potential_fields/base.py) and its size is
    checked by `plan()` BEFORE anything is allocated;
  * every physical parameter (inducing field, units, uncertainties, sensor height meaning) comes from the
    caller — nothing here defaults them.

Pure functions, no FastAPI; `run_job` is what the job child process calls.

Coordinates: callers send project-CRS metres (easting, northing, elevation). A round local origin is
subtracted before meshing (float64 is fine at UTM magnitudes, but it keeps UBC-style numbers readable and
removes any float32 risk in downstream code) and recorded in the result so the renderer can add it back.
"""
import math
import time

import numpy as np

SENS_BYTES = 4  # float32 — SimPEG 0.25.2 potential_fields sensitivity_dtype default


# GRAVITY SIGN CONVENTION — measured, not assumed (tests/test_potential.py): SimPEG's gz is positive
# UPWARD, so a body DENSER than its surroundings gives NEGATIVE gz (the forward kernel matched a closed-form
# point mass to 0.005% with that sign). Exploration gravity data (Bouguer/residual anomalies from any
# contractor or Oasis montaj) use the opposite convention: positive over excess mass. Feeding user data in
# unchanged would invert every density contrast's sign. So user-facing gravity values are negated on the
# way in and on the way out, and everything the renderer sees is in the user's convention: positive mGal
# over dense bodies, positive recovered contrast for dense rock. Magnetics needs no conversion.
def _to_sim(method, arr):
    arr = np.asarray(arr, dtype=float)
    return -arr if method == "grav" else arr


def _to_user(method, arr):
    arr = np.asarray(arr, dtype=float)
    return -arr if method == "grav" else arr


# ---------------------------------------------------------------------------------------------
# Mesh
# ---------------------------------------------------------------------------------------------

def _pad_widths(cell, n, factor):
    return [cell * factor ** (i + 1) for i in range(n)]


def mesh_spec(stations, core_cell, depth, pad_cells=6, pad_factor=1.3, margin_cells=2, top_z=None):
    """Tensor mesh description (no discretize import needed) — used by plan() and build_mesh().

    Core: the station footprint plus `margin_cells` core cells each side, from `top_z` (at or above the
    highest station/terrain) down to `depth` below the lowest station. Padding: `pad_cells` cells growing
    by `pad_factor` on every side except the top. Returns widths per axis and the mesh origin (x0, y0, z0 =
    BOTTOM of the mesh, discretize's convention)."""
    xs, ys, zs = stations[:, 0], stations[:, 1], stations[:, 2]
    c = float(core_cell)
    x_lo = math.floor((xs.min() - margin_cells * c) / c) * c
    x_hi = math.ceil((xs.max() + margin_cells * c) / c) * c
    y_lo = math.floor((ys.min() - margin_cells * c) / c) * c
    y_hi = math.ceil((ys.max() + margin_cells * c) / c) * c
    # The mesh top follows the TERRAIN, never the stations: a station lying exactly on a cell face or edge
    # is a singular point of the magnetic prism kernel (measured: NaN TMI when stations sat on the top face).
    # Without terrain (forward tool only) the top is put a cell below the lowest station.
    z_top = math.ceil(top_z / c) * c if top_z is not None else math.floor((zs.min() - c) / c) * c
    z_bot = math.floor((zs.min() - depth) / c) * c
    ncx, ncy, ncz = int(round((x_hi - x_lo) / c)), int(round((y_hi - y_lo) / c)), int(round((z_top - z_bot) / c))
    pad = _pad_widths(c, pad_cells, pad_factor)
    hx = pad[::-1] + [c] * ncx + pad
    hy = pad[::-1] + [c] * ncy + pad
    hz = pad[::-1] + [c] * ncz  # no padding above the top
    x0 = x_lo - sum(pad)
    y0 = y_lo - sum(pad)
    z0 = z_bot - sum(pad)
    core = {"x": [x_lo, x_hi], "y": [y_lo, y_hi], "z": [z_bot, z_top],
            "ix": [pad_cells, pad_cells + ncx], "iy": [pad_cells, pad_cells + ncy], "iz": [pad_cells, pad_cells + ncz]}
    return {"hx": hx, "hy": hy, "hz": hz, "x0": x0, "y0": y0, "z0": z0, "core": core,
            "n": [len(hx), len(hy), len(hz)], "nCells": len(hx) * len(hy) * len(hz)}


def build_mesh(spec):
    from discretize import TensorMesh
    return TensorMesh([np.array(spec["hx"]), np.array(spec["hy"]), np.array(spec["hz"])],
                      origin=[spec["x0"], spec["y0"], spec["z0"]])


def active_cells(mesh, topo_xyz):
    """Cells below the terrain. topo_xyz: (N,3) local coordinates of the terrain grid nodes."""
    from discretize.utils import active_from_xyz
    return active_from_xyz(mesh, topo_xyz, grid_reference="CC", method="linear")


def estimate_active_fraction(spec, topo_xyz):
    """Cheap estimate of the active-cell count without building the mesh: the share of each column's
    cells whose centre lies below the terrain elevation interpolated at the column centre (nearest node)."""
    hx, hy, hz = map(np.asarray, (spec["hx"], spec["hy"], spec["hz"]))
    xc = spec["x0"] + np.cumsum(hx) - hx / 2
    yc = spec["y0"] + np.cumsum(hy) - hy / 2
    zc = spec["z0"] + np.cumsum(hz) - hz / 2
    if topo_xyz is None or not len(topo_xyz):
        return len(xc) * len(yc) * len(zc)
    from scipy.spatial import cKDTree
    tree = cKDTree(topo_xyz[:, :2])
    gx, gy = np.meshgrid(xc, yc, indexing="ij")
    _, idx = tree.query(np.c_[gx.ravel(), gy.ravel()])
    ztop = topo_xyz[idx, 2]
    return int(np.sum(zc[None, :] < ztop[:, None]))


# ---------------------------------------------------------------------------------------------
# Planning — sizes and a refusal BEFORE anything heavy is allocated
# ---------------------------------------------------------------------------------------------

def plan(req, ram_cap_bytes):
    stations = np.asarray(req["stations"], dtype=float)
    local = _local_origin(stations)
    st = stations - local
    topo = _topo_local(req, local)
    spec = mesh_spec(st, req["mesh"]["coreCell"], req["mesh"]["depth"], req["mesh"].get("padCells", 6),
                     req["mesh"].get("padFactor", 1.3), req["mesh"].get("marginCells", 2),
                     top_z=topo[:, 2].max() if topo is not None and len(topo) else None)
    n_active = estimate_active_fraction(spec, topo)
    n_data = len(stations)
    kind = req.get("kind", "inversion")
    sens = n_data * n_active * SENS_BYTES if kind == "inversion" else 0
    reasons = []
    if not len(stations):
        reasons.append("No stations.")
    if kind == "inversion" and topo is None:
        reasons.append("A terrain surface is required to decide which cells are below ground.")
    if topo is not None and len(topo) and len(stations):
        from scipy.interpolate import griddata
        tz = griddata(topo[:, :2], topo[:, 2], st[:, :2], method="linear")
        near = np.isfinite(tz)
        clearance = st[near, 2] - tz[near]
        low = int(np.sum(clearance < 1.0))
        outside = int(np.sum(~near))
        if low:
            reasons.append(f"{low} station(s) are less than 1 m above the terrain (or below it). The sensor elevation "
                           "must be above ground — check the height setting, or the station and terrain datums.")
        if outside:
            reasons.append(f"{outside} station(s) lie outside the terrain surface. Load terrain that covers the whole survey.")
    if sens > ram_cap_bytes:
        reasons.append(f"The sensitivity matrix would need ~{sens / 1e9:.2f} GB (data x active cells x 4 bytes); "
                       f"the limit is {ram_cap_bytes / 1e9:.2f} GB. Use a larger core cell or thin the stations.")
    # Measured on an i7-1165G7 / 16 GB (#321 performance review): peak RAM ~= 1.2 x matrix + 250-350 MB;
    # building the matrix ~10 s per GB. Reported so the user sees the cost before committing to it.
    peak = int(1.25 * sens + 0.4e9) if kind == "inversion" else int(0.4e9)
    return {"peakRamEstimateBytes": peak, "buildSecondsEstimate": round(10 * sens / 1e9, 1),
            "nData": n_data, "nCells": spec["nCells"], "nActiveEst": n_active, "meshShape": spec["n"],
            "coreCell": req["mesh"]["coreCell"], "sensitivityBytes": sens, "ramCapBytes": ram_cap_bytes,
            "localOrigin": local.tolist(), "core": spec["core"], "ok": not reasons, "reasons": reasons}


def _local_origin(stations):
    if not len(stations):
        return np.zeros(3)
    return np.array([math.floor(stations[:, 0].min() / 1000) * 1000, math.floor(stations[:, 1].min() / 1000) * 1000, 0.0])


def _topo_local(req, local):
    t = req.get("topo")
    if not t:
        return None
    arr = np.asarray(t, dtype=float)
    return arr - local if len(arr) else None


# ---------------------------------------------------------------------------------------------
# Survey / simulation
# ---------------------------------------------------------------------------------------------

def _survey_and_sim(method, mesh, actv, st_local, field, store):
    from simpeg import maps
    n_act = int(actv.sum())
    ident = maps.IdentityMap(nP=n_act)
    if method == "mag":
        from simpeg.potential_fields import magnetics as mag
        rx = mag.receivers.Point(st_local, components="tmi")
        src = mag.sources.UniformBackgroundField(receiver_list=[rx], amplitude=float(field["strength"]),
                                                 inclination=float(field["inclination"]), declination=float(field["declination"]))
        survey = mag.survey.Survey(src)
        sim = mag.simulation.Simulation3DIntegral(mesh, survey=survey, chiMap=ident, active_cells=actv,
                                                  engine="choclo", store_sensitivities=store)
    elif method == "grav":
        from simpeg.potential_fields import gravity as grav
        rx = grav.receivers.Point(st_local, components="gz")
        src = grav.sources.SourceField(receiver_list=[rx])
        survey = grav.survey.Survey(src)
        sim = grav.simulation.Simulation3DIntegral(mesh, survey=survey, rhoMap=ident, active_cells=actv,
                                                   engine="choclo", store_sensitivities=store)
    else:
        raise ValueError(f"Unknown method {method!r}")
    return survey, sim


# ---------------------------------------------------------------------------------------------
# Plate body (forward "does this body explain the data?" tool)
# ---------------------------------------------------------------------------------------------

def plate_cells(mesh, plate, local):
    """Boolean mask of mesh cells whose centre lies inside a rectangular plate.

    plate: {cx, cy, cz (centre, project metres), strike (deg, the plate's strike azimuth), dip (deg),
    dipDirection (deg — must be strike +/- 90; taken as authoritative), strikeLength, dipExtent, thickness}.
    """
    cc = mesh.cell_centers
    c = np.array([plate["cx"], plate["cy"], plate["cz"]]) - local
    dd = math.radians(plate["dipDirection"])
    dip = math.radians(plate["dip"])
    strike_v = np.array([math.sin(dd - math.pi / 2), math.cos(dd - math.pi / 2), 0.0])
    downdip_v = np.array([math.sin(dd) * math.cos(dip), math.cos(dd) * math.cos(dip), -math.sin(dip)])
    normal_v = np.cross(strike_v, downdip_v)
    d = cc - c
    a = d @ strike_v
    b = d @ downdip_v
    n = d @ normal_v
    return (np.abs(a) <= plate["strikeLength"] / 2) & (np.abs(b) <= plate["dipExtent"] / 2) & (np.abs(n) <= plate["thickness"] / 2)


# ---------------------------------------------------------------------------------------------
# Jobs
# ---------------------------------------------------------------------------------------------

def run_job(req, progress, ram_cap_bytes):
    """Runs a forward or inversion job. `progress(dict)` is called with stage/iteration updates.
    Returns a JSON-serialisable result dict."""
    t0 = time.time()
    progress({"stage": "loading", "message": "Loading SimPEG"})
    import simpeg, discretize  # noqa: F401  (import timing is part of the 'loading' stage)
    from simpeg import data as sdata, data_misfit, regularization, optimization, inverse_problem, inversion, directives, maps

    method = req["method"]
    kind = req.get("kind", "inversion")
    p = plan(req, ram_cap_bytes)
    if not p["ok"]:
        raise ValueError(" ".join(p["reasons"]))
    stations = np.asarray(req["stations"], dtype=float)
    local = np.asarray(p["localOrigin"])
    st = stations - local
    topo = _topo_local(req, local)
    spec = mesh_spec(st, req["mesh"]["coreCell"], req["mesh"]["depth"], req["mesh"].get("padCells", 6),
                     req["mesh"].get("padFactor", 1.3), req["mesh"].get("marginCells", 2),
                     top_z=topo[:, 2].max() if topo is not None else None)
    mesh = build_mesh(spec)
    actv = active_cells(mesh, topo) if topo is not None else np.ones(mesh.n_cells, dtype=bool)
    n_act = int(actv.sum())
    progress({"stage": "mesh", "message": f"Mesh {spec['n'][0]}x{spec['n'][1]}x{spec['n'][2]}, {n_act} active cells"})
    field = req.get("field") or {}
    versions = {"simpeg": simpeg.__version__, "discretize": discretize.__version__}

    if kind == "forward":
        # One or more plates in ONE job (a dip sweep is N plates): each job is a fresh process that pays the
        # SimPEG/numba import once (~9 s measured), so N separate jobs would cost N times that.
        survey, sim = _survey_and_sim(method, mesh, actv, st, field, "forward_only")
        plates = req.get("plates") or [req["plate"]]
        obs = np.asarray(req.get("observed") or [], dtype=float)
        runs = []
        for k, plate in enumerate(plates):
            full = np.zeros(mesh.n_cells)
            mask = plate_cells(mesh, plate, local)
            full[mask] = float(plate["contrast"])
            progress({"stage": "forward", "message": f"Forward model {k + 1} of {len(plates)}", "iter": k + 1, "maxIter": len(plates)})
            pred = _to_user(method, sim.dpred(full[actv]))
            run = {"predicted": pred.tolist(), "plateCells": int(mask[actv].sum()), "dip": plate.get("dip")}
            if len(obs) == len(pred):
                r = obs - pred
                run["rmsResidual"] = float(np.sqrt(np.mean(r ** 2)))
            runs.append(run)
        out = {"kind": "forward", "method": method, "runs": runs, "predicted": runs[0]["predicted"],
               "plateCells": runs[0]["plateCells"], "versions": versions, "seconds": time.time() - t0, "localOrigin": local.tolist(),
               "mesh": {"shape": spec["n"], "coreCell": req["mesh"]["coreCell"]}}
        if len(obs) == len(stations):
            out["rmsObserved"] = float(np.sqrt(np.mean((obs - obs.mean()) ** 2)))
            out["rmsResidual"] = runs[0].get("rmsResidual")
        return out

    # ---------------- inversion ----------------
    dobs_user = np.asarray(req["observed"], dtype=float)
    dobs = _to_sim(method, dobs_user)
    unc = req["uncertainty"]
    std = float(unc["floor"]) + float(unc.get("percent", 0)) / 100.0 * np.abs(dobs)
    if np.any(~np.isfinite(std)) or np.any(std <= 0):
        raise ValueError("Every datum needs a positive uncertainty: set a floor above zero.")
    survey, sim = _survey_and_sim(method, mesh, actv, st, field, "ram")
    progress({"stage": "sensitivities", "message": f"Building the {len(dobs)} x {n_act} sensitivity matrix"})
    ts = time.time()
    G = sim.G  # computed here so this stage is timed and reported, not hidden inside the first iteration
    sens_seconds = time.time() - ts
    data_obj = sdata.Data(survey, dobs=dobs, standard_deviation=std)
    dmis = data_misfit.L2DataMisfit(data=data_obj, simulation=sim)
    reg = regularization.WeightedLeastSquares(mesh, active_cells=actv, mapping=maps.IdentityMap(nP=n_act),
                                              length_scale_x=float(req["reg"].get("lengthX", 1.0)),
                                              length_scale_y=float(req["reg"].get("lengthY", 1.0)),
                                              length_scale_z=float(req["reg"].get("lengthZ", 1.0)))
    lower = 0.0 if method == "mag" else -np.inf
    upper = np.inf
    b = req.get("bounds") or {}
    if b.get("lower") is not None:
        lower = float(b["lower"])
    if b.get("upper") is not None:
        upper = float(b["upper"])
    max_iter = int(req["reg"].get("maxIter", 15))
    opt = optimization.ProjectedGNCG(maxIter=max_iter, lower=lower, upper=upper, cg_maxiter=10, cg_rtol=1e-3)
    inv_prob = inverse_problem.BaseInvProblem(dmis, reg, opt, print_version=False)
    history = []

    class Progress(directives.InversionDirective):
        def endIter(self):
            h = {"iter": int(self.opt.iter), "beta": float(self.invProb.beta), "phi_d": float(self.invProb.phi_d),
                 "phi_m": float(self.invProb.phi_m)}
            history.append(h)
            progress({"stage": "iterating", "iter": h["iter"], "maxIter": max_iter, "phi_d": h["phi_d"],
                      "target": float(len(dobs)), "beta": h["beta"]})

    dir_list = [
        directives.UpdateSensitivityWeights(every_iteration=False),
        directives.BetaEstimate_ByEig(beta0_ratio=float(req["reg"].get("beta0Ratio", 10.0)), random_seed=1),
        directives.BetaSchedule(coolingFactor=2.0, coolingRate=1),
        directives.UpdatePreconditioner(),
        directives.TargetMisfit(chifact=1.0),
        Progress(),
    ]
    inv = inversion.BaseInversion(inv_prob, directiveList=dir_list)
    m0 = np.full(n_act, 1e-4 if method == "mag" else 0.0)
    progress({"stage": "iterating", "iter": 0, "maxIter": max_iter, "message": "Estimating the starting trade-off"})
    rec = inv.run(m0)
    pred_sim = sim.dpred(rec)
    phi_d = float(np.sum(((dobs - pred_sim) / std) ** 2))
    pred = _to_user(method, pred_sim)
    # Normalised sensitivity per active cell: sqrt(sum_i G_ij^2) / max. A "data support" measure, the
    # geophysical analogue of #92 — it says how much the data can see a cell, never how "confident" it is.
    # einsum accumulates column sums of squares in float64 WITHOUT materialising G**2. The first version
    # (np.asarray(G, float64) ** 2) made two full float64 copies of G — measured +3.8 GB for a 1 GB matrix
    # by the #321 performance review, i.e. ~7.5 GB peak at the 1.5 GB cap: an out-of-memory kill at the end
    # of a finished run on an 8 GB laptop. This form adds ~2 MB and ran in 0.75 s on the same matrix.
    sens = np.sqrt(np.einsum("ij,ij->j", G, G, dtype=np.float64)).ravel()
    sens = sens / sens.max() if sens.max() > 0 else sens
    # Only core, active cells go back to the renderer — padding and air are never displayed.
    ix0, ix1 = spec["core"]["ix"]
    iy0, iy1 = spec["core"]["iy"]
    iz0, iz1 = spec["core"]["iz"]
    nx, ny, nz = spec["n"]
    ii, jj, kk = np.unravel_index(np.arange(mesh.n_cells), (nx, ny, nz), order="F")
    core_mask = (ii >= ix0) & (ii < ix1) & (jj >= iy0) & (jj < iy1) & (kk >= iz0) & (kk < iz1)
    full_model = np.full(mesh.n_cells, np.nan)
    full_model[actv] = rec
    full_sens = np.full(mesh.n_cells, np.nan)
    full_sens[actv] = sens
    keep = core_mask & actv
    cc = np.round(mesh.cell_centers[keep] + local, 2)
    hx, hy, hz = mesh.h
    sizes = np.round(np.c_[hx[ii[keep]], hy[jj[keep]], hz[kk[keep]]], 3)
    # Values rounded through float32 (the precision SimPEG's sensitivities have anyway) — cuts the JSON the
    # renderer has to parse (performance review: ~20-25 MB for 150k cells as full doubles).
    f32 = lambda a: np.asarray(a, dtype=np.float32).astype(float)
    return {
        "kind": "inversion", "method": method,
        "cells": {"x": cc[:, 0].tolist(), "y": cc[:, 1].tolist(), "z": cc[:, 2].tolist(),
                  "dx": sizes[:, 0].tolist(), "dy": sizes[:, 1].tolist(), "dz": sizes[:, 2].tolist(),
                  "value": f32(full_model[keep]).tolist(), "support": np.round(full_sens[keep], 4).tolist()},
        "predicted": pred.tolist(), "standardDeviation": std.tolist(),
        "phi_d": phi_d, "target": float(len(dobs)), "reachedTarget": phi_d <= 1.05 * len(dobs),
        "iterations": len(history), "maxIter": max_iter, "history": history,
        "mesh": {"shape": spec["n"], "coreCell": req["mesh"]["coreCell"], "nActive": n_act, "nCoreActive": int(keep.sum()),
                 "padCells": req["mesh"].get("padCells", 6), "padFactor": req["mesh"].get("padFactor", 1.3), "depth": req["mesh"]["depth"]},
        "localOrigin": local.tolist(), "versions": versions,
        "seconds": time.time() - t0, "sensitivitySeconds": sens_seconds, "sensitivityBytes": int(G.nbytes),
    }
