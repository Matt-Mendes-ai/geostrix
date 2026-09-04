"""GeoStrix Python sidecar.

Optional local FastAPI server for geoprocessing that's a better fit for Python's scientific stack
than reimplementing in JS — scipy today, GemPy later for implicit lithology modelling (see
TASKS.csv). Spawned and killed automatically by electron/main.js (startPythonSidecar /
stopPythonSidecar) on 127.0.0.1:8765; the renderer talks to it over plain HTTP, not IPC, since it's
just a local network service (see src/lib/desktop.js pythonHealth / pythonInterpolate).

Run standalone for testing (see python-sidecar/README.md):
    uvicorn app.main:app --host 127.0.0.1 --port 8765 --reload
"""

from typing import List, Literal
import threading

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="GeoStrix Python sidecar", version="0.1.0")

# This server only ever binds to 127.0.0.1 (see electron/main.js), so it's unreachable from outside
# this machine regardless of CORS policy — permissive CORS here just lets the Electron renderer
# (origin file:// in a packaged build, http://localhost:5173 in dev) actually read the response.
# Without this, the browser's same-origin policy would block it even though both sides are local.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# TASKS.csv #62 — background gempy warm-up. Root cause of "why is modelling so slow / times out
# the first time": /implicit-model's own `import gempy` (further down this file) used to be the
# FIRST time that module — and everything numba compiles on import for — ever got loaded, which
# means that cost landed entirely on the user's first actual "Run" click, synchronously, inside the
# HTTP request. Numba JIT-compiling gempy's compute kernels on a cold cache can genuinely take past
# a minute; a *warm* numba cache (after the first import this machine has ever done) is much faster,
# but even a warm cache's plain Python import graph is still real work best not paid for on-demand.
# Fix: kick off the import in a background thread as soon as the server starts, in parallel with
# whatever else is happening right after launch (Electron window paint, the user importing CSVs,
# picking structure data, etc. — all of which take at least tens of seconds anyway). Python caches
# modules in sys.modules, so by the time /implicit-model's own `import gempy` runs, it's typically
# an instant no-op. This does NOT eliminate the numba JIT cost on a machine's very first-ever gempy
# run (nothing can — that compilation has to happen sometime), it just moves *where* that cost lands
# for both the first run and every run after it. The 300s client-side timeout (src/lib/desktop.js)
# stays as a safety margin for a still-cold cache or a genuinely large/complex model.
def _warm_up_gempy():
    try:
        import gempy  # noqa: F401
    except ImportError:
        pass  # not installed — /implicit-model will report that clearly when actually called


@app.on_event("startup")
def _on_startup():
    threading.Thread(target=_warm_up_gempy, daemon=True).start()


@app.get("/health")
def health():
    return {"status": "ok", "service": "geostrix-sidecar", "version": "0.1.0"}


class Point3D(BaseModel):
    x: float
    y: float
    z: float


class ValuedPoint3D(Point3D):
    value: float


# TASKS.csv #249 (security-specialist review) — /implicit-model already bounds its own inputs
# (MAX_RESOLUTION_CELLS, surfaces max_length=12 below) but this endpoint had no upper bound on either
# list's length. RBFInterpolator's factorization is roughly O(n^3) in sample-point count, so a very
# large points/query list would do genuinely large synchronous work, blocking this single-process
# server for other requests. Low severity — local-only, single-user, self-inflicted worst case (a
# UI-triggered freeze against your own sidecar, not a security boundary crossed) — but a cheap guard.
MAX_INTERPOLATE_POINTS = 50_000

class InterpolateRequest(BaseModel):
    points: List[ValuedPoint3D] = Field(
        ..., min_length=1, max_length=MAX_INTERPOLATE_POINTS,
        description="Known sample points with values — e.g. lithology-contact indicators (0/1), "
                     "grade, or magnetic susceptibility.",
    )
    query: List[Point3D] = Field(..., min_length=1, max_length=MAX_INTERPOLATE_POINTS, description="Points to estimate a value at.")
    method: Literal["rbf", "idw"] = "rbf"
    rbf_function: Literal[
        "linear", "thin_plate_spline", "cubic", "quintic",
        "multiquadric", "inverse_multiquadric", "inverse_quadratic", "gaussian",
    ] = "thin_plate_spline"
    smoothing: float = 0.0
    power: float = 2.0  # IDW only


class InterpolateResponse(BaseModel):
    values: List[float]


