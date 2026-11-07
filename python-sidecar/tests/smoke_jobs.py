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

    # TASKS.csv #1986 — 1D FDEM: three DUALEM-style soundings over a 10 mS/m ground (numba's parallel kernel must run frozen)
    em = {"coils": [{"geom": g, "sep": s, "freq": 9000.0} for g, s in (("HCP", 1.0), ("PRP", 1.1), ("HCP", 2.0), ("PRP", 2.1), ("HCP", 4.0), ("PRP", 4.1))],
          "height": 0.75, "kind": "eca", "data": [[5.4, 1.9, 7.6, 4.2, 8.6, 6.5]] * 3, "errRel": 0.1, "errAbs": 0.1,
          "layers": {"n": 12, "first": 0.3, "bottom": 12.0}, "lateral": 1.0, "line": [0, 0, 0], "x": [0.0, 1.0, 2.0], "y": [0.0, 0.0, 0.0]}
    r = run_job("em1d", em)
    assert len(r.get("condMs") or []) == 3 and all(v is not None for v in r["condMs"][1]), f"em1d: {list(r)[:8]}"

    # TASKS.csv #1985 — Boule's normal gravity and Harmonica's prism layer (gravred), Verde's SplineCV (spline): frozen, they need
    # their submodules and metadata; a flat 500 m terrain of 21 x 21 nodes at 1 km
    import base64, struct
    terr = {"nx": 21, "ny": 21, "dx": 1000.0, "dy": 1000.0, "x0": 0.0, "yTop": 20000.0,
            "values": base64.b64encode(struct.pack("<441f", *([500.0] * 441))).decode()}
    gr = {"op": "gravred", "input": "observed", "correction": "topo", "density": 2670, "lon": [18.5, 18.6], "lat": [-33.5, -33.6],
          "height": [500.0, 500.0], "g": [979500.0, 979510.0], "terrain": terr, "easting": [10000.0, 11000.0], "northing": [10000.0, 9000.0]}
    r = run_job("pfields", gr)
    assert len(r.get("bouguer") or []) == 2 and 40 < r["correctionMgal"][0] < 56, f"gravred: {r.get('correctionMgal')}"
    sp = {"op": "spline", "x": [float(i % 6) * 50 for i in range(36)], "y": [float(i // 6) * 50 for i in range(36)],
          "value": [float(i % 6 + i // 6) for i in range(36)], "nx": 11, "ny": 11, "cell": 25.0, "x0": 0.0, "yTop": 250.0}
    r = run_job("pfields", sp)
    assert r.get("values") and r.get("points") == 36, f"spline: {list(r)[:8]}"
    print("SMOKE PASSED")


if __name__ == "__main__":
    main()
