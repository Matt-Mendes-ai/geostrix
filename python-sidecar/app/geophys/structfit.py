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
    """the sensitivity pass (Stage 1), or with mode 'fit' the fit itself (Stage 2: run_fit)"""
    if req.get("mode") == "fit":
        return run_fit(req, progress)
    return run_sensitivity(req, progress)


def run_sensitivity(req, progress):
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
        # the whole model's response a unit (its cells at 1), then the unit properties within their bounds and a base level. The properties are
        # absolute (g/cc, SI) and unit 1, the space above every top, is the background: the reference, kept as entered (the forward is of each
        # unit's contrast with it; a uniform background is the base level's). Bounds are on the absolute values.
        from scipy.optimize import lsq_linear
        bg = props.get(1, 0.0)
        bounds = {int(k): (float(v[0]), float(v[1])) for k, v in req["resolve"].items() if int(k) != 1}  # JSON keys are strings
        units = sorted(bounds)
        cols = []
        for uid in units:
            m = base["lith"] == uid
            vm, mm = to_mesh(np.ones(len(m)), m)
            cols.append(_forward(method, mesh, mm, vm, st_local, field))
        if obs is None:
            raise ValueError("Re-solving the unit properties needs the observed readings.")
        A = np.column_stack(cols + [np.ones(len(stations))]) / sigma[:, None]
        lob = [bounds[uid][0] - bg for uid in units] + [-np.inf]
        hib = [bounds[uid][1] - bg for uid in units] + [np.inf]
        fit = lsq_linear(A, obs / sigma, bounds=(lob, hib))
        resolved = {"properties": {str(uid): float(v) + bg for uid, v in zip(units, fit.x[:-1])}, "baseLevel": float(fit.x[-1]),
                    "rms": float(np.sqrt(np.mean((A @ fit.x - obs / sigma) ** 2))), "background": bg}
        entered = np.array([props.get(uid, 0.0) - bg for uid in units] + [0.0])
        entered[-1] = float(np.mean(obs - (A[:, :-1] * sigma[:, None]) @ entered[:-1]))
        resolved["rmsEntered"] = float(np.sqrt(np.mean((A @ entered - obs / sigma) ** 2)))
        props = {**props, **{uid: float(v) + bg for uid, v in zip(units, fit.x[:-1])}}

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


# ---------------------------------------------------------------------------------------------------------------------------------------------
# TASKS.csv #2640 Stage 2 — the fit: move the interpreted points (within the distance the user allows each) until the model's response matches the
# survey to its stated uncertainty. A damped Gauss-Newton (Levenberg-Marquardt) on the points' heights:
#   - each iteration: the model as it stands is solved; its response (the smooth model: every cell its unit's property, the cells in the band of a
#     surface that has a movable point a mix of its two units by the smooth share, so a move below a cell's size still changes the data) and a base
#     level (one unknown, the survey's datum) against the readings, in units of the uncertainty;
#   - the Jacobian: one column a movable point, Stage 1's derivative (the point moved a quarter cell, the band's change of share forwarded);
#   - the step: a bounded least squares of the data residual on the columns plus the base level, with sqrt(lambda) x the step as extra rows (the
#     damping that keeps a weakly seen point where it was), each point kept within [start - maxM, start + maxM];
#   - a step is tried (one solve): kept when the misfit falls, the model still holds every drillhole contact (the unit just above and just below
#     each drillhole contact point the same as at the start: an observation never moves) and the same units touch (#90); otherwise lambda x 10 and
#     the step tried again (at most LM_TRIES times), the reason kept;
#   - stop when the RMS misfit is at or under 1 (the stated uncertainty), when it no longer falls by 1 %, at maxIter, or when no step is kept.
# A point the survey cannot move by one uncertainty within its distance (its column x maxM under 1) is left where it is and listed as not
# constrained. Potential fields do not fix a contact's depth: the result is ONE geometry that fits to the stated uncertainty, said so in the panel.
# The model is solved at the pass's coarse resolution (MAX_RES); the panel re-runs it at full resolution through the app's own model run.
MAX_FIT_POINTS = 8
MAX_FIT_ITER = 8
LM_TRIES = 4


def _cell_lookup(model_req, res, xyz):
    """(x, y, z) -> the dense-grid index of the cell that holds it (None outside the model)"""
    ext = np.asarray(model_req.extent, float)
    lo = ext[[0, 2, 4]]
    size = (ext[[1, 3, 5]] - lo) / np.asarray(res, float)
    ijk_all = np.clip(np.floor((xyz - lo) / size).astype(int), 0, np.asarray(res) - 1)
    key_all = ijk_all[:, 0] + res[0] * (ijk_all[:, 1] + res[1] * ijk_all[:, 2])
    dense_of = np.full(res[0] * res[1] * res[2], -1, int)
    dense_of[key_all] = np.arange(len(xyz))

    def at(p):
        q = (np.asarray(p, float) - lo) / size
        if np.any(q < 0) or np.any(q >= np.asarray(res)):
            return None
        i, j, k = (int(v) for v in np.floor(q))
        d = dense_of[i + res[0] * (j + res[1] * k)]
        return None if d < 0 else int(d)
    return at, size