@app.post("/interpolate", response_model=InterpolateResponse)
def interpolate(req: InterpolateRequest) -> InterpolateResponse:
    """General-purpose 3D scalar interpolation (RBF or IDW) between labelled sample points and
    query points. A stepping stone toward implicit lithology modelling (TASKS.csv #29): feed it
    contact points labelled inside/outside a unit, query a regular grid, and the returned scalar
    field is isosurface-ready (client-side marching cubes is a separate, not-yet-built step). Also
    directly useful today for contouring grade or magnetic susceptibility between drillholes.
    """
    pts = np.array([[p.x, p.y, p.z] for p in req.points], dtype=float)
    vals = np.array([p.value for p in req.points], dtype=float)
    query = np.array([[p.x, p.y, p.z] for p in req.query], dtype=float)

    if req.method == "idw":
        values = _idw(pts, vals, query, power=req.power)
    else:
        values = _rbf(pts, vals, query, function=req.rbf_function, smoothing=req.smoothing)
    return InterpolateResponse(values=values.tolist())


def _idw(pts: np.ndarray, vals: np.ndarray, query: np.ndarray, power: float) -> np.ndarray:
    out = np.empty(len(query), dtype=float)
    for i, q in enumerate(query):
        d = np.linalg.norm(pts - q, axis=1)
        coincident = d < 1e-9
        if np.any(coincident):
            out[i] = vals[coincident][0]  # query point lands exactly on a sample point
            continue
        w = 1.0 / (d ** power)
        out[i] = float(np.sum(w * vals) / np.sum(w))
    return out


# ---------------------------------------------------------------------------------------------
# TASKS.csv #29 — implicit surface generation via GemPy (gempy.org). First pass: a single
# structural group (one erosion/onlap stack, no faults yet) of named surfaces, each built from
# interface points (e.g. lithology contact picks along drillholes) and orientation data (e.g. the
# structure layer's dip/azimuth), returned as a triangle mesh per surface ready for a three.js
# BufferGeometry on the client. Verified end-to-end against a synthetic 2-surface model before
# wiring this endpoint (see python-sidecar/README.md).
# ---------------------------------------------------------------------------------------------


class SurfacePoint(BaseModel):
    x: float
    y: float
    z: float
    # TASKS.csv #88 — geological architecture layer 7, "soft" constraint type. GemPy's own
    # SurfacePointsTable already supports a per-point `nugget` (verified directly against the installed
    # gempy>=2026.0.3 package: its own default is ~2e-5, i.e. "pass through almost exactly" — a higher
    # value genuinely loosens how tightly the fitted surface is pulled toward this one point). None here
    # means "use GemPy's own default", so a request from an older client that never sends this field
    # behaves identically to before #88.
    nugget: float | None = None


class Orientation(BaseModel):
    x: float
    y: float
    z: float
    dip: float  # degrees, 0 = horizontal, 90 = vertical
    azimuth: float  # degrees, dip-direction azimuth (0 = north, clockwise)
    polarity: int = 1  # 1 or -1 — flips which side of the surface is "younger"; rarely needed


class SurfaceInput(BaseModel):
    name: str
    points: List[SurfacePoint] = Field(..., min_length=1)
    orientations: List[Orientation] = Field(
        ..., min_length=1,
        description="GemPy needs at least one orientation to constrain each surface's dip — "
                    "without it the interpolator has no way to know which way the surface tilts.",
    )


class ImplicitModelRequest(BaseModel):
    extent: List[float] = Field(..., min_length=6, max_length=6, description="[xmin,xmax,ymin,ymax,zmin,zmax]")
    surfaces: List[SurfaceInput] = Field(..., min_length=1, max_length=12)
    resolution: List[int] = Field(default=[40, 40, 40], min_length=3, max_length=3)
    relation: Literal["erode", "onlap"] = "erode"
    # TASKS.csv #274 — GemPy's potential-field RANGE, the actual curvature/"tightness" lever of the
    # co-kriging interpolation (gempy's own InterpolationOptions.kernel_options.range, expressed in its
    # INTERNAL rescaled space, default 1.7 — verified directly against the installed gempy 2026.0.3:
    # create_geomodel() leaves it at a constant 1.7 regardless of extent, and overriding it demonstrably
    # changes the returned mesh). This was never set OR reported, so a user re-running the same job and
    # seeing a differently-shaped surface had no parameter to point at. Sent as a MULTIPLIER of GemPy's
    # own default rather than an absolute number, because the absolute value lives in a normalized space
    # no geologist can reason about: 1.0 = exactly what GemPy would have done on its own (so the default
    # here is a strict no-op), <1 = tighter/more locally-controlled surfaces, >1 = smoother/stiffer.
    range_multiplier: float | None = Field(default=None, ge=0.1, le=10.0)


