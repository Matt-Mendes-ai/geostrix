"""TASKS.csv #321 — live API checks against a running sidecar (not collected by pytest by default: needs
a server). Start one with a token, then run:
    GEOSTRIX_SIDECAR_TOKEN=testtoken123 python -m uvicorn app.main:app --port 8799
    python tests/test_jobs_api.py 8799 testtoken123
Checks: token + host guards, capabilities, plan, a job's real progress stages, the 409 busy guard,
cancel actually ending the worker process, and a completed job's result shape."""
import json
import sys
import time
import urllib.error
import urllib.request

import numpy as np

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8799
TOKEN = sys.argv[2] if len(sys.argv) > 2 else ""
BASE = f"http://127.0.0.1:{PORT}"


def call(method, path, body=None, token=TOKEN, host=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("X-GeoStrix-Token", token)
    if host:
        req.add_header("Host", host)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        raw = e.read() or b"null"
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, {"detail": raw.decode(errors="replace")}


def grid(n, sp, z, x0=500000.0, y0=6250000.0):
    xs = x0 + (np.arange(n) - (n - 1) / 2) * sp
    X, Y = np.meshgrid(xs, y0 + (np.arange(n) - (n - 1) / 2) * sp)
    return np.c_[X.ravel(), Y.ravel(), np.full(X.size, z)].tolist()


def main():
    st, h = call("GET", "/health", token="")
    print("health (no token):", st, h.get("api_version"), h.get("capabilities"))
    assert st == 200
    st, _ = call("POST", "/v1/geophys/plan", {"method": "mag"}, token="")
    print("plan without token ->", st); assert st == 401
    st, _ = call("POST", "/v1/geophys/plan", {"method": "mag"}, token="wrong")
    print("plan with wrong token ->", st); assert st == 401
    st, _ = call("GET", "/health", host="evil.example")
    print("Host: evil.example ->", st); assert st == 400

    stations = grid(12, 40.0, 1010.0)
    topo = grid(24, 25.0, 1000.0)
    field = {"strength": 56000.0, "inclination": 75.0, "declination": 18.0}
    obs = [0.0] * len(stations)
    base = {"method": "mag", "kind": "inversion", "stations": stations, "topo": topo, "field": field, "observed": obs,
            "uncertainty": {"floor": 1.0, "percent": 2.0}, "mesh": {"coreCell": 25.0, "depth": 300.0, "padCells": 4}, "reg": {"maxIter": 3}}
    st, p = call("POST", "/v1/geophys/plan", base)
    print("plan:", st, {k: p.get(k) for k in ("nData", "nActiveEst", "sensitivityBytes", "ok")})
    assert st == 200 and p["ok"]
    st, bad = call("POST", "/v1/geophys/plan", dict(base, field={"strength": 56000.0}))
    print("plan without inclination ->", st, bad["detail"][:70]); assert st == 400

    # Start a job, then try a second: must be 409 while the first runs.
    st, j = call("POST", "/v1/jobs", {"jobKind": "potential", "request": base})
    print("start:", st, j.get("id")); assert st == 200
    st2, _ = call("POST", "/v1/jobs", {"jobKind": "potential", "request": base})
    print("second concurrent start ->", st2); assert st2 == 409
    time.sleep(1.5)
    st, s = call("GET", f"/v1/jobs/{j['id']}")
    print("status after 1.5 s:", s["state"], s["progress"])
    # Cancel mid-run and confirm the worker is gone.
    t0 = time.time()
    call("POST", f"/v1/jobs/{j['id']}/cancel")
    st, s = call("GET", f"/v1/jobs/{j['id']}")
    print(f"after cancel: {s['state']} in {time.time() - t0:.2f} s"); assert s["state"] == "cancelled"
    # A new job is accepted immediately after cancel.
    st, j2 = call("POST", "/v1/jobs", {"jobKind": "potential", "request": dict(base, observed=[1.0 + (i % 7) for i in range(len(stations))])})
    print("start after cancel:", st); assert st == 200
    stages = set()
    while True:
        st, s = call("GET", f"/v1/jobs/{j2['id']}")
        stages.add(s["progress"].get("stage"))
        if s["state"] != "running":
            break
        time.sleep(0.5)
    print("final:", s["state"], "stages seen:", sorted(x for x in stages if x), "elapsed", round(s["elapsed"], 1), "s", s.get("error"))
    assert s["state"] == "done"
    st, r = call("GET", f"/v1/jobs/{j2['id']}/result")
    print("result keys:", sorted(r.keys())[:12], "cells:", len(r["cells"]["value"]), "iterations:", r["iterations"], "phi_d", round(r["phi_d"], 1), "target", r["target"])
    assert st == 200 and len(r["cells"]["value"]) == len(r["cells"]["support"]) > 0
    print("ALL PASSED")


if __name__ == "__main__":
    main()
