"""TASKS.csv #4043 — stored geoML reference models, to compare before and after a geoML / TensorFlow / numpy update.
Run with the add-on's own Python (geoML and TensorFlow installed from addons/geoml/requirements.txt):
    set GEOSTRIX_GEOML_PYTHON=<that venv>\\Scripts\\python.exe
    python tests/test_reference_geoml.py              (re-runs itself with GEOSTRIX_GEOML_PYTHON; ~1-2 min)
    python tests/test_reference_geoml.py --measure    the run-to-run spread and a parameter nudge, which the tolerances are set from
    python tests/test_reference_geoml.py --store '<tolerance json>' '<why it moved>'   rewrite python-sidecar/tests/reference/geoml_grade_rock.json
                                                      (deliberately; the reference it replaces is kept under "earlier", with its moves)
Without geoML (no GEOSTRIX_GEOML_PYTHON, and none in this Python) it says SKIPPED and exits 0. Not in CI: CI does not install
geoML (the add-on's workflow only builds and publishes it).

Synthetic data only: 12 vertical holes (made-up ids SYN-01...) on a 100 m grid, 120 m deep, 2 m samples.
  grade  a smooth positive field (a Gaussian high at the centre of the grid, 60 m down, plus a gentle ripple), through the add-on's
         own run_grade with the app's "Fast" settings; compared on a fixed 6 x 4 x 3 block grid: prediction, P10, P90.
  rock   'SED' over 'VOLC' across a contact dipping gently to the west, the unit VOLC through run_domain ("Fast", stationary);
         compared on the same blocks: the unit's probability; and the share of training points the model puts in the right unit.
Both pass the seed the add-on always passes (1234). The tolerances are in the JSON, with what they were measured from.
A result that moved is not a failure to hide: say it in the release notes and store the new reference with --store."""
import json
import math
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REF = os.path.normpath(os.path.join(HERE, "..", "..", "..", "python-sidecar", "tests", "reference", "geoml_grade_rock.json"))
sys.path.insert(0, os.path.join(HERE, ".."))

HOLES = [(f"SYN-{i + 1:02d}", float(x), float(y)) for i, (x, y) in enumerate((x, y) for y in (0, 100, 200) for x in (0, 100, 200, 300))]
DEPTH, STEP = 120.0, 2.0
BOUNDS = [0.0, 0.0, -120.0, 300.0, 200.0, 0.0]  # 6 x 4 x 3 blocks of 50 m
FAST_GRADE = dict(iterations=150, composite=5, inducing=200, block_size=50, simulations=50)
FAST_DOMAIN = dict(iterations=150, train_spacing=10, inducing_spacing=80, surface_block=80, refine_levels=1, block_size=50)


def grade_at(x, y, z):
    return 0.2 + 1.5 * math.exp(-((x - 150) ** 2 + (y - 100) ** 2) / (2 * 90.0 ** 2)) * math.exp(-((z + 60) ** 2) / (2 * 35.0 ** 2)) \
        + 0.05 * (1 + math.sin(0.07 * x + 0.11 * z))


def contact_depth(x, y):
    """depth below the collar (z = 0) of the SED / VOLC contact: 50 m at the grid's centre, deeper to the west"""
    return 50.0 - 0.15 * (x - 150) + 0.1 * (y - 100)


def holes():
    collars = [dict(hole_id=h, x=x, y=y, z=0.0, azimuth=0.0, dip=-90.0, length=DEPTH) for h, x, y in HOLES]
    survey = [dict(hole_id=h, depth=d, azimuth=0.0, dip=-90.0) for h, _, _ in HOLES for d in (0.0, DEPTH)]
    return dict(collars=collars, survey=survey)


def grade_params(**nudge):
    n = int(DEPTH / STEP)
    samples = [dict(hole_id=h, **{"from": k * STEP, "to": (k + 1) * STEP}, value=round(grade_at(x, y, -(k + 0.5) * STEP), 4))
               for h, x, y in HOLES for k in range(n)]
    return dict(holes(), samples=samples, element="Cu", bounds=BOUNDS, seed=1234, **{**FAST_GRADE, **nudge})


def domain_params(**nudge):
    iv = []
    for h, x, y in HOLES:
        c = round(contact_depth(x, y), 1)
        iv += [dict(hole_id=h, **{"from": 0.0, "to": c}, value="SED"), dict(hole_id=h, **{"from": c, "to": DEPTH}, value="VOLC")]
    return dict(holes(), intervals=iv, target_values=["VOLC"], model="stationary", bounds=BOUNDS, seed=1234, **{**FAST_DOMAIN, **nudge})


def quiet(_f, _t):
    pass


def run(nudge_grade=None, nudge_domain=None):
    import time
    from geostrix_geoml.models import run_grade, run_domain
    t0 = time.time()
    g = run_grade(grade_params(**(nudge_grade or {})), quiet)
    t1 = time.time()
    d = run_domain(domain_params(**(nudge_domain or {})), quiet)
    t2 = time.time()
    gb, db = g["blocks"], d["blocks"]
    return dict(
        grade=dict(prediction=gb["prediction"], p10=gb.get("p10"), p90=gb.get("p90"), n=gb["n"], composites=g["composites"],
                   range_trained=g["range"]["trained"], seconds=round(t1 - t0, 1)),
        rock=dict(probability=db["probability"], z=db["z"], n=db["n"], fit=(d.get("fit") or {}), contacts=d["contacts"],
                  range_trained=d["range"]["trained"], seconds=round(t2 - t1, 1)))