class MeshOut(BaseModel):
    name: str
    vertices: List[List[float]]
    faces: List[List[int]]


class ImplicitModelResponse(BaseModel):
    surfaces: List[MeshOut]
    # TASKS.csv #274 — always reported, whether or not the caller asked for an override, so the client
    # can put the effective interpolation parameters in its run notice and in the exported surface's
    # provenance. Optional (default None) so an older client that ignores them is unaffected.
    range_used: float | None = None
    range_default: float | None = None
    c_o: float | None = None


MAX_RESOLUTION_CELLS = 64 * 64 * 64  # keeps a single request from blocking the sidecar for too long
# GemPy requires each StructuralElement to have an explicit color (raises if None) — cycled per
# surface here since the client (three.js side) assigns its own display colors anyway.
_SURFACE_PALETTE = ["#c98a5a", "#4a6b4a", "#6b7a8a", "#c0392b", "#8a3a3a", "#d4b06a", "#3a8a8a", "#7a9e6a"]
# TASKS.csv #88 — matches gempy's own SurfacePointsTable default nugget (confirmed by inspecting an
# instance created via from_arrays() with no nugget argument, on the installed gempy>=2026.0.3) — used
# to fill in the "hard" points of a surface that has at least one explicit (soft) nugget elsewhere, so
# every point ends up with a value GemPy actually receives rather than mixing None into the array.
DEFAULT_NUGGET = 2e-05


