"""TASKS.csv #655 — GemPy's input rescale must be isotropic. Run: venv python tests/test_implicit_transform.py
As built by gp.create_geomodel, control points spanning 500 x 1000 x 700 m came out with scale ratios 1.429 : 1 : 1
(the shorter horizontal axis stretched whenever the vertical span lies between the horizontal ones) — a hidden
anisotropy. main.py re-runs the transform with GlobalAnisotropy.NONE and the response reports the ratios. For every
ordering of the three spans, a plane through the data box's diagonal must come back isotropic and on the plane."""
import itertools
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.main import implicit_model, ImplicitModelRequest  # noqa: E402


def test_isotropic_for_every_span_order():
    rng = np.random.default_rng(5)
    for sx, sy, sz in itertools.permutations((500.0, 1000.0, 700.0)):
        plane = lambda x: sz * (1.0 - x / sx)  # from z = sz at the west edge to 0 at the east: spans the full box
        dip = float(np.degrees(np.arctan(sz / sx)))
        xs, ys = rng.uniform(0, sx, 40), rng.uniform(0, sy, 40)
        xs[:2], ys[:2] = (0.0, sx), (0.0, sy)
        pts = [dict(x=float(a), y=float(b), z=float(plane(a))) for a, b in zip(xs, ys)]
        ors = [dict(x=float(a), y=float(b), z=float(plane(a)), dip=dip, azimuth=90.0) for a, b in zip(xs[2:7], ys[2:7])]
        res = implicit_model(ImplicitModelRequest(extent=[-50, sx + 50, -50, sy + 50, -50, sz + 50], resolution=[16, 16, 16],
                                                  relation="erode", surfaces=[dict(name="A", points=pts, orientations=ors)]))
        r = res.input_scale_ratios
        v = np.asarray(res.surfaces[0].vertices)
        inside = (v[:, 0] > 0.1 * sx) & (v[:, 0] < 0.9 * sx) & (v[:, 1] > 0.1 * sy) & (v[:, 1] < 0.9 * sy)
        err = np.abs(v[inside, 2] - plane(v[inside, 0]))
        print(f"span {sx:.0f} x {sy:.0f} x {sz:.0f}: input scale ratios {r}; {int(inside.sum())} vertices, |z - plane| max {err.max():.1f} m")
        assert r is not None and max(r) < 1.0001, (sx, sy, sz, r)
        assert err.max() < 0.05 * sz, (sx, sy, sz, err.max())


if __name__ == "__main__":
    test_isotropic_for_every_span_order()
    print("ALL PASSED")
