"""TASKS.csv #2640 (Stage 1) — which contacts of a geology model a gravity or magnetic survey can see: the sensitivity pass of a structure-
based inversion (after Balza Morales et al. 2025, GJI 244(1); our own design for 3D gravity and magnetics, the paper's code not used).

For each contact point the user marks as movable (an interpreted point: a drillhole contact is an observation and never moves), the point is
moved up by a small step, the GemPy model re-solved, and the survey's response to the change computed:

1. A smooth boundary. GemPy's block is whole units, so a move smaller than a cell changes nothing and then flips a column of cells: no usable
   derivative. The moved surface's own scalar field gives one instead: each cell's share of the unit on the field's upper side is
   sigmoid((phi - level) / w), w about one cell's change of the field, in a band of cells around the surface that hold one of the two units it
   separates (read from the solved block). Its change between the two solves is the geometry's change, below a cell's size too.
2. The forward over that band only: the model's own grid as the prisms (SimPEG's integral forward, choclo; potential.py's survey set-up, so
   gravity in mGal from g/cc, magnetics in nT from SI susceptibility, induced only). The response is linear in a cell's property, so the
   change is the band's forward of (the two units' property difference) x (the change of share).
3. Per point: the change of the predicted data per metre, in the survey's stated uncertainty (floor + percent of the reading): the RMS over
   the stations, the shift that moves the data by one uncertainty (1 / that), and 'seen' when that shift is within the distance the user
   allows the point, 'not constrained by this survey' otherwise.

The unit properties are as entered (Main, 2026-11-14: densities are often measured). Optionally they are re-solved within the user's bounds
(a bounded least squares on the whole model's forward, one unknown a unit plus the base level) and shown beside the entered ones; the
sensitivity then uses the re-solved values.

Cost: one GemPy solve a movable point plus one; the first solve is timed and the job refuses before the rest when the points would take more
than MAX_SECONDS (say what to shrink), unless allowLong. Movement is vertical only (said in the panel).
"""
from __future__ import annotations

import math
import time

import numpy as np

MAX_SECONDS = 600.0      # Main: refuse or warn when the model's own run time x the points would be over ~10 minutes
MAX_POINTS = 20
MAX_RES = 32             # the pass runs at most 32 cells a side (2.4 s a solve measured on a 3-unit model; 48^3 was 6.4 s)
BAND_W = 4.0             # the band: cells within 4 w of the surface's level


def _solve(model_req, res, moved=None):
    """the model solved with one point moved (moved = (surface name, point index, dz)) -> dict of the dense grid's arrays"""
    import gempy as gp
    from app.main import _implicit_frame, _implicit_geomodel

    req = model_req
    if moved is not None:
        name, k, dz = moved
        surfs = [s.model_copy(deep=True) if s.name == name else s for s in model_req.surfaces]
        for s in surfs:
            if s.name == name:
                p = s.points[k]
                s.points[k] = p.model_copy(update={"z": float(p.z) + float(dz)})
        req = model_req.model_copy(update={"surfaces": surfs})
    frame, fault_group_names, fault_elements, _ = _implicit_frame(req)
    model = _implicit_geomodel(req, res, frame, fault_group_names)
    ev = model.interpolation_options.evaluation_options
    ev.mesh_extraction = False  # the block and the fields only: no surfaces
    kernel = model.interpolation_options.kernel_options
    if req.range_multiplier is not None:
        kernel.range = float(kernel.range) * req.range_multiplier
    sol = gp.compute_model(model, engine_config=gp.data.GemPyEngineConfig(backend=gp.data.AvailableBackends.numpy, dtype=req.precision))
    ra = sol.raw_arrays
    groups = model.structural_frame.structural_groups
    where = {}  # surface name -> (group index, index of its level in the group)
    for gi, g in enumerate(groups):
        for ei, el in enumerate(g.elements):
            where[el.name] = (gi, ei)
    levels = [np.atleast_1d(np.asarray(v, float)) for v in ra.scalar_field_at_surface_points]
    return {
        "lith": np.rint(np.asarray(ra.lith_block)).astype(int) - len(fault_elements),
        "phi": np.asarray(ra.scalar_field_matrix, float),
        "levels": levels, "where": where,
        "xyz": np.asarray(model.grid.dense_grid.values, float),
    }


