"""TASKS.csv #4027 — GemPy's field evaluation on several threads gives the same model, bit for bit. Run: venv python tests/test_gempy_threads.py
An erosional two-top stack with a fault and check points, solved with one evaluation thread and with four: the meshes, the lithology
block and the units at the check points must be identical (the 40^3 block alone is several of GemPy's evaluation chunks)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.main import implicit_model, ImplicitModelRequest  # noqa: E402
from app import gempy_threads  # noqa: E402


def _req():
    top = {"name": "top", "points": [{"x": x, "y": y, "z": 600.0 + 0.05 * x} for x in (100, 250, 400, 450) for y in (200, 500, 800)]
           + [{"x": x, "y": y, "z": 500.0 + 0.05 * x} for x in (550, 600, 750, 900) for y in (200, 500, 800)],
           "orientations": [{"x": 250, "y": 500, "z": 612, "dip": 3, "azimuth": 270}, {"x": 750, "y": 500, "z": 537, "dip": 3, "azimuth": 270}]}
    cover = {"name": "cover", "points": [{"x": x, "y": y, "z": 800.0 - 0.02 * y} for x in (100, 300, 700, 900) for y in (200, 800)],
             "orientations": [{"x": 500, "y": 500, "z": 790, "dip": 1, "azimuth": 180}]}
    fault = {"name": "F1", "points": [{"x": 500.0, "y": y, "z": z} for y in (200, 500, 800) for z in (200, 500, 800)],
             "orientations": [{"x": 500, "y": 500, "z": 500, "dip": 80, "azimuth": 90}]}
    check = [[x, y, z] for x in range(25, 1000, 50) for y in range(25, 1000, 100) for z in range(50, 1000, 100)]
    return ImplicitModelRequest(extent=[0, 1000, 0, 1000, 0, 1000], surfaces=[cover, top], faults=[fault], resolution=[40, 40, 40],
                                relation="erode", return_block=True, evaluate_at=check)


def test_threads_change_nothing():
    gempy_threads.install(1)
    one = implicit_model(_req())
    assert gempy_threads.install(4) == 4
    four = implicit_model(_req())
    gempy_threads.install(1)
    names = [s.name for s in one.surfaces]
    print(f"meshes {names}, vertices {[len(s.vertices) for s in one.surfaces]}, block {len(one.block['ids'])}, check {len(one.evaluated)}")
    assert names == [s.name for s in four.surfaces] == ["F1", "cover", "top"]
    for a, b in zip(one.surfaces, four.surfaces):
        assert a.vertices == b.vertices and a.faces == b.faces, a.name
    assert one.block["ids"] == four.block["ids"]
    assert one.evaluated == four.evaluated


def test_thread_rule():
    os.environ["GEOSTRIX_GEMPY_THREADS"] = "3"
    assert gempy_threads.eval_threads() == 3
    os.environ["GEOSTRIX_GEMPY_THREADS"] = "x"
    n = gempy_threads.eval_threads()
    del os.environ["GEOSTRIX_GEMPY_THREADS"]
    assert n == max(1, min(4, (os.cpu_count() or 2) // 2)) == gempy_threads.eval_threads()


if __name__ == "__main__":
    test_threads_change_nothing()
    test_thread_rule()
    print("ok")
