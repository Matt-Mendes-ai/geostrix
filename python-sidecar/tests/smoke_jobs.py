"""TASKS.csv #557 — one small job of every kind against a RUNNING engine, to catch what only breaks in the frozen
(PyInstaller) build: a module PyInstaller didn't collect, missing package metadata (#321's first frozen build
reported "simpeg: null"), a child process that can't start (multiprocessing.freeze_support). The physics is
tested elsewhere (test_potential / test_dcip2d / test_implicit_faults); here each job only has to FINISH and
return a result of the right shape. Standard library only, so it runs with any Python.

    python tests/smoke_jobs.py PORT TOKEN       (e.g. 8765 and the GEOSTRIX_SIDECAR_TOKEN the engine was started with)
"""
import json
import sys
import time
import urllib.error
import urllib.request

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
TOKEN = sys.argv[2] if len(sys.argv) > 2 else ""
BASE = f"http://127.0.0.1:{PORT}"
JOB_TIMEOUT_S = 300


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if TOKEN:
        req.add_header("X-GeoStrix-Token", TOKEN)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        raw = e.read() or b"null"
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, {"detail": raw.decode(errors="replace")}


def wait_for_health(limit_s=180):
    t0 = time.time()
    while time.time() - t0 < limit_s:
        try:
            st, h = call("GET", "/health")
            if st == 200:
                return h, time.time() - t0
        except OSError:
            pass
        time.sleep(1)
    raise SystemExit(f"FAIL: no /health answer on port {PORT} within {limit_s} s")


def run_job(kind, request):
    t0 = time.time()
    st, j = call("POST", "/v1/jobs", {"jobKind": kind, "request": request})
    assert st == 200 and j.get("id"), f"{kind}: start -> {st} {j}"
    while True:
        st, s = call("GET", f"/v1/jobs/{j['id']}")
        assert st == 200, f"{kind}: status -> {st} {s}"
        if s["state"] != "running":
            break
        if time.time() - t0 > JOB_TIMEOUT_S:
            call("POST", f"/v1/jobs/{j['id']}/cancel")
            raise AssertionError(f"{kind}: still running after {JOB_TIMEOUT_S} s")
        time.sleep(0.5)
    assert s["state"] == "done", f"{kind}: ended {s['state']}: {s.get('error')}"
    st, r = call("GET", f"/v1/jobs/{j['id']}/result")
    assert st == 200 and isinstance(r, dict), f"{kind}: result -> {st}"
    print(f"  {kind}: done in {time.time() - t0:.1f} s")
    return r


def grid(n, sp, z, x0=500000.0, y0=6250000.0):
    out = []
    for i in range(n):
        for k in range(n):
            out.append([x0 + (k - (n - 1) / 2) * sp, y0 + (i - (n - 1) / 2) * sp, z])
    return out


def main():
    h, waited = wait_for_health()
    caps = h.get("capabilities", {})
    print(f"health after {waited:.0f} s: api {h.get('api_version')}, capabilities {json.dumps(caps)}")
    pf, dc = caps.get("potentialFields", {}), caps.get("dcip2d", {})
    assert pf.get("available") and pf.get("simpeg") and pf.get("discretize") and pf.get("choclo"), f"potential fields not fully available: {pf}"
    assert dc.get("available") and dc.get("simpeg"), f"DC/IP not available: {dc}"

    # GemPy implicit model: one dipping surface, a coarse grid
    implicit = {
        "extent": [0, 1000, 0, 1000, -600, 0],
        "surfaces": [{"name": "contact",
                      "points": [{"x": 200, "y": 200, "z": -200}, {"x": 800, "y": 200, "z": -350}, {"x": 500, "y": 800, "z": -275}],
                      "orientations": [{"x": 500, "y": 500, "z": -275, "dip": 15, "azimuth": 90}]}],
        "resolution": [12, 12, 12],
    }
    r = run_job("implicit", implicit)
    meshes = r.get("surfaces") or []
    assert meshes and len(meshes[0].get("vertices") or []) > 0, f"implicit: no mesh in {list(r)[:8]}"

    # 2D DC/IP: a short dipole-dipole line over a uniform half-space, two iterations
    rows = [[a, a + 20, a + 20 + n * 20, a + 40 + n * 20] for a in range(0, 200, 10) for n in (1, 2, 3) if a + 40 + n * 20 <= 300]
    dcip = {"readings": rows, "rho": [100.0 + (i % 5) for i in range(len(rows))], "chargeability": [5.0 + (i % 3) for i in range(len(rows))],
            "mesh": {"cell": 5.0, "depth": 60.0}, "uncertainty": {"percent": 5, "floor": 0.0},
            "ipUncertainty": {"percent": 5, "floor": 0.5}, "maxIter": 2}
    r = run_job("dcip2d", dcip)
    assert len((r.get("cells") or {}).get("resistivity") or []) > 0, f"dcip2d: no cells in {list(r)[:8]}"

    # SimPEG magnetic inversion: a small grid, two iterations
    stations = grid(8, 40.0, 1010.0)
    pot = {"method": "mag", "kind": "inversion", "stations": stations, "topo": grid(16, 25.0, 1000.0),
           "field": {"strength": 56000.0, "inclination": 75.0, "declination": 18.0},
           "observed": [1.0 + (i % 7) for i in range(len(stations))], "uncertainty": {"floor": 1.0, "percent": 2.0},
           "mesh": {"coreCell": 25.0, "depth": 200.0, "padCells": 3}, "reg": {"maxIter": 2}}
    r = run_job("potential", pot)
    cells = r.get("cells") or {}
    assert len(cells.get("value") or []) == len(cells.get("support") or []) > 0, "potential: no cells"
    print("SMOKE PASSED")


if __name__ == "__main__":
    main()
