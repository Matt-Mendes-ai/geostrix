"""TASKS.csv #1985 — potential-field tools on Harmonica / Verde / Boule (Fatiando a Terra, BSD-3).

Two operations, run as a sidecar job in its own process (jobs.py), so their imports (pandas, xarray, scikit-learn, dask:
~3 s) are only paid when one is used:

* "euler": windowed Euler deconvolution of a grid (Reid et al. 1990, Geophysics 55, 80). The derivatives come from Harmonica
  (horizontal by finite differences, vertical by FFT on a padded grid); each window is solved with Harmonica's
  EulerDeconvolution (the 4 x 4 least squares of Euler's homogeneity equation, with its covariance). A solution is kept when
  it falls inside its window, below the observation level, no deeper than the window is wide times `max_depth_windows`, and
  its depth is known to within `max_depth_uncertainty` (the relative standard deviation; Thompson 1982 used 15 %).
* "eqs": a point survey gridded with equivalent sources (Dampney 1969; the gradient-boosted solver of Soler & Uieda 2021,
  GJI 227, 1768, above a few thousand readings) and predicted on a regular grid at ONE elevation: readings taken at different
  heights (a draped survey, two surveys flown at different heights) come out on one level surface, and a higher elevation is
  an upward continuation of the whole survey. Nodes farther than `blank` from every reading are left empty.
  The sources sit `depth` below the readings: 1.2 x the cell by default. Harmonica's own default (4.5 x the mean distance between
  neighbouring blocks) put them 38 m deep under Eagle Lake's ground survey (readings every 3.5 m, 12.5 m cells), and fitted the
  12.5 m block means to only 20 % of their spread; at 15 m (1.2 x 12.5) to 8.4 %, in the same time. The fit is reported against
  those block means, the data the solver is given; the readings' own spread inside a block (56 nT there) no grid of that cell shows.

* "gravred" (#1985): normal gravity (Boule), free-air and Bouguer anomalies, the Bouguer plate or the terrain's prisms (Harmonica).
* "spline" (#1985): Verde's biharmonic spline on block medians, the damping chosen by blocked cross-validation.

Grids come in and go out as base64 float32, row 0 NORTH, NaN = no data (the app's raster.grid layout).
"""
import base64
import sys
import time
import warnings
import numpy as np

# xrft (under Harmonica's FFT functions) warns about its own changing defaults on every call; nothing for a user to act on
warnings.filterwarnings("ignore", category=FutureWarning, module="xrft")


def _f32(b64, n):
    a = np.frombuffer(base64.b64decode(b64), dtype="<f4").astype(float)
    if a.size != n:
        raise ValueError(f"Expected {n} grid values, got {a.size}.")
    return a


def _b64(a):
    return base64.b64encode(np.asarray(a, dtype="<f4").tobytes()).decode("ascii")


def _grid(req):
    import xarray as xr
    nx, ny = int(req["nx"]), int(req["ny"])
    dx, dy = float(req["dx"]), float(req["dy"])
    x0, ytop = float(req["x0"]), float(req["yTop"])
    v = _f32(req["values"], nx * ny).reshape(ny, nx)[::-1]  # south first: northing ascending
    easting = x0 + dx * np.arange(nx)
    northing = (ytop - dy * (ny - 1)) + dy * np.arange(ny)
    return xr.DataArray(v, coords={"northing": northing, "easting": easting}, dims=("northing", "easting")), easting, northing


def _filled(da):
    """No-data filled by the nearest valid node (FFT derivatives need a complete grid); the mean removed."""
    from scipy.ndimage import distance_transform_edt
    v = da.values
    bad = ~np.isfinite(v)
    if bad.all():
        raise ValueError("The grid has no values.")
    if bad.any():
        idx = distance_transform_edt(bad, return_distances=False, return_indices=True)
        v = v[tuple(idx)]
    out = da.copy(data=v - np.nanmean(v))
    return out, bad


def _vertical_derivative(g):
    """Harmonica's FFT vertical derivative on the grid mirror-padded by a third each side (no edge step), cropped back."""
    import harmonica as hm
    import xarray as xr
    ny, nx = g.shape
    py, px = ny // 3 + 1, nx // 3 + 1
    v = np.pad(g.values, ((py, py), (px, px)), mode="reflect")
    de = float(g.easting[1] - g.easting[0]); dn = float(g.northing[1] - g.northing[0])
    e = float(g.easting[0]) + de * np.arange(-px, nx + px)
    n = float(g.northing[0]) + dn * np.arange(-py, ny + py)
    p = xr.DataArray(v, coords={"northing": n, "easting": e}, dims=("northing", "easting"))
    return hm.derivative_upward(p)[py:py + ny, px:px + nx]