@app.post("/implicit-model", response_model=ImplicitModelResponse)
def implicit_model(req: ImplicitModelRequest) -> ImplicitModelResponse:
    res = [max(4, min(96, r)) for r in req.resolution]
    if res[0] * res[1] * res[2] > MAX_RESOLUTION_CELLS:
        raise HTTPException(
            status_code=400,
            detail=f"Resolution {res} exceeds the sidecar's cap ({MAX_RESOLUTION_CELLS} cells) — "
                   "use a coarser grid (this is a local single-process server; a very fine grid "
                   "would block it for a long time on one request).",
        )
    try:
        import gempy as gp
        from gempy.core.data import SurfacePointsTable, OrientationsTable, StructuralFrame, StructuralGroup, StructuralElement
        from gempy_engine.core.data.stack_relation_type import StackRelationType
    except ImportError as err:
        raise HTTPException(
            status_code=503,
            detail=f"gempy is not installed in this sidecar's environment ({err}). "
                   "Run: pip install -r python-sidecar/requirements.txt",
        )

    elements = []
    for i, surf in enumerate(req.surfaces):
        sx = np.array([p.x for p in surf.points])
        sy = np.array([p.y for p in surf.points])
        sz = np.array([p.z for p in surf.points])
        # TASKS.csv #88 — only pass an explicit nugget array when at least one point in this surface
        # actually set one; otherwise call from_arrays exactly as before #88 existed, so a run with no
        # soft points is byte-for-byte the same request GemPy has always seen (avoids relying on
        # GemPy's own None-vs-explicit-default handling matching what we'd otherwise hardcode here).
        if any(p.nugget is not None for p in surf.points):
            nuggets = np.array([p.nugget if p.nugget is not None else DEFAULT_NUGGET for p in surf.points])
            sp = SurfacePointsTable.from_arrays(x=sx, y=sy, z=sz, names=surf.name, nugget=nuggets)
        else:
            sp = SurfacePointsTable.from_arrays(x=sx, y=sy, z=sz, names=surf.name)

        ox = np.array([o.x for o in surf.orientations])
        oy = np.array([o.y for o in surf.orientations])
        oz = np.array([o.z for o in surf.orientations])
        gxs, gys, gzs = [], [], []
        for o in surf.orientations:
            dip_r, az_r = np.radians(o.dip), np.radians(o.azimuth)
            gxs.append(o.polarity * np.sin(dip_r) * np.sin(az_r))
            gys.append(o.polarity * np.sin(dip_r) * np.cos(az_r))
            gzs.append(o.polarity * np.cos(dip_r))
        ot = OrientationsTable.from_arrays(
            x=ox, y=oy, z=oz,
            G_x=np.array(gxs), G_y=np.array(gys), G_z=np.array(gzs),
            names=surf.name,
        )
        color = _SURFACE_PALETTE[i % len(_SURFACE_PALETTE)]
        elements.append(StructuralElement(name=surf.name, surface_points=sp, orientations=ot, id=i + 1, color=color))

    # TASKS.csv #271 — HOW the relation is applied, which is not obvious and was originally wrong here.
    # Verified directly against the installed gempy 2026.0.3 (see that row's notes for the experiment):
    # setting structural_relation on ONE group containing every surface has NO effect on the meshes this
    # endpoint returns — ERODE and ONLAP came back byte-identical, because all elements of a single group
    # share one scalar field and are simply its ordered iso-surfaces. The relation only bites BETWEEN
    # groups. So the two cases are expressed structurally, not just by a flag:
    #   onlap  = one group holding every surface. Shared scalar field => parallel, non-crossing,
    #            conformable surfaces. This is the geometry this endpoint has always produced, and it is
    #            the right model for a conformable volcanic/sedimentary pile (GeoStrix's own VMS target).
    #   erode  = one group PER surface, ordered youngest-first, each ERODE. Each younger surface then
    #            genuinely truncates the ones below it (same experiment: the lower surface came back with
    #            267 vertices instead of 370, cut by the one above) — a real erosional unconformity.
    if req.relation == "erode":
        groups = [
            StructuralGroup(name=f"group_{i}_{el.name}", elements=[el], structural_relation=StackRelationType.ERODE)
            for i, el in enumerate(elements)
        ]
    else:
        groups = [StructuralGroup(name="stack", elements=elements, structural_relation=StackRelationType.ONLAP)]
    frame = StructuralFrame(structural_groups=groups, color_gen=gp.data.ColorsGenerator())

    try:
        model = gp.create_geomodel(project_name="geostrix_implicit", extent=req.extent, resolution=res, structural_frame=frame)
        # TASKS.csv #274 — capture GemPy's own default range BEFORE any override, so the response can
        # report both what GemPy would have used and what was actually used.
        kernel = model.interpolation_options.kernel_options
        range_default = float(kernel.range)
        if req.range_multiplier is not None:
            kernel.range = range_default * req.range_multiplier
        range_used = float(kernel.range)
        c_o = float(kernel.c_o)
        sol = gp.compute_model(model)
    except Exception as err:  # GemPy raises a variety of exception types depending on what's ill-posed
        raise HTTPException(status_code=400, detail=f"GemPy could not solve this model: {err}")

    # Real bug found here (via a live client report — meshes were generating "successfully" per the
    # API but were invisible in the 3D viewer): sol.raw_arrays.vertices/.edges are the dual-contouring
    # mesh in GemPy's INTERNAL normalized computation space, not the real-world extent coordinates
    # this endpoint's docstring/callers assume — confirmed empirically (a 500-unit-wide input extent
    # came back with vertex coordinates spanning well under 1 unit). GemPy's own geo_model.py applies
    # `input_transform.apply_inverse()` (+ grid transform) when populating each StructuralElement's
    # OWN .vertices/.edges attributes, which — unlike raw_arrays — end up correctly back in the
    # extent's real coordinate system (verified the same way: a request against a known extent came
    # back with vertex ranges matching that extent). So: read from
    # model.structural_frame.structural_elements instead of sol.raw_arrays. This also sidesteps the
    # previous fragile "GemPy reverses surface order, so reverse our own name list to match by
    # position" hack — each StructuralElement carries its own .name, so surfaces are matched back to
    # the caller's names directly instead of assuming a specific reversal always holds.
    by_name = {el.name: el for el in model.structural_frame.structural_elements if el.vertices is not None}
    out = []
    for surf in req.surfaces:
        el = by_name.get(surf.name)
        if el is None:
            continue  # GemPy produced no mesh for this surface (e.g. ill-posed / outside the resolved extent)
        out.append(MeshOut(name=surf.name, vertices=np.asarray(el.vertices).tolist(), faces=np.asarray(el.edges).tolist()))
    return ImplicitModelResponse(surfaces=out, range_used=range_used, range_default=range_default, c_o=c_o)


def _rbf(pts: np.ndarray, vals: np.ndarray, query: np.ndarray, function: str, smoothing: float) -> np.ndarray:
    from scipy.interpolate import RBFInterpolator

    if len(pts) < 2:
        raise HTTPException(status_code=400, detail="RBF interpolation needs at least 2 sample points.")
    try:
        rbf = RBFInterpolator(pts, vals, kernel=function, smoothing=smoothing)
        return rbf(query)
    except np.linalg.LinAlgError as err:
        raise HTTPException(
            status_code=400,
            detail=f"RBF fit failed (often caused by duplicate/near-duplicate sample points): {err}",
        )