def _band(sol, name, w=None):
    """the moved surface's band: cells near its level that hold one of the two units it separates, their share of the upper unit, the two
    units -> (cells mask, share, unit above, unit below, w)"""
    gi, ei = sol["where"][name]
    phi, level = sol["phi"][gi], float(sol["levels"][gi][ei])
    d = phi - level
    if w is None:
        # about one cell's change of the field: the median |dphi| between neighbouring cells near the level (a cell is ~1 / res of the box)
        near = np.abs(d) < np.percentile(np.abs(d), 2)
        w = float(np.median(np.abs(d[near]))) * 2.0 if near.any() else float(np.std(phi)) / 10
        w = max(w, 1e-9)
    lith = sol["lith"]
    close = np.abs(d) < BAND_W * w
    hi_units, lo_units = lith[close & (d > 0)], lith[close & (d < 0)]
    if not len(hi_units) or not len(lo_units):
        return None
    u_hi = int(np.bincount(hi_units - hi_units.min()).argmax() + hi_units.min())
    u_lo = int(np.bincount(lo_units - lo_units.min()).argmax() + lo_units.min())
    cells = close & ((lith == u_hi) | (lith == u_lo))
    share = 1.0 / (1.0 + np.exp(-np.clip(d / w, -60, 60)))
    return cells, share, u_hi, u_lo, w


def _mesh(model_req, res, xyz):
    """the model's grid as a TensorMesh in local coordinates, and each dense-grid cell's mesh index"""
    import discretize

    ext = np.asarray(model_req.extent, float)
    lo = ext[[0, 2, 4]]
    size = (ext[[1, 3, 5]] - lo) / np.asarray(res, float)
    mesh = discretize.TensorMesh([np.full(res[0], size[0]), np.full(res[1], size[1]), np.full(res[2], size[2])], origin=[0.0, 0.0, 0.0])
    ijk = np.clip(np.floor((xyz - lo) / size).astype(int), 0, np.asarray(res) - 1)
    idx = ijk[:, 0] + res[0] * (ijk[:, 1] + res[1] * ijk[:, 2])  # discretize's order: x fastest
    return mesh, idx, lo


def _forward(method, mesh, cells_mesh_mask, values_mesh, st_local, field):
    """the survey's response to a property on some of the mesh's cells (user units)"""
    from app.geophys.potential import _survey_and_sim, _to_user

    if not cells_mesh_mask.any():
        return np.zeros(len(st_local))
    _, sim = _survey_and_sim(method, mesh, cells_mesh_mask, st_local, field, "forward_only")
    return _to_user(method, sim.dpred(values_mesh[cells_mesh_mask]))


