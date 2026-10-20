"""TASKS.csv #766 — surface_detail (GemPy's octree level for dual contouring) refines the mesh without moving it.
Run: venv python tests/test_implicit_surface_detail.py. GemPy's getter caps the surface level at number_octree_levels,
so the request must raise that too; the response reports the level actually used."""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.main import implicit_model, ImplicitModelRequest  # noqa: E402


def test_finer_detail_more_triangles_same_surface():
    rng = np.random.default_rng(3)
    z = lambda x, y: 300 + 0.1 * (x - 500) + 40 * math.sin(y / 90)  # a tight-ish fold
    pts = [dict(x=float(a), y=float(b), z=z(a, b)) for a, b in rng.uniform(50, 950, (80, 2))]
    ors = [dict(x=300.0, y=400.0, z=z(300, 400), dip=10.0, azimuth=90.0), dict(x=700.0, y=400.0, z=z(700, 400), dip=10.0, azimuth=90.0)]
    out = {}
    for lvl in (4, 5):
        r = implicit_model(ImplicitModelRequest(extent=[0, 1000, 0, 800, 0, 500], resolution=[24, 24, 24], surface_detail=lvl,
                                                surfaces=[dict(name="top", points=pts, orientations=ors)]))
        v = np.asarray(r.surfaces[0].vertices)
        inside = (v[:, 0] > 150) & (v[:, 0] < 850) & (v[:, 1] > 150) & (v[:, 1] < 650)
        err = float(np.mean(np.abs(v[inside, 2] - np.array([z(a, b) for a, b, _ in v[inside]]))))
        out[lvl] = (r.surface_detail, len(v), err)
        print(f"level {lvl}: used {r.surface_detail}, {len(v)} vertices, mean |dz| inside {err:.2f} m")
    assert out[4][0] == 4 and out[5][0] == 5
    assert out[5][1] > 3 * out[4][1]
    assert abs(out[5][2] - out[4][2]) < 1.5, out


if __name__ == "__main__":
    test_finer_detail_more_triangles_same_surface()
    print("ALL PASSED")
