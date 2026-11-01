# GeoStrix predictive-modelling add-on (TASKS.csv #638) — local HTTP server around the geoML models.
# Copyright (C) 2026 Matt Mendes. GNU GPL v3 (see ../LICENSE).
#
# Same rules as GeoStrix's own Python engine (python-sidecar/app/main.py): 127.0.0.1 only, a per-launch token in
# X-GeoStrix-Token (from GEOSTRIX_ADDON_TOKEN; none needed when unset, for a developer running it by hand), a Host
# check against DNS rebinding, a request-size cap, one job at a time. Jobs run in a separate worker process (below).
import hashlib
import hmac
import multiprocessing as mp
import os
import queue
import re
import threading
import time
import traceback
import uuid
from importlib import metadata

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

ADDON_VERSION = "0.1.3"
# TASKS.csv #692 — what this add-on can do, so GeoStrix asks instead of guessing from the version string
API_VERSION = 2
FEATURES = ["trend", "trained_range", "identity_proof", "data_warnings", "idle_exit", "max_inducing", "focus_sampling", "held_out_check"]
IDLE_EXIT_S = 600  # #698 — the warm worker (TensorFlow, ~600 MB) exits after 10 idle minutes
_TOKEN = os.environ.get("GEOSTRIX_ADDON_TOKEN") or None
MAX_BODY_BYTES = 60 * 1024 * 1024
# TASKS.csv #745 — the app's own origins only (see python-sidecar/app/main.py), not "*".
_ORIGIN_RE = r"^(app://geostrix|http://(localhost|127\.0\.0\.1):517\d)$"


def _cors(request):
    origin = request.headers.get("origin", "")
    return {"Access-Control-Allow-Origin": origin, "Vary": "Origin"} if re.match(_ORIGIN_RE, origin) else {}

app = FastAPI(title="GeoStrix predictive modelling (geoML)")
app.add_middleware(CORSMiddleware, allow_origin_regex=_ORIGIN_RE, allow_methods=["GET", "POST"], allow_headers=["*"])
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost"])


@app.middleware("http")
async def _guard(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)
    cl = request.headers.get("content-length")
    try:
        n = int(cl) if cl is not None else None
    except ValueError:
        return JSONResponse(status_code=400, content={"detail": "Content-Length is not a number."}, headers=_cors(request))
    if request.method == "POST" and (n is None or n > MAX_BODY_BYTES):
        return JSONResponse(status_code=413, content={"detail": f"Request body missing a length or larger than {MAX_BODY_BYTES // 2 ** 20} MB."}, headers=_cors(request))
    if _TOKEN and request.url.path != "/health":
        if not hmac.compare_digest(request.headers.get("x-geostrix-token", ""), _TOKEN):
            return JSONResponse(status_code=401, content={"detail": "Missing or wrong add-on token."}, headers=_cors(request))
    return await call_next(request)


def _version(dist):
    try:
        return metadata.version(dist)
    except Exception:
        return None


# ---------- jobs: a warm worker process ----------
# The worker imports TensorFlow + geoML once (20-40 s) and then runs job after job, so only the first model of a
# session pays for it. Cancel terminates the worker (every byte of its memory goes back to the system) and the next job
# starts a fresh one. The parent never imports TensorFlow, so /health answers at once.
def _worker(inbox, outbox):
    def watch_parent():  # the add-on server died (app quit / killed): don't live on holding gigabytes
        parent = mp.parent_process()
        while True:
            time.sleep(2)
            if parent is None or not parent.is_alive():
                os._exit(0)
    threading.Thread(target=watch_parent, daemon=True).start()
    models = None
    while True:
        try:
            jid, kind, params = inbox.get(timeout=IDLE_EXIT_S if models is not None else None)
        except queue.Empty:  # #698 — idle: give the memory back; the next job starts a fresh worker
            os._exit(0)
        try:
            if models is None:
                outbox.put((jid, "progress", 0.01, "Starting TensorFlow and geoML (first model of the session)"))
                from geostrix_geoml import models as _m
                models = _m
            result = models.JOBS[kind](params, lambda f, text, jid=jid: outbox.put((jid, "progress", float(f), str(text))))
            outbox.put((jid, "done", result))
        except Exception as e:  # noqa: BLE001 — every failure goes back to GeoStrix with its message
            # #691 — a ValueError / RuntimeError is a message for the user, not a Python class name
            msg = str(e) if isinstance(e, (ValueError, RuntimeError)) and str(e) else f"{type(e).__name__}: {e}"
            outbox.put((jid, "error", msg, traceback.format_exc()[-4000:]))


