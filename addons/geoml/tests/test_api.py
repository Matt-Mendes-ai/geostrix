"""TASKS.csv #694 — live API checks against a running geoML add-on (as python-sidecar/tests/test_jobs_api.py does for the
engine; not collected by pytest: it needs a server). Start one with a token and a port, then run:
    set GEOSTRIX_ADDON_TOKEN=testtoken123 & set GEOSTRIX_ADDON_PORT=8791 & python run_addon.py      (or the built exe)
    python tests/test_api.py 8791 testtoken123
Checks: the identity proof (HMAC of a nonce, #667), the token and Host guards, the request kinds, 404 for an unknown job
or result (a 404, not a 500: the app reads 404 as "the add-on restarted"), the 409 busy guard naming the running job,
cancel, and a job with unusable input ending as an error with a message instead of taking the server down.
Standard library only, so it runs without the add-on's own dependencies."""
import hashlib
import hmac
import json
import sys
import time
import urllib.error
import urllib.request

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8791
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


def wait_until_up(seconds=120):
    t0 = time.time()
    while time.time() - t0 < seconds:
        try:
            st, _ = call("GET", "/health", token="")
            if st == 200:
                return
        except OSError:
            pass
        time.sleep(1)
    raise SystemExit(f"the add-on did not answer on port {PORT} within {seconds} s")


def main():
    wait_until_up()
    # identity: /health needs no token, and proves it holds ours by HMAC-SHA256(token, nonce)
    nonce = "a1b2c3d4e5f60718293a4b5c"
    st, h = call("GET", f"/health?nonce={nonce}", token="")
    print("health:", st, h.get("version"), h.get("api_version"), h.get("features"))
    assert st == 200 and h.get("addon") == "geoml"
    if TOKEN:
        assert h.get("proof") == hmac.new(TOKEN.encode(), nonce.encode(), hashlib.sha256).hexdigest(), "wrong identity proof"
        st, h2 = call("GET", f"/health?nonce={'x' * 200}", token="")
        assert st == 200 and "proof" not in h2, "an over-long nonce gets no proof"
        # the token guard
        st, _ = call("POST", "/v1/jobs", {"kind": "grade", "params": {}}, token="")
        print("job without token ->", st); assert st == 401
        st, _ = call("POST", "/v1/jobs", {"kind": "grade", "params": {}}, token="wrong")
        print("job with a wrong token ->", st); assert st == 401
    # DNS rebinding guard
    st, _ = call("GET", "/health", host="evil.example")
    print("Host: evil.example ->", st); assert st == 400
    # request checks
    st, b = call("POST", "/v1/jobs", {"kind": "nope", "params": {}})
    print("unknown kind ->", st, b.get("detail")); assert st == 400
    st, b = call("GET", "/v1/jobs/doesnotexist")
    print("unknown job ->", st, b.get("detail")); assert st == 404, f"expected 404, got {st}: {b}"
    st, b = call("GET", "/v1/jobs/doesnotexist/result")
    print("unknown result ->", st, b.get("detail")); assert st == 404, f"expected 404, got {st}: {b}"
    st, b = call("POST", "/v1/jobs/doesnotexist/cancel", {})
    print("cancel unknown ->", st, b); assert st == 200 and b == {"cancelled": False}

    # one job at a time: a second start while the first runs is 409 and names the running job; cancel ends it
    st, j = call("POST", "/v1/jobs", {"kind": "grade", "params": {}})
    print("start:", st, j.get("id"), j.get("state")); assert st == 200 and j["state"] == "running"
    st2, b2 = call("POST", "/v1/jobs", {"kind": "domain", "params": {}})
    print("second start ->", st2, (b2.get("job") or {}).get("id"))
    if st2 == 409:
        assert b2["job"]["id"] == j["id"], b2
    else:  # the first job already ended (its input is unusable and the worker started fast): nothing is busy
        st, s = call("GET", f"/v1/jobs/{j['id']}")
        assert st2 == 200 and s["state"] != "running", (st2, s)
        j = b2
    st, c = call("POST", f"/v1/jobs/{j['id']}/cancel", {})
    st, s = call("GET", f"/v1/jobs/{j['id']}")
    print("after cancel:", c, s["state"])
    assert s["state"] in ("cancelled", "error")  # error: it ended on its own before the cancel arrived
    st, b = call("GET", f"/v1/jobs/{j['id']}/result")
    assert st == 404, "no result for a job that did not finish"

    # a job with unusable input ends as an error with a message; the server keeps answering
    st, j = call("POST", "/v1/jobs", {"kind": "grade", "params": {}})
    assert st == 200, (st, j)
    t0 = time.time()
    while True:
        st, s = call("GET", f"/v1/jobs/{j['id']}")
        if s["state"] != "running" or time.time() - t0 > 300:
            break
        time.sleep(1)
    print("unusable input:", s["state"], "-", (s.get("error") or "")[:120])
    assert s["state"] == "error" and s.get("error"), s
    st, _ = call("GET", "/health", token="")
    assert st == 200
    print("ALL PASSED")


if __name__ == "__main__":
    main()