def versions():
    from importlib.metadata import version
    out = {}
    for p in ("geoml", "tensorflow", "tensorflow-probability", "tf-keras", "numpy"):
        try:
            out[p] = version(p)
        except Exception:  # noqa: BLE001
            out[p] = None
    return out


def moves(a, b):
    """the largest differences between two runs: grade relative to the mean grade, P10 / P90 likewise, probability absolute"""
    import numpy as np
    mean = float(np.mean(a["grade"]["prediction"]))
    rel = lambda k: float(np.max(np.abs(np.asarray(a["grade"][k]) - np.asarray(b["grade"][k])))) / mean
    return dict(grade=rel("prediction"), p10=rel("p10"), p90=rel("p90"),
                probability=float(np.max(np.abs(np.asarray(a["rock"]["probability"]) - np.asarray(b["rock"]["probability"])))))


def load():
    with open(REF, encoding="utf-8") as fh:
        return json.load(fh)


def test_matches_reference():
    ref = load()
    tol = ref["tolerance"]
    got = run()
    m = moves(ref["result"], got)
    print(f"grade moved {m['grade']:.4f}, P10 {m['p10']:.4f}, P90 {m['p90']:.4f} (of the mean grade; tolerance {tol['grade_rel']}, "
          f"{tol['p10_p90_rel']}); probability {m['probability']:.4f} (tolerance {tol['probability']}); "
          f"{got['grade']['seconds']} s + {got['rock']['seconds']} s")
    where = f"stored with {ref['versions']}, now {versions()}"
    assert got["grade"]["n"] == ref["result"]["grade"]["n"] and got["rock"]["n"] == ref["result"]["rock"]["n"], "the block grid changed"
    assert m["grade"] <= tol["grade_rel"], f"grade moved {m['grade']:.4f} of the mean ({where})"
    assert max(m["p10"], m["p90"]) <= tol["p10_p90_rel"], f"P10 / P90 moved {max(m['p10'], m['p90']):.4f} of the mean ({where})"
    assert m["probability"] <= tol["probability"], f"the unit's probability moved {m['probability']:.4f} ({where})"


def test_reference_is_synthetic_and_stated():
    ref = load()
    assert ref["data"] == "synthetic" and all(h.startswith("SYN-") for h in ref["holes"])
    assert all(ref["tolerance"][k] > 0 for k in ("grade_rel", "p10_p90_rel", "probability"))
    # the stored models honour their input: grades in the data's range, VOLC likely in the deepest blocks and unlikely in the top ones
    import numpy as np
    pred = np.asarray(ref["result"]["grade"]["prediction"])
    assert 0.1 < pred.min() and pred.max() < 2.5, (pred.min(), pred.max())
    prob, z = np.asarray(ref["result"]["rock"]["probability"]), np.asarray(ref["result"]["rock"]["z"])
    deep, top = prob[z == z.min()].mean(), prob[z == z.max()].mean()
    assert deep > 0.7 and top < 0.3, (deep, top)


def measure():
    """the spread the tolerances are set from: a repeat of the same run (noise) and two nudges (real moves)"""
    a, b = run(), run()
    print("repeat:", moves(a, b), f"({a['grade']['seconds']} + {a['rock']['seconds']} s)")
    print("grade composite 5 -> 4 m, rock train_spacing 10 -> 8 m:", moves(a, run({"composite": 4}, {"train_spacing": 8})))
    print("iterations 150 -> 120 (both):", moves(a, run({"iterations": 120}, {"iterations": 120})))


def store(tol, why=None):
    """rewrite the reference; the one it replaces moves into "earlier" (its versions, its result, how far the new one moved from it and
    why: TASKS.csv #4046), so an update's moves stay on record next to the numbers that replaced them"""
    res = run()
    earlier = []
    if os.path.exists(REF):
        old = load()
        earlier = old.get("earlier") or []
        earlier.insert(0, dict(versions=old["versions"], result=old["result"], moved=moves(old["result"], res), why=why))
    ref = dict(note="TASKS.csv #4043 — geoML reference models (addons/geoml/tests/test_reference_geoml.py). Synthetic: 12 vertical holes.",
               data="synthetic", holes=[h for h, _, _ in HOLES], versions=versions(), bounds=BOUNDS, grade_settings=FAST_GRADE,
               rock_settings=FAST_DOMAIN, tolerance=tol, result=res, earlier=earlier)
    with open(REF, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(ref, fh, indent=1)
        fh.write("\n")
    print("stored", REF, ref["versions"], "moved from the last one:", earlier[0]["moved"] if earlier else None)


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
    if "--measure" in sys.argv:
        measure()
    elif "--store" in sys.argv:
        i = sys.argv.index("--store")
        store(json.loads(sys.argv[i + 1]), sys.argv[i + 2] if len(sys.argv) > i + 2 else None)
    else:
        test_matches_reference()
        test_reference_is_synthetic_and_stated()
        print("ALL PASSED")