def _contacts(raw_model):
    """the drillhole contacts of the model (points sent with a hole_id; read from the request as sent: the parsed SurfacePoint drops the
    field): [(surface, index, x, y, z)]"""
    out = []
    for s in (raw_model or {}).get("surfaces") or []:
        for k, p in enumerate(s.get("points") or []):
            if isinstance(p, dict) and p.get("hole_id") is not None:
                out.append((s.get("name"), k, float(p["x"]), float(p["y"]), float(p["z"])))
    return out


def _contact_units(sol, at, size, contacts):
    """the unit just above and just below each drillhole contact point (half a cell): [(above, below)]"""
    lith, dz = sol["lith"], float(size[2]) / 2
    out = []
    for _, _, x, y, z in contacts:
        a, b = at((x, y, z + dz)), at((x, y, z - dz))
        out.append((int(lith[a]) if a is not None else None, int(lith[b]) if b is not None else None))
    return out


def _touching(sol, res, idx):
    """the pairs of units that share a cell face (#90: which units touch)"""
    lm = np.zeros(res[0] * res[1] * res[2], int)
    lm[idx] = sol["lith"]
    g = lm.reshape((res[2], res[1], res[0]))
    pairs = set()
    for ax in range(3):
        m = np.moveaxis(g, ax, 0)
        a, b = m[:-1].ravel(), m[1:].ravel()
        d = a != b
        for u, v in set(zip(a[d].tolist(), b[d].tolist())):
            pairs.add((min(u, v), max(u, v)))
    return pairs


def _pairs_text(pairs):
    return ", ".join(f"{a}-{b}" for a, b in sorted(pairs))


def model_response(sol, props, names, widths, mesh, idx, st_local, method, field):
    """the smooth model's response: each cell its unit's property (as a contrast with the background, unit 1), the cells in the band of each of
    `names` (surfaces with a movable point; widths: their bands' w from the starting solve) a mix of its two units by the smooth share"""
    bg = props.get(1, 0.0)
    val = np.array([props.get(int(u_), bg) - bg for u_ in sol["lith"]], float)
    for name in names:
        if widths.get(name) is None:
            continue
        b = _band(sol, name, w=widths[name])
        if b is None:
            continue
        cells, share, u_hi, u_lo, _ = b
        val[cells] = share[cells] * (props.get(u_hi, bg) - bg) + (1 - share[cells]) * (props.get(u_lo, bg) - bg)
    vm = np.zeros(mesh.n_cells)
    mm = np.zeros(mesh.n_cells, dtype=bool)
    nz = val != 0
    vm[idx[nz]] = val[nz]
    mm[idx[nz]] = True
    return _forward(method, mesh, mm, vm, st_local, field)


def step_refusal(sol, at, size, contacts, contacts0, res, idx, touching0):
    """None when the solved model still holds every drillhole contact (the units just above and below it as at the start) and the same units
    touch (#90); else the reason, in words"""
    now = _contact_units(sol, at, size, contacts)
    for (name, k, x, y, z), a, b in zip(contacts, contacts0, now):
        if a != b:
            return (f"the step would put the drillhole contact of {name} (point {k}, at {x:.0f}, {y:.0f}, {z:.0f}) on the wrong side: "
                    "a drillhole contact is an observation and never moves")
    t = _touching(sol, res, idx)
    if t != touching0:
        new, gone = t - touching0, touching0 - t
        parts = ([f"units that would newly touch: {_pairs_text(new)}"] if new else []) + ([f"units that would no longer touch: {_pairs_text(gone)}"] if gone else [])
        return "the step would change which units touch (" + "; ".join(parts) + ")"
    return None


def _with_heights(model_req, heights):
    """the model with the movable points at the given heights: heights {(surface, index): z}"""
    surfs = []
    for s in model_req.surfaces:
        mine = {k: z for (n, k), z in heights.items() if n == s.name}
        if not mine:
            surfs.append(s)
            continue
        s2 = s.model_copy(deep=True)
        for k, z in mine.items():
            s2.points[k] = s2.points[k].model_copy(update={"z": float(z)})
        surfs.append(s2)
    return model_req.model_copy(update={"surfaces": surfs})


