"""TASKS.csv #4106 — a grade model puts a known high-grade body where its samples are.
Run with the add-on's own Python (geoML installed), like test_reference_geoml.py:
    set GEOSTRIX_GEOML_PYTHON=<that venv>\\Scripts\\python.exe
    python tests/test_grade_placement.py                    (re-runs itself with GEOSTRIX_GEOML_PYTHON; about a minute)
    python tests/test_grade_placement.py --kernel gaussian  the same checks with another covariance (geoML's default fails them)
Without geoML it says SKIPPED and exits 0. Not in CI (CI does not install geoML).

Synthetic only: 35 vertical holes (made-up ids SYN-01...) on a 50 m grid, 120 m deep, 2 m samples, at UTM-sized coordinates (so an
origin or precision error would show); a sharp box of grade 10 (100 x 100 x 40 m) in a background of 0.2, through the add-on's own
run_grade at Standard's 300 iterations on 20 m blocks. Checked:
  placement  the grade-weighted centre of the top tenth of the blocks is within half a block of the samples' own, on every axis
  ceiling    no block is above the highest sample (a back-transformed overshoot made blocks several times the samples on a real model)
  support    the blocks over half the model's highest are within two blocks of a body sample (a shell of the model is by its intercepts)
  contrast   the body's blocks are well above the background's"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))

OX, OY, OZ = 430_000.0, 7_008_000.0, 1_500.0
HOLES = [(f"SYN-{i + 1:02d}", OX + x, OY + y) for i, (x, y) in enumerate((x, y) for y in range(0, 201, 50) for x in range(0, 301, 50))]
DEPTH, STEP, CELL = 120.0, 2.0, 20.0
BODY, BACKGROUND = 10.0, 0.2


def grade_at(x, y, z):
    inside = 100 <= x - OX <= 200 and 50 <= y - OY <= 150 and -80 <= z - OZ <= -40
    return BODY if inside else BACKGROUND


def params(kernel=None):
    n = int(DEPTH / STEP)
    collars = [dict(hole_id=h, x=x, y=y, z=OZ, azimuth=0.0, dip=-90.0, length=DEPTH) for h, x, y in HOLES]
    survey = [dict(hole_id=h, depth=d, azimuth=0.0, dip=-90.0) for h, _, _ in HOLES for d in (0.0, DEPTH)]
    samples = [dict(hole_id=h, **{"from": k * STEP, "to": (k + 1) * STEP}, value=grade_at(x, y, OZ - (k + 0.5) * STEP)) for h, x, y in HOLES for k in range(n)]
    p = dict(collars=collars, survey=survey, samples=samples, element="Ag", seed=1234, iterations=300, composite=STEP, inducing=300, simulations=10,
             bounds=[OX, OY, OZ - DEPTH, OX + 300.0, OY + 200.0, OZ], block_size=CELL)
    if kernel:
        p["kernel"] = kernel
    return p


def run(kernel=None):
    import numpy as np
    from geostrix_geoml import models
    models._TRAINED.clear()  # a fresh training for each kernel
    res = models.run_grade(params(kernel), lambda _f, _t: None)
    b = res["blocks"]
    xyz = np.c_[b["x"], b["y"], b["z"]]
    pred = np.asarray(b["prediction"], float)
    mids = np.array([[x, y, OZ - (k + 0.5) * STEP] for _, x, y in HOLES for k in range(int(DEPTH / STEP))])
    vals = np.array([grade_at(*m) for m in mids])
    return res, xyz, pred, mids, vals


def check(kernel=None):
    import numpy as np
    res, xyz, pred, mids, vals = run(kernel)
    assert res["blocks"]["cell"] == CELL, res["blocks"]["cell"]
    top = pred >= np.percentile(pred, 90)
    got = (xyz[top] * pred[top, None]).sum(0) / pred[top].sum()
    hi = vals >= np.percentile(vals, 90)
    want = (mids[hi] * vals[hi, None]).sum(0) / vals[hi].sum()
    off = got - want
    rich = pred >= pred.max() / 2
    body = np.array([grade_at(*q) == BODY for q in xyz])
    contrast = float(np.median(pred[body]) / np.median(pred[~body]))
    d = np.sqrt(((xyz[rich][:, None, :] - mids[vals == BODY][None, :, :]) ** 2).sum(-1)).min(1) if rich.any() else np.array([])
    supported = float(np.mean(d <= 2 * CELL)) if d.size else 0.0
    print(f"kernel {res.get('kernel')}: offset x {off[0]:+.1f} y {off[1]:+.1f} z {off[2]:+.1f} m (half a block {CELL / 2:g}); highest block {pred.max():.2f} "
          f"(highest sample {vals.max():g}); {int(rich.sum())} blocks over half of it, {supported * 100:.0f} % within two blocks of a body sample; body / background {contrast:.1f}")
    assert np.all(np.abs(off) <= CELL / 2), f"the body came back {np.round(off, 1)} m from its samples"
    assert pred.max() <= vals.max() * 1.02, f"a block at {pred.max():.2f}, above the highest sample {vals.max():g}"
    assert supported >= 0.9, f"{supported * 100:.0f} % of the blocks over half the highest are within two blocks of a body sample"
    assert contrast >= 5, f"the body's blocks only {contrast:.1f} times the background's"
    return res


def test_body_comes_back_where_its_samples_are():
    res = check()
    assert res["kernel"] == "exponential"


def have_geoml():
    try:
        import geoml  # noqa: F401
        return True
    except ImportError:
        return False


if __name__ == "__main__":
    if not have_geoml():
        py = os.environ.get("GEOSTRIX_GEOML_PYTHON")
        if py and os.path.abspath(py) != os.path.abspath(sys.executable):
            sys.exit(subprocess.call([py, os.path.abspath(__file__)] + sys.argv[1:]))
        print("SKIPPED: geoML is not installed here; set GEOSTRIX_GEOML_PYTHON to the add-on venv's python.exe")
        sys.exit(0)
    if "--kernel" in sys.argv:
        check(sys.argv[sys.argv.index("--kernel") + 1])
    else:
        test_body_comes_back_where_its_samples_are()
    print("ALL PASSED")