class Jobs:
    def __init__(self):
        self.jobs, self.lock = {}, threading.Lock()
        self.proc = self.inbox = self.outbox = None
        self.ctx = mp.get_context("spawn")

    def running(self):
        return next((j for j in self.jobs.values() if j["state"] == "running"), None)

    def _ensure_worker(self):
        if self.proc is not None and self.proc.is_alive():
            return
        self.inbox, self.outbox = self.ctx.Queue(), self.ctx.Queue()
        self.proc = self.ctx.Process(target=_worker, args=(self.inbox, self.outbox), daemon=True)
        self.proc.start()
        threading.Thread(target=self._pump, args=(self.proc, self.outbox), daemon=True).start()

    def start(self, kind, params):
        with self.lock:
            self._ensure_worker()
            jid = uuid.uuid4().hex[:12]
            job = {"id": jid, "kind": kind, "state": "running", "progress": 0.0, "message": "Queued", "started": time.time(), "result": None, "error": None}
            self.jobs[jid] = job
            self.inbox.put((jid, kind, params))
        return job

    def _pump(self, proc, outbox):
        while True:
            try:
                msg = outbox.get(timeout=1)
            except queue.Empty:
                if not proc.is_alive():
                    for j in self.jobs.values():
                        if j["state"] == "running":
                            # #689 — say what is known: the exit code, and the two usual causes (on a budget laptop a CPU
                            # without AVX kills TensorFlow at import, which "out of memory?" used to misdiagnose)
                            j.update(state="error", error=f"The modelling process stopped unexpectedly (exit code {proc.exitcode}). Usual causes: not enough free memory, or a processor without AVX, which TensorFlow needs (some budget Celeron / Pentium chips). The add-on's log has the details.")
                    return
                continue
            job = self.jobs.get(msg[0])
            if not job or job["state"] != "running":
                continue
            if msg[1] == "progress":
                job["progress"], job["message"] = msg[2], msg[3]
            elif msg[1] == "done":
                job.update(state="done", result=msg[2], progress=1.0, message="Done")
            elif msg[1] == "error":
                job.update(state="error", error=msg[2], trace=msg[3])

    def cancel(self, jid):
        job = self.jobs.get(jid)
        if not job or job["state"] != "running":
            return False
        job.update(state="cancelled", message="Cancelled")
        with self.lock:
            if self.proc is not None:
                self.proc.terminate()
                self.proc = None
        return True


manager = Jobs()


def _public(job):
    return {k: job.get(k) for k in ("id", "kind", "state", "progress", "message", "error")} | {"elapsed": round(time.time() - job["started"], 1)}


@app.get("/health")
def health(nonce: str | None = None):
    # TASKS.csv #667 — identity proof, as GeoStrix's own engine does (#353): HMAC-SHA256 of the app's nonce keyed with the
    # per-launch token. The app checks it BEFORE sending the token or any project data, so a different program holding
    # the port never receives either (the earlier check sent the token first and accepted anything but a 401).
    proof = hmac.new(_TOKEN.encode(), nonce.encode(), hashlib.sha256).hexdigest() if (_TOKEN and nonce and len(nonce) <= 128) else None
    return {"ok": True, "addon": "geoml", "version": ADDON_VERSION, "api_version": API_VERSION, "features": FEATURES, "geoml": _version("geoml"),
            "busy": manager.running() is not None, "warm": manager.proc is not None and manager.proc.is_alive(), **({"proof": proof} if proof else {})}


@app.post("/v1/jobs")
async def submit(request: Request):
    body = await request.json()
    kind = body.get("kind")
    if kind not in ("domain", "grade"):
        return JSONResponse(status_code=400, content={"detail": "kind must be 'domain' or 'grade'."}, headers=_cors(request))
    busy = manager.running()
    if busy:
        return JSONResponse(status_code=409, content={"detail": "A predictive model is already running — wait for it or cancel it first.", "job": _public(busy)}, headers=_cors(request))
    return _public(manager.start(kind, body.get("params") or {}))


# TASKS.csv #694 — `request` was not a parameter of these two, so the 404 path raised NameError and answered 500: the app
# reads a 404 as "the add-on restarted, the job is gone" and says so; a 500 only counted as a missed poll
@app.get("/v1/jobs/{jid}")
def status(jid: str, request: Request):
    job = manager.jobs.get(jid)
    return _public(job) if job else JSONResponse(status_code=404, content={"detail": "No such job."}, headers=_cors(request))


@app.get("/v1/jobs/{jid}/result")
def result(jid: str, request: Request):
    job = manager.jobs.get(jid)
    if not job or job["state"] != "done":
        return JSONResponse(status_code=404, content={"detail": "No finished result for this job."}, headers=_cors(request))
    return job["result"]


@app.post("/v1/jobs/{jid}/cancel")
def cancel(jid: str):
    return {"cancelled": manager.cancel(jid)}
