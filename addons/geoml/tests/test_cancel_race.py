"""TASKS.csv #4057 — cancel a job and start another at once: the new job must finish. Cancel kills the worker process and the next job
starts a fresh one; the killed worker's output pump, seeing its process gone, used to fail whatever job was running then, which was
the new one ("The modelling process stopped unexpectedly (exit code -15)"). A stand-in worker replaces geoML here (no TensorFlow), so
this runs in a few seconds with any Python that has the add-on's server packages (fastapi):
    python tests/test_cancel_race.py"""
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))


def stand_in_worker(inbox, outbox):
    """the worker's protocol (server._worker) without geoML: each job sleeps params["sleep"] seconds and is done"""
    while True:
        jid, kind, params = inbox.get()
        time.sleep(float(params.get("sleep", 0)))
        outbox.put((jid, "done", {"kind": kind, "slept": params.get("sleep", 0)}))


def wait(manager, jid, seconds):
    t0 = time.time()
    while manager.jobs[jid]["state"] == "running" and time.time() - t0 < seconds:
        time.sleep(0.1)
    return manager.jobs[jid]


def test_cancel_then_start_at_once():
    from geostrix_geoml import server
    server._worker = stand_in_worker
    m = server.Jobs()
    first = m.start("grade", {"sleep": 60})
    time.sleep(1.5)  # the first worker is up and busy
    assert m.cancel(first["id"])
    second = m.start("grade", {"sleep": 0.5})  # at once: a fresh worker, while the killed one's pump still watches
    assert second.get("worker") is not first.get("worker") or "worker" not in second
    end = wait(m, second["id"], 30)
    assert end["state"] == "done", f"the new job ended '{end['state']}': {end.get('error')}"
    assert m.jobs[first["id"]]["state"] == "cancelled"
    # and a worker that really dies still fails its own job
    third = m.start("grade", {"sleep": 60})
    time.sleep(1.0)
    m.proc.kill()
    end = wait(m, third["id"], 10)
    assert end["state"] == "error" and "stopped unexpectedly" in end["error"], end
    print("ALL PASSED")


if __name__ == "__main__":
    test_cancel_then_start_at_once()
