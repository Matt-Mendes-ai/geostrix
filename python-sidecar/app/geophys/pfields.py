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

Grids come in and go out as base64 float32, row 0 NORTH, NaN = no data (the app's raster.grid layout).
"""
import base64
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


def euler(req, progress):
    import harmonica as hm
    da, easting, northing = _grid(req)
    si = float(req.get("structural_index", 1))
    win = float(req["window"])  # metres
    obs = float(req.get("observation_elevation") or 0.0)
    max_unc = float(req.get("max_depth_uncertainty", 0.15))
    max_depth_windows = float(req.get("max_depth_windows", 2.0))
    progress({"stage": "derivatives", "message": "Derivatives (Harmonica)…"})
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
    elev = float(req["elevation"])
    blank = float(req.get("blank") or 3 * spacing)
    region = [float(r) for r in req["region"]]  # w, e, s, n of the node centres
    mean = float(np.mean(v))
    damping = req.get("damping")
    depth = req.get("depth")
    progress({"stage": "fitting", "message": f"Fitting equivalent sources to {x.size:,} readings…"})
    depth_m = float(depth) if depth not in (None, "") else 1.2 * spacing
    kw = dict(damping=float(damping) if damping not in (None, "") else None, block_size=spacing, depth=depth_m)
    gb = x.size > 5000
    model = hm.EquivalentSourcesGB(**kw, random_state=0) if gb else hm.EquivalentSources(**kw)
    model.fit((x, y, z), v - mean)
    progress({"stage": "predicting", "message": "Predicting on the grid…"})
    e, n = vd.grid_coordinates(region, spacing=spacing)
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
    rows, cols = e.shape
    return {"op": "eqs", "nx": cols, "ny": rows, "x0": float(e[0, 0]), "yTop": float(n[-1, 0]), "dx": float(e[0, 1] - e[0, 0]) if cols > 1 else spacing,
            "dy": float(n[1, 0] - n[0, 0]) if rows > 1 else spacing, "values": _b64(pred[::-1]), "elevation": elev, "readings": int(x.size),
            "gradient_boosted": gb, "rms_misfit": float(np.sqrt(np.mean(resid ** 2))), "data_std": float(np.std(bv)), "blocks": int(bv.size),
            "within_block_rms": within, "depth": depth_m}


def run_job(req, progress):
    op = req.get("op")
    if op == "euler":
        return euler(req, progress)
    if op == "eqs":
        return eqs(req, progress)
    raise ValueError(f"Unknown potential-field operation {op!r}")
