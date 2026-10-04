"""TASKS.csv #512 — onlap stacks send each shared orientation to GemPy once. Run: venv python tests/test_implicit_dedupe.py
  * the helper keeps the first copy of each repeated pick, keeps distinct picks, and leaves a surface whose
    picks were all repeats with one, so every element still has an orientation;
  * end to end on a small two-surface onlap stack: the meshes are identical whether the client sends the
    picks once or on every unit, and the response says how many copies were dropped; erode is untouched."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.main import implicit_model, ImplicitModelRequest, SurfaceInput, _dedupe_onlap_orientations  # noqa: E402


def o(x, y, z, dip=20.0, az=90.0):
    return dict(x=x, y=y, z=z, dip=dip, azimuth=az)


def test_helper():
    shared = [o(0, 0, -100), o(100, 0, -130), o(-100, 50, -80)]
    own = [o(5, 5, -250, dip=25)]
    surfs = [SurfaceInput(name="A", points=[dict(x=0, y=0, z=-100)], orientations=shared),
             SurfaceInput(name="B", points=[dict(x=0, y=0, z=-250)], orientations=shared + own),
             SurfaceInput(name="C", points=[dict(x=0, y=0, z=-300)], orientations=shared)]
    lists, dropped = _dedupe_onlap_orientations(surfs)
    assert [len(x) for x in lists] == [3, 1, 1], [len(x) for x in lists]
    assert lists[1][0].dip == 25  # B keeps its own pick, not a repeat
    assert lists[2][0].x == 0 and lists[2][0].z == -100  # C had only repeats: keeps its first
    assert dropped == 3 + 2, dropped
    # a flipped polarity is a different gradient: kept
    flip = SurfaceInput(name="D", points=[dict(x=0, y=0, z=0)], orientations=[dict(o(0, 0, -100), polarity=-1)])
    lists, dropped = _dedupe_onlap_orientations([surfs[0], flip])
    assert [len(x) for x in lists] == [3, 1] and dropped == 0
    print("helper OK")


def test_end_to_end():
    rng = np.random.default_rng(3)
    zp = lambda x, z0: z0 - np.tan(np.radians(20)) * x
    def pts(z0):
        xs, ys = rng.uniform(-400, 400, 25), rng.uniform(-400, 400, 25)
        return [dict(x=float(a), y=float(b), z=float(zp(a, z0))) for a, b in zip(xs, ys)]
    P1, P2 = pts(-100), pts(-250)
    ox, oy = rng.uniform(-400, 400, 30), rng.uniform(-400, 400, 30)
    O = [o(float(a), float(b), float(zp(a, -175))) for a, b in zip(ox, oy)]
    ext, res = [-500, 500, -500, 500, -500, 200], [16, 16, 16]
    run = lambda s1, s2, rel="onlap": implicit_model(ImplicitModelRequest(extent=ext, resolution=res, relation=rel, surfaces=[
        dict(name="A", points=P1, orientations=s1), dict(name="B", points=P2, orientations=s2)]))
    dup, once = run(O, O), run(O, O[:1])
    assert dup.orientations_deduplicated == 29 and once.orientations_deduplicated == 0, (dup.orientations_deduplicated, once.orientations_deduplicated)
    for a, b in zip(dup.surfaces, once.surfaces):
        assert a.name == b.name and a.vertices == b.vertices and a.faces == b.faces, a.name
    er = run(O, O, rel="erode")
    assert er.orientations_deduplicated is None
    print(f"end to end OK: meshes identical ({[len(s.vertices) for s in dup.surfaces]} vertices), 29 copies dropped (B keeps one); erode untouched")


if __name__ == "__main__":
    test_helper()
    test_end_to_end()
    print("ALL PASSED")