def run_fit(req, progress):
    """req: as the sensitivity pass (model, properties, movable [{surface, index, maxM}], method, stations, observed (required), uncertainty, field,
    allowLong) plus maxIter (at most MAX_FIT_ITER).
    -> points [{surface, index, x, y, zStart, z, movedM, maxM, constrained, perM}], rmsStart, rmsEnd, baseLevel, history [{iter, rms, lambda, kept,
       tries, reasons}], stopped ('fit' | 'no improvement' | 'max iterations' | 'no step kept' | 'no point is constrained'), properties, resolution,
       seconds, solveSeconds, solves, method, drillholeContacts"""
    from scipy.optimize import lsq_linear
    from app.main import ImplicitModelRequest

    t0 = time.time()
    progress({"stage": "loading", "message": "Loading GemPy and SimPEG", "iter": 0, "maxIter": 1})
    import gempy  # noqa: F401

    model0 = ImplicitModelRequest(**req["model"])
    res = [max(4, min(MAX_RES, int(r))) for r in model0.resolution]
    movable = req["movable"][:MAX_FIT_POINTS]
    method = req["method"]
    stations = np.asarray(req["stations"], float)
    if req.get("observed") is None:
        raise ValueError("The fit needs the observed readings.")
    obs = np.asarray(req["observed"], float)
    u = req.get("uncertainty") or {}
    sigma = float(u.get("floor", 0.0)) + float(u.get("percent", 0.0)) / 100.0 * np.abs(obs)
    sigma = np.broadcast_to(np.asarray(sigma, float), (len(stations),)).astype(float)
    props = {int(k): float(v) for k, v in (req.get("properties") or {}).items()}
    bg = props.get(1, 0.0)
    field = req.get("field") or {}
    max_iter = max(1, min(MAX_FIT_ITER, int(req.get("maxIter") or MAX_FIT_ITER)))
    names = sorted({m["surface"] for m in movable})
    keys = [(m["surface"], int(m["index"])) for m in movable]
    start = {}
    for (name, k) in keys:
        p = next(s for s in model0.surfaces if s.name == name).points[k]
        start[(name, k)] = float(p.z)
    lo_b = np.array([start[k] - float(m["maxM"]) for k, m in zip(keys, movable)])
    hi_b = np.array([start[k] + float(m["maxM"]) for k, m in zip(keys, movable)])
    contacts = _contacts(req["model"])
    solves = 0

    def solve(heights):
        nonlocal solves
        solves += 1
        return _solve(_with_heights(model0, heights), res)

    progress({"stage": "solving", "message": "Solving the model as it is", "iter": 0, "maxIter": max_iter})
    ts = time.time()
    sol = solve(start)
    t_solve = time.time() - ts
    est = t_solve * (len(movable) + 2) * max_iter
    if est > MAX_SECONDS and not req.get("allowLong"):
        raise ValueError(f"One solve of this model takes {t_solve:.0f} s, so fitting {len(movable)} points over up to {max_iter} rounds could take about "
                         f"{est / 60:.0f} min (over {MAX_SECONDS / 60:.0f}): mark fewer points, or lower the model's resolution or its number of surfaces.")
    mesh, idx, lo = _mesh(model0, res, sol["xyz"])
    st_local = stations - lo
    at, size = _cell_lookup(model0, res, sol["xyz"])
    contacts0 = _contact_units(sol, at, size, contacts)
    touching0 = _touching(sol, res, idx)
    widths = {}
    for name in names:
        b = _band(sol, name)
        widths[name] = b[4] if b is not None else None

    def response(s_):
        return model_response(s_, props, names, widths, mesh, idx, st_local, method, field)

    def misfit(pred):
        """the RMS misfit in uncertainties, with the base level solved (the weighted mean of the residual)"""
        w2 = 1.0 / sigma ** 2
        base_ = float(np.sum((obs - pred) * w2) / np.sum(w2))
        rr = (obs - pred - base_) / sigma
        return float(np.sqrt(np.mean(rr ** 2))), base_, rr

    def checks(s_):
        return step_refusal(s_, at, size, contacts, contacts0, res, idx, touching0)

    heights = dict(start)
    pred = response(sol)
    rms0, base, r = misfit(pred)
    rms = rms0
    history = [{"iter": 0, "rms": rms0, "lambda": None, "kept": True, "tries": 0, "reasons": []}]
    lam = None
    frozen = set()
    per_m = {}
    stopped = "max iterations"
    dz_cell = (model0.extent[5] - model0.extent[4]) / res[2]
    for it in range(1, max_iter + 1):
        if rms <= 1.0:
            stopped = "fit"
            break
        progress({"stage": "points", "message": f"Round {it} of at most {max_iter}: the survey's response to each point", "iter": it, "maxIter": max_iter,
                  "etaS": round(t_solve * (len(movable) + 2) * (max_iter - it + 1))})
        # the Jacobian, one column a point (Stage 1's smooth derivative, at the points' current heights), in uncertainties a metre
        J = np.zeros((len(stations), len(keys)))
        step = 0.25 * dz_cell
        for c, (name, k) in enumerate(keys):
            if (name, k) in frozen or widths[name] is None:
                continue
            moved = solve({**heights, (name, k): heights[(name, k)] + step})
            b0 = _band(sol, name, w=widths[name])
            b1 = _band(moved, name, w=widths[name])
            if b0 is None:
                continue
            cells = b0[0] | (b1[0] if b1 is not None else False)
            share1 = b1[1] if b1 is not None else b0[1]
            drho = props.get(b0[2], bg) - props.get(b0[3], bg)
            dshare = np.where(cells, share1 - b0[1], 0.0)
            vm = np.zeros(mesh.n_cells)
            mm = np.zeros(mesh.n_cells, dtype=bool)
            vm[idx[cells]] = drho * dshare[cells]
            mm[idx[cells]] = True
            J[:, c] = _forward(method, mesh, mm, vm, st_local, field) / step / sigma
        for c, (key, m) in enumerate(zip(keys, movable)):
            norm = float(np.sqrt(np.mean(J[:, c] ** 2)))
            per_m[key] = norm
            if it == 1 and norm * float(m["maxM"]) < 1.0:
                frozen.add(key)  # the survey cannot move the data by one uncertainty within the point's distance: not constrained, left in place
        free = [c for c, key in enumerate(keys) if key not in frozen]
        if not free:
            stopped = "no point is constrained"
            break
        Jf = J[:, free]
        A = np.column_stack([Jf, 1.0 / sigma])  # the base level moves too
        if lam is None:
            lam = 1e-2 * float(np.mean(np.sum(Jf ** 2, axis=0)))
        z_now = np.array([heights[keys[c]] for c in free])
        lo_s, hi_s = lo_b[free] - z_now, hi_b[free] - z_now
        reasons, kept, tries, improved = [], False, 0, 0.0
        while tries < LM_TRIES:
            tries += 1
            D = np.sqrt(lam) * np.eye(len(free))
            AA = np.vstack([A, np.column_stack([D, np.zeros(len(free))])])
            bb = np.concatenate([r, np.zeros(len(free))])
            fitres = lsq_linear(AA, bb, bounds=(np.concatenate([lo_s - 1e-9, [-np.inf]]), np.concatenate([hi_s + 1e-9, [np.inf]])))
            dz = fitres.x[:-1]
            trial = dict(heights)
            for c, d in zip(free, dz):
                trial[keys[c]] = float(np.clip(heights[keys[c]] + d, lo_b[c], hi_b[c]))
            progress({"stage": "points", "message": f"Round {it}: trying a step (try {tries})", "iter": it, "maxIter": max_iter})
            s_try = solve(trial)
            why = checks(s_try)
            if why is not None:
                reasons.append(why)
                lam *= 10.0
                continue
            p_try = response(s_try)
            rms_try, base_try, r_try = misfit(p_try)
            if rms_try < rms:
                improved = (rms - rms_try) / rms
                heights, sol, pred, base, r, rms = trial, s_try, p_try, base_try, r_try, rms_try
                lam = max(lam / 3.0, 1e-12)
                kept = True
                break
            reasons.append(f"the misfit would rise to {rms_try:.2f}")
            lam *= 10.0
        history.append({"iter": it, "rms": rms, "lambda": lam, "kept": kept, "tries": tries, "reasons": reasons})
        if not kept:
            stopped = "no step kept"
            break
        if rms <= 1.0:
            stopped = "fit"
            break
        if improved < 0.01:
            stopped = "no improvement"
            break

    out = []
    for key, m in zip(keys, movable):
        name, k = key
        p = next(s for s in model0.surfaces if s.name == name).points[k]
        out.append({"surface": name, "index": k, "x": float(p.x), "y": float(p.y), "zStart": start[key], "z": heights[key],
                    "movedM": heights[key] - start[key], "maxM": float(m["maxM"]), "constrained": key not in frozen, "perM": per_m.get(key)})
    return {"mode": "fit", "points": out, "rmsStart": rms0, "rmsEnd": rms, "baseLevel": base, "history": history, "stopped": stopped,
            "properties": {str(kk): v for kk, v in props.items()}, "resolution": res, "seconds": round(time.time() - t0, 1),
            "solveSeconds": round(t_solve, 2), "solves": solves, "method": method, "drillholeContacts": len(contacts)}