def run_job(req, progress):
    """req: model (an /implicit-model request), properties {unit id: contrast} (g/cc or SI), movable [{surface, index, maxM}],
    method 'grav' | 'mag', stations [[x, y, z]], observed (optional), uncertainty {floor, percent}, field (mag), resolve (optional:
    {unit id: [lo, hi]}), allowLong.
    -> points [{surface, index, x, y, z, maxM, stepM, rmsPerM, shiftForOneSigma, seen, bandCells, units, topStations}], properties,
       resolved (when asked), seconds, solveSeconds"""
    from app.main import ImplicitModelRequest

    t0 = time.time()
    progress({"stage": "loading", "message": "Loading GemPy and SimPEG", "iter": 0, "maxIter": 1})
    import gempy  # noqa: F401  (the import is part of the first solve's time otherwise)

    model_req = ImplicitModelRequest(**req["model"])
    res = [max(4, min(MAX_RES, int(r))) for r in model_req.resolution]
    movable = req["movable"]
    method = req["method"]
    stations = np.asarray(req["stations"], float)
    obs = np.asarray(req["observed"], float) if req.get("observed") is not None else None
    u = req.get("uncertainty") or {}
    sigma = float(u.get("floor", 0.0)) + (float(u.get("percent", 0.0)) / 100.0 * np.abs(obs) if obs is not None else 0.0)
    sigma = np.broadcast_to(np.asarray(sigma, float), (len(stations),))
    props = {int(k): float(v) for k, v in (req.get("properties") or {}).items()}
    field = req.get("field") or {}

    progress({"stage": "solving", "message": "Solving the model as it is", "iter": 0, "maxIter": len(movable) + 1})
    ts = time.time()
    base = _solve(model_req, res)
    t_solve = time.time() - ts
    est = t_solve * len(movable)
    if est > MAX_SECONDS and not req.get("allowLong"):
        raise ValueError(f"One solve of this model takes {t_solve:.0f} s, so {len(movable)} points would take about {est / 60:.0f} min "
                         f"(over {MAX_SECONDS / 60:.0f}): mark fewer points, or lower the model's resolution or its number of surfaces.")

    mesh, idx, lo = _mesh(model_req, res, base["xyz"])
    st_local = stations - lo

    def to_mesh(values_cells, mask_cells):
        vm = np.zeros(mesh.n_cells)
        mm = np.zeros(mesh.n_cells, dtype=bool)
        vm[idx[mask_cells]] = values_cells[mask_cells]
        mm[idx[mask_cells]] = True
        return vm, mm

    resolved = None
    if req.get("resolve"):
        # the whole model's response a unit (its cells at 1), then the unit properties within their bounds and a base level
        from scipy.optimize import lsq_linear
        bounds = {int(k): (float(v[0]), float(v[1])) for k, v in req["resolve"].items()}  # JSON keys are strings
        units = sorted(bounds)
        cols = []
        for uid in units:
            m = base["lith"] == uid
            vm, mm = to_mesh(np.ones(len(m)), m)
            cols.append(_forward(method, mesh, mm, vm, st_local, field))
        if obs is None:
            raise ValueError("Re-solving the unit properties needs the observed readings.")
        A = np.column_stack(cols + [np.ones(len(stations))]) / sigma[:, None]
        lob = [bounds[uid][0] for uid in units] + [-np.inf]
        hib = [bounds[uid][1] for uid in units] + [np.inf]
        fit = lsq_linear(A, obs / sigma, bounds=(lob, hib))
        resolved = {"properties": {str(uid): float(v) for uid, v in zip(units, fit.x[:-1])}, "baseLevel": float(fit.x[-1]),
                    "rms": float(np.sqrt(np.mean((A @ fit.x - obs / sigma) ** 2)))}
        entered = np.array([props.get(uid, 0.0) for uid in units] + [0.0])
        entered[-1] = float(np.mean(obs - (A[:, :-1] * sigma[:, None]) @ entered[:-1]))
        resolved["rmsEntered"] = float(np.sqrt(np.mean((A @ entered - obs / sigma) ** 2)))
        props = {**props, **{uid: v for uid, v in zip(units, fit.x[:-1])}}

    out = []
    for k, mv in enumerate(movable):
        name, pi, max_m = mv["surface"], int(mv["index"]), float(mv["maxM"])
        surf = next(s for s in model_req.surfaces if s.name == name)
        p = surf.points[pi]
        progress({"stage": "points", "message": f"Point {k + 1} of {len(movable)}", "iter": k + 1, "maxIter": len(movable) + 1,
                  "etaS": round(t_solve * (len(movable) - k))})
        b0 = _band(base, name)
        dz_cell = (model_req.extent[5] - model_req.extent[4]) / res[2]
        step = min(max_m, 0.25 * dz_cell) if max_m > 0 else 0.25 * dz_cell
        row = {"surface": name, "index": pi, "x": float(p.x), "y": float(p.y), "z": float(p.z), "maxM": max_m, "stepM": step}
        if b0 is None:
            out.append({**row, "rmsPerM": 0.0, "shiftForOneSigma": None, "seen": False, "bandCells": 0, "note": "no contact of two units here"})
            continue
        moved = _solve(model_req, res, (name, pi, step))
        b1 = _band(moved, name, w=b0[4])
        cells = b0[0] | (b1[0] if b1 is not None else False)
        share1 = b1[1] if b1 is not None else b0[1]
        u_hi, u_lo = b0[2], b0[3]
        drho = props.get(u_hi, 0.0) - props.get(u_lo, 0.0)
        dshare = np.where(cells, share1 - b0[1], 0.0)
        vm, mm = to_mesh(drho * dshare, cells)
        dd = _forward(method, mesh, mm, vm, st_local, field) / step  # per metre
        z = dd / sigma
        rms = float(np.sqrt(np.mean(z ** 2)))
        one = 1.0 / rms if rms > 0 else None
        top = np.argsort(-np.abs(z))[:3]
        out.append({**row, "rmsPerM": rms, "shiftForOneSigma": one, "seen": bool(one is not None and one <= max_m), "bandCells": int(cells.sum()),
                    "units": [u_hi, u_lo], "contrast": drho, "topStations": [int(i) for i in top], "maxPerM": float(np.max(np.abs(z)))})
    return {"points": out, "properties": {str(k): v for k, v in props.items()}, "resolved": resolved, "resolution": res,
            "seconds": round(time.time() - t0, 1), "solveSeconds": round(t_solve, 2), "method": method}