# TASKS.csv #2955 (review #2876: 1,701 stations gridded in 72-172 s with only "Working..." for the first 40) — every job runs in a fresh
# process (jobs.py, #321: cancel hands all its memory back), so Harmonica and Verde are imported for each run: 19-24 s of the 24-29 s measured
# on a busy machine for 1,701 stations, the fit itself 3-4 s. The load is said as such before it starts, and timed; the stages after it carry
# their own times in the result (timings), which the pane prints.
def _engine(progress, label="the gridding engine (Harmonica, Verde)"):
    if "harmonica" in sys.modules and "verde" in sys.modules:
        return 0.0  # #3124 — a warm worker: still loaded from a run in the last few minutes
    t0 = time.perf_counter()
    progress({"stage": "loading", "message": f"Loading {label}, the longest step of a small survey; it stays loaded for about 3 minutes after a run…"})
    import harmonica  # noqa: F401
    import verde  # noqa: F401
    return time.perf_counter() - t0


def euler(req, progress):
    load_s = _engine(progress)
    import harmonica as hm
    da, easting, northing = _grid(req)
    si = float(req.get("structural_index", 1))
    win = float(req["window"])  # metres
    obs = float(req.get("observation_elevation") or 0.0)
    max_unc = float(req.get("max_depth_uncertainty", 0.15))
    max_depth_windows = float(req.get("max_depth_windows", 2.0))
    progress({"stage": "derivatives", "message": f"Derivatives (Harmonica; {'engine already loaded' if load_s == 0 else f'engine loaded in {load_s:.0f} s'})…"})
    g, bad = _filled(da)
    ny, nx = g.shape
    dz = _vertical_derivative(g)
    de = hm.derivative_easting(g, order=1)  # finite differences
    dn = hm.derivative_northing(g, order=1)
    F, DE, DN, DZ = g.values, de.values, dn.values, dz.values
    E, N = np.meshgrid(easting, northing)
    U = np.full_like(E, obs)
    dx, dy = float(req["dx"]), float(req["dy"])
    wi, wj = max(3, int(round(win / dx))), max(3, int(round(win / dy)))
    si_, sj = max(1, wi // 4), max(1, wj // 4)  # windows overlap by three quarters: a source is seen from several
    sols = []
    starts_j = list(range(0, max(1, ny - wj + 1), sj))
    for k, j0 in enumerate(starts_j):
        if k % 5 == 0:
            progress({"stage": "windows", "message": f"Windows: row {k + 1} of {len(starts_j)}…", "iter": k + 1, "maxIter": len(starts_j)})
        for i0 in range(0, max(1, nx - wi + 1), si_):
            sl = (slice(j0, j0 + wj), slice(i0, i0 + wi))
            ok = ~bad[sl]
            if ok.sum() < 0.75 * ok.size:  # a window mostly of filled no-data says nothing
                continue
            d = [a[sl][ok] for a in (F, DE, DN, DZ)]
            c = [a[sl][ok] for a in (E, N, U)]
            if not all(np.isfinite(x).all() for x in d):
                continue
            try:
                m = hm.EulerDeconvolution(structural_index=si).fit(tuple(c), tuple(d))
            except Exception:
                continue
            e, n, u = m.location_
            depth = obs - u
            sd = float(np.sqrt(max(m.covariance_[2, 2], 0)))
            if not (np.isfinite(depth) and depth > 0):
                continue
            if not (easting[i0] <= e <= easting[min(nx - 1, i0 + wi - 1)] and northing[j0] <= n <= northing[min(ny - 1, j0 + wj - 1)]):
                continue
            if depth > max_depth_windows * win or sd / depth > max_unc:
                continue
            sols.append((float(e), float(n), float(depth), sd, float(m.base_level_)))
    progress({"stage": "done", "message": f"{len(sols)} solutions."})
    s = np.array(sols) if sols else np.zeros((0, 5))
    return {"op": "euler", "count": len(sols), "x": s[:, 0].tolist(), "y": s[:, 1].tolist(), "depth": s[:, 2].tolist(),
            "depth_sd": s[:, 3].tolist(), "base_level": s[:, 4].tolist(), "structural_index": si, "window": win,
            "windows": len(starts_j) * len(range(0, max(1, nx - wi + 1), si_))}


def eqs(req, progress):
    load_s = _engine(progress)  # #2955
    import harmonica as hm
    import verde as vd
    x = np.asarray(req["x"], float)
    y = np.asarray(req["y"], float)
    z = np.asarray(req["z"], float)
    v = np.asarray(req["value"], float)
    ok = np.isfinite(x) & np.isfinite(y) & np.isfinite(z) & np.isfinite(v)
    x, y, z, v = x[ok], y[ok], z[ok], v[ok]
    if x.size < 10:
        raise ValueError("Fewer than 10 readings with a position, an elevation and a value.")
    spacing = float(req["cell"])
    # TASKS.csv #2839 (GSC review B7) — elevation "draped": every node is predicted at the readings' own surface (their heights interpolated
    # linearly between the stations, the nearest one outside them), so a ground survey is gridded where it was measured instead of being
    # continued up to its highest station (Matagami: 370 m against a median of 270 m, 0.74 mGal off the stations)
    draped = req.get("elevation") == "draped"
    elev = None if draped else float(req["elevation"])
    blank = float(req.get("blank") or 3 * spacing)
    region = [float(r) for r in req["region"]]  # w, e, s, n of the node centres
    mean = float(np.mean(v))
    damping = req.get("damping")
    depth = req.get("depth")
    progress({"stage": "fitting", "message": f"Fitting equivalent sources to {x.size:,} readings ({'engine already loaded' if load_s == 0 else f'engine loaded in {load_s:.0f} s'})…"})
    t_fit = time.perf_counter()
    depth_m = float(depth) if depth not in (None, "") else 1.2 * spacing
    kw = dict(damping=float(damping) if damping not in (None, "") else None, block_size=spacing, depth=depth_m)
    gb = x.size > 5000
    win = None
    if gb:
        # TASKS.csv #2834 (GSC review B4) — Harmonica's default window holds ~5,000 readings (sqrt(5000 / density)): Blake River's 7,810
        # stations over 94.5 x 50.1 km gave a 55.1 km window, wider than the survey's short side, and fit() raised a numpy ValueError.
        # The window is capped at 0.9 x the shorter side (the gradient boosting then uses more, smaller windows).
        w_, h_ = float(x.max() - x.min()), float(y.max() - y.min())
        short = min(w_, h_)
        default = float(np.sqrt(5000.0 * max(w_ * h_, 1.0) / x.size))
        win = min(default, 0.9 * short) if short > 0 else default
        kw_gb = dict(kw, window_size=win)
    model = hm.EquivalentSourcesGB(**kw_gb, random_state=0) if gb else hm.EquivalentSources(**kw)
    try:
        model.fit((x, y, z), v - mean)
    except ValueError as err:
        if "window" in str(err).lower():  # #2834 — said in words, not numpy reprs
            raise ValueError(f"The readings could not be split into windows for the gradient-boosted fit (window {win / 1000:.1f} km over a "
                             f"{(x.max() - x.min()) / 1000:.1f} x {(y.max() - y.min()) / 1000:.1f} km survey): try a larger cell.") from None
        raise
    fit_s = time.perf_counter() - t_fit
    progress({"stage": "predicting", "message": f"Predicting on the grid (fitted in {fit_s:.0f} s)…"})
    t_grid = time.perf_counter()
    e, n = vd.grid_coordinates(region, spacing=spacing)
    if draped:
        from scipy.interpolate import LinearNDInterpolator, NearestNDInterpolator
        xy = np.column_stack([x, y])
        lin = LinearNDInterpolator(xy, z)(e, n)
        u = np.where(np.isfinite(lin), lin, NearestNDInterpolator(xy, z)(e, n))
    else:
        u = np.full_like(e, elev)
    pred = model.predict((e, n, u)) + mean
    far = vd.distance_mask((x, y), maxdist=blank, coordinates=(e, n))
    pred = np.where(far, pred, np.nan)
    # the fit, against the block means the solver is given (the same blocks), and the readings' own spread inside their block
    key = np.floor((x - x.min()) / spacing).astype(np.int64) * 10_000_000 + np.floor((y - y.min()) / spacing).astype(np.int64)
    _, inv = np.unique(key, return_inverse=True)
    cnt = np.bincount(inv)
    bmean = lambda a: np.bincount(inv, weights=a) / cnt
    bv = bmean(v)
    resid = bv - (model.predict((bmean(x), bmean(y), bmean(z))) + mean)
    within = float(np.sqrt(np.mean((v - bv[inv]) ** 2)))
    # #2839 — the GRID against the readings themselves (not their block means): the grid's nodes interpolated bilinearly to each reading
    # inside the node area, so a continuation away from the readings and the cell size both show in the message
    from scipy.interpolate import RegularGridInterpolator
    at = RegularGridInterpolator((n[:, 0], e[0, :]), pred, bounds_error=False, fill_value=np.nan)(np.column_stack([y, x]))
    use = np.isfinite(at)
    grid_rms = float(np.sqrt(np.mean((v[use] - at[use]) ** 2))) if use.any() else None
    grid_max = float(np.max(np.abs(v[use] - at[use]))) if use.any() else None
    grid_n = int(use.sum())
    rows, cols = e.shape
    return {"op": "eqs", "nx": cols, "ny": rows, "x0": float(e[0, 0]), "yTop": float(n[-1, 0]), "dx": float(e[0, 1] - e[0, 0]) if cols > 1 else spacing,
            "dy": float(n[1, 0] - n[0, 0]) if rows > 1 else spacing, "values": _b64(pred[::-1]), "elevation": elev, "draped": draped, "readings": int(x.size),
            "gradient_boosted": gb, "rms_misfit": float(np.sqrt(np.mean(resid ** 2))), "data_std": float(np.std(bv)), "blocks": int(bv.size),
            "within_block_rms": within, "depth": depth_m, "window": win, "grid_rms": grid_rms, "grid_max": grid_max, "grid_n": grid_n,
            "surface": [float(np.min(u)), float(np.max(u))] if draped else None,
            "timings": {"load": round(load_s, 1), "fit": round(fit_s, 1), "grid": round(time.perf_counter() - t_grid, 1)}}  # #2955


# ---- TASKS.csv #1985 — gravity reductions (Boule normal gravity, Harmonica Bouguer / topography) ----------------------------------
# Stations: longitude / latitude (degrees, for the normal gravity), height (m), gravity (mGal); easting / northing (m, the project
# CRS) for the topography. input "observed": absolute gravity, the free-air anomaly is g - normal gravity AT the station (Boule's
# closed form, Li & Goetze 2001: no free-air gradient needed); with heights above sea level (not the ellipsoid) that is the
# classical free-air anomaly, the geoid undulation ignored. input "freeair": the values already are one.
# correction "plate": the simple Bouguer plate 2 pi G rho h (Harmonica bouguer_correction; below sea level water against rock).
# correction "topo": the gravity of every terrain node as a prism from sea level to the ground (Harmonica prism_layer, as its
# topographic-correction tutorial), rock rho above sea level, water against rock below: a complete Bouguer anomaly over the
# terrain's extent, and a station near its edge misses the masses beyond it (the nearest edge is returned).
GRAVRED_MAX_PAIRS = 3e9  # stations x prisms


def gravred(req, progress):
    lon = np.asarray(req["lon"], float); lat = np.asarray(req["lat"], float); h = np.asarray(req["height"], float); g = np.asarray(req["g"], float)
    n = g.size
    density = float(req.get("density", 2670.0))
    out = {}
    if req.get("input", "observed") == "observed":
        import boule as bl
        progress({"stage": "normal", "message": "Normal gravity (Boule, WGS84)…"})
        gamma = bl.WGS84.normal_gravity((lon, lat, h))
        fa = g - gamma
        out["normal"] = gamma.tolist()
    else:
        fa = g
    out["freeAir"] = fa.tolist()
    corr = req.get("correction", "none")
    if corr == "plate":
        import harmonica as hm
        bc = hm.bouguer_correction(h, density_crust=density)
        out["correctionMgal"] = np.asarray(bc).tolist()
        out["bouguer"] = (fa - bc).tolist()
    elif corr == "topo":
        import harmonica as hm
        t = req["terrain"]
        topo, easting, northing = _grid(t)
        npr = topo.size
        if n * npr > GRAVRED_MAX_PAIRS:
            raise ValueError(f"{n:,} stations x {npr:,} terrain nodes is too much to compute here: use a coarser terrain (Terrain detail) or fewer stations.")
        tv = np.where(np.isfinite(topo.values), topo.values, 0.0)
        topo = topo.copy(data=tv)
        dens = np.where(tv >= 0, density, 1040.0 - density)
        progress({"stage": "topography", "message": f"Gravity of the terrain ({npr:,} prisms) at {n:,} stations…"})
        layer = hm.prism_layer((easting, northing), surface=topo, reference=0, properties={"density": dens})
        e = np.asarray(req["easting"], float); nn = np.asarray(req["northing"], float)
        gt = layer.prism_layer.gravity((e, nn, h), field="g_z", progressbar=False)
        out["correctionMgal"] = np.asarray(gt).tolist()
        out["bouguer"] = (fa - gt).tolist()
        # how close a station is to the end of the terrain: the masses beyond it are not in the correction
        x0, x1, y0, y1 = easting.min(), easting.max(), northing.min(), northing.max()
        edge = np.minimum.reduce([e - x0, x1 - e, nn - y0, y1 - nn])
        out["nearestEdgeM"] = float(np.min(edge)); out["medianEdgeM"] = float(np.median(edge))
    out["density"] = density
    progress({"stage": "done", "message": "Done."})
    return out


# ---- TASKS.csv #1985 — Verde spline gridding, the damping chosen by blocked cross-validation ------------------------------------
# A biharmonic (thin-plate) spline of Green's functions (Sandwell 1987) fitted to the block medians of the readings (spacing = the
# cell, Verde's recommended first step), the damping chosen by SplineCV among `dampings` with K-fold cross-validation on spatial
# blocks (BlockKFold: neighbouring readings are not split between training and testing, so the score is not flattered). The dense
# solve is N x N: past SPLINE_MAX_POINTS block medians the block size grows until they fit (said in the result).
SPLINE_MAX_POINTS = 3000
SPLINE_MAX_NODES = 1_000_000
SPLINE_DAMPINGS = (1e-8, 1e-6, 1e-4, 1e-2, 1.0)


def spline(req, progress):
    _engine(progress, "the gridding engine (Verde)")  # #2955
    import verde as vd
    x = np.asarray(req["x"], float); y = np.asarray(req["y"], float); v = np.asarray(req["value"], float)
    ok = np.isfinite(x) & np.isfinite(y) & np.isfinite(v)
    x, y, v = x[ok], y[ok], v[ok]
    nx, ny, cell = int(req["nx"]), int(req["ny"]), float(req["cell"])
    if nx * ny > SPLINE_MAX_NODES:
        raise ValueError(f"A spline grid of {nx * ny:,} nodes is over {SPLINE_MAX_NODES:,}: use a bigger cell.")
    spacing = cell
    progress({"stage": "reduce", "message": "Block medians…"})
    for _ in range(40):
        coords, data = vd.BlockReduce(np.median, spacing=spacing).filter((x, y), v)
        if coords[0].size <= SPLINE_MAX_POINTS:
            break
        spacing *= 1.25
    if coords[0].size < 10:
        raise ValueError("Too few readings for a spline (fewer than 10 blocks).")
    cv_spacing = float(req.get("cvSpacing") or 0) or 5 * spacing
    # a survey small beside the CV block has too few blocks to split 5 ways (Verde refuses): halve the block, down to the block
    # medians' own spacing, until there are at least 10; past that, fewer folds (2 at least)
    def n_blocks(s):
        return len(set(zip(np.floor(coords[0] / s).astype(np.int64).tolist(), np.floor(coords[1] / s).astype(np.int64).tolist())))
    while cv_spacing > spacing and n_blocks(cv_spacing) < 10:
        cv_spacing = max(spacing, cv_spacing / 2)
    folds = min(5, n_blocks(cv_spacing))
    if folds < 2:
        raise ValueError("Too few readings for a spline: they fall in fewer than 2 blocks for cross-validation.")
    cv = vd.BlockKFold(spacing=cv_spacing, n_splits=folds, shuffle=True, random_state=0)
    progress({"stage": "cv", "message": f"Choosing the damping by blocked cross-validation ({coords[0].size:,} points, {len(SPLINE_DAMPINGS)} dampings x {folds} folds)…"})
    spl = vd.SplineCV(dampings=SPLINE_DAMPINGS, cv=cv)
    with warnings.catch_warnings():  # scikit-learn / Verde deprecation notices inside the cross-validation: nothing to act on
        warnings.simplefilter("ignore", FutureWarning)
        spl.fit(coords, data)
    scores = [float(sc) for sc in np.asarray(spl.scores_)]
    progress({"stage": "predict", "message": f"Predicting {nx * ny:,} nodes…"})
    x0, ytop = float(req["x0"]), float(req["yTop"])
    E, N = np.meshgrid(x0 + cell * np.arange(nx), ytop - cell * np.arange(ny))  # row 0 north
    pred = spl.predict((E.ravel(), N.ravel()))
    return {"values": _b64(pred), "damping": float(spl.damping_) if spl.damping_ is not None else None, "scores": scores, "dampings": list(SPLINE_DAMPINGS),
            "score": max(scores), "points": int(coords[0].size), "readings": int(v.size), "blockM": spacing, "cvBlockM": cv_spacing, "folds": folds}


def run_job(req, progress):
    op = req.get("op")
    if op == "euler":
        return euler(req, progress)
    if op == "eqs":
        return eqs(req, progress)
    if op == "gravred":  # TASKS.csv #1985
        return gravred(req, progress)
    if op == "spline":  # TASKS.csv #1985
        return spline(req, progress)
    raise ValueError(f"Unknown potential-field operation {op!r}")
