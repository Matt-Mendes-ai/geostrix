"""TASKS.csv #3124 — the gridding jobs keep their process warm for a few idle minutes (Matt's decision 2026-11-12).

Plain script (no pytest in the venv), run from python-sidecar/:  python tests/test_warm_jobs.py
Drives the real JobManager with a short idle time (GEOSTRIX_WARM_IDLE_S=8): an equivalent-source job, a second one handed to the same
process (its result says warmEngine, and it skips the ~20 s import), then, after the idle time, a third one in a fresh process; an
inversion-kind job retires a warm worker first.
"""
import os
import sys
import time

os.environ["GEOSTRIX_WARM_IDLE_S"] = "8"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np  # noqa: E402


def eqs_req():
    x = np.repeat(np.linspace(806300, 808300, 21), 41)
    y = np.tile(np.linspace(7507600, 7509600, 41), 21)
    v = 55000 + 300 * np.exp(-((x - 807300) ** 2 + (y - 7508600) ** 2) / 2e5)
    return {"op": "eqs", "x": x.tolist(), "y": y.tolist(), "z": [442.0] * x.size, "value": v.tolist(), "cell": 100, "elevation": 442,
            "depth": 120, "blank": 300, "region": [806300, 808300, 7507600, 7509600]}


def run(manager, kind, req, timeout=300):
    t0 = time.perf_counter()
    jid = manager.start(kind, req)
    assert jid, "the slot was busy"
    while manager.status(jid)["state"] == "running":
        if time.perf_counter() - t0 > timeout:
            raise AssertionError("timed out")
        time.sleep(0.2)
    st = manager.status(jid)
    assert st["state"] == "done", st
    return manager.result(jid), manager._job["proc"].pid, time.perf_counter() - t0


def main():
    from app.jobs import JobManager, WARM_IDLE_S
    assert WARM_IDLE_S == 8.0
    m = JobManager()
    r1, pid1, s1 = run(m, "pfields", eqs_req())
    assert r1["warmEngine"] is False and r1["timings"]["load"] > 0, r1["timings"]
    r2, pid2, s2 = run(m, "pfields", eqs_req())
    assert pid2 == pid1, "the same process"
    assert r2["warmEngine"] is True and r2["timings"]["load"] == 0.0, r2["timings"]
    print(f"first run {s1:.1f} s (engine load {r1['timings']['load']} s), second {s2:.1f} s in the same process (load {r2['timings']['load']} s)")
    time.sleep(WARM_IDLE_S + 3)
    assert not m._warm["proc"].is_alive(), "the warm worker exits after its idle time"
    r3, pid3, s3 = run(m, "pfields", eqs_req())
    assert pid3 != pid1 and r3["warmEngine"] is False
    print(f"after {WARM_IDLE_S:.0f} s idle the worker had exited; the next run started a fresh process ({s3:.1f} s)")
    # another kind retires the warm worker before it starts (its memory back first)
    warm = m._warm["proc"]
    assert warm.is_alive()
    jid = m.start("em1d", {})  # fails at once (no soundings): enough to see the warm worker retired
    deadline = time.time() + 30
    while m.status(jid)["state"] == "running" and time.time() < deadline:
        time.sleep(0.2)
    assert not warm.is_alive() and m._warm is None, "retired"
    print("an inversion-kind job retired the warm worker first")
    print("ok")


if __name__ == "__main__":
    main()
