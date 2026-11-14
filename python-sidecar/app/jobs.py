"""TASKS.csv #321 — long-running job manager for the sidecar (SimPEG inversions).

Why not the synchronous request pattern /implicit-model uses (TASKS #231): there, "Cancel" only aborts the
renderer's fetch — the sync FastAPI handler keeps computing in its threadpool, holding the CPU and its RAM
until it finishes. For an inversion holding a sensitivity matrix of up to ~1.5 GB that is not acceptable
on an 8 GB laptop. So each job runs in its OWN PROCESS (multiprocessing, spawn): progress comes back over a
queue, and cancel terminates the process, which hands every byte back to the OS at once.

One job at a time (a second submission gets 409): two concurrent inversions — or an inversion plus a GemPy
run — would compete for the same RAM budget the plan step promised.

The child is the only process that imports SimPEG/numba (measured: 2.4-6.1 s from source, 4.1-4.4 s frozen,
plus ~1.5 s of choclo JIT per job — choclo keeps no on-disk cache), so the sidecar parent's
start-up and idle footprint are unchanged for users who never run an inversion.
"""
import ctypes
import multiprocessing as mp
import os
import queue
import sys
import threading
import time
import traceback
import uuid

# TASKS.csv #3124 (Matt's decision 2026-11-12, "keep warm a few minutes"; measured in #2955: a 1,701-station equivalent-source grid spent 19-24 s
# importing Harmonica / Verde and 3-4 s fitting) — the gridding jobs (kind "pfields": equivalent sources, Euler, spline, gravity reductions)
# keep their process after the job: it waits up to WARM_IDLE_S for the next gridding job, then exits and hands its memory back. Inversions and
# the other kinds keep #321's one process per job, and starting one retires an idle warm worker first.
# TASKS.csv #3281 (review #3195, Galore Creek: a 14-point surface took 33-41 s) — the implicit model (GemPy) too: measured on this machine, a
# 14-point surface spent 2.5-14 s importing GemPy (warm / cold disk), 9.3 s on its first solve and 3.7 s on a second solve in the same process.
WARM_KINDS = {"pfields", "implicit"}
WARM_IDLE_S = float(os.environ.get("GEOSTRIX_WARM_IDLE_S", "180"))
WARM_MARGIN_S = min(15.0, WARM_IDLE_S / 3)  # the parent reuses a warm worker only while it is clearly still waiting


def total_ram_bytes():
    try:
        if sys.platform == "win32":
            class MEMORYSTATUSEX(ctypes.Structure):
                _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                            ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                            ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                            ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                            ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]
            st = MEMORYSTATUSEX()
            st.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(st))
            return int(st.ullTotalPhys)
        return int(os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES"))
    except Exception:
        return 8 * 1024 ** 3


def available_ram_bytes():
    try:
        if sys.platform == "win32":
            class MEMORYSTATUSEX(ctypes.Structure):
                _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                            ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                            ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                            ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                            ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]
            st = MEMORYSTATUSEX()
            st.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(st))
            return int(st.ullAvailPhys)
        return int(os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_AVPHYS_PAGES"))
    except Exception:
        return total_ram_bytes() // 2


# Sensitivity-matrix budget: at most 1.5 GB and 20% of physical RAM, AND bounded by what is FREE right now
# (performance review): a 1.5 GB matrix is fine on an idle 8 GB
# laptop and not with a browser holding 5 GB. Peak RAM is ~1.25 x the matrix + 0.4 GB (measured), so the
# matrix may take at most ~60% of free memory.
def sensitivity_cap_bytes():
    return int(max(50e6, min(1.5e9, 0.20 * total_ram_bytes(), 0.6 * (available_ram_bytes() - 0.4e9) / 1.25)))


def _watch_parent():
    # If the sidecar dies (app quit, crash, or Electron's kill() — TerminateProcess on Windows, which does NOT
    # take child processes with it), this job must not live on as an orphan holding up to ~1.5 GB of RAM.
    parent = mp.parent_process()
    while True:
        time.sleep(2)
        if parent is None or not parent.is_alive():
            os._exit(0)


def _child(kind, req, q, cap, inbox=None, idle_s=0.0):
    threading.Thread(target=_watch_parent, daemon=True).start()
    # Leave headroom for the UI and the renderer: numba defaults to every LOGICAL core (8 on a 4-core
    # hyper-threaded laptop), which starves them. Physical cores minus one (approximated as logical/2 - 1,
    # at least 2) — building the matrix still gets most of its measured 2.6x parallel speed-up.
    logical = os.cpu_count() or 2
    n = max(2, logical // 2 - 1) if logical >= 4 else 1
    os.environ.setdefault("NUMBA_NUM_THREADS", str(n))
    os.environ.setdefault("OMP_NUM_THREADS", str(n))
    warm = False
    while True:
        _run_once(kind, req, q, cap, warm)
        if inbox is None:
            return
        # #3124 — a warm worker: the next gridding job, or exit after WARM_IDLE_S idle (None: retire now)
        try:
            req = inbox.get(timeout=idle_s)
        except queue.Empty:
            return
        if req is None:
            return
        warm = True


def _run_once(kind, req, q, cap, warm=False):
    try:
        if kind == "potential":
            from app.geophys.potential import run_job
            out = run_job(req, lambda ev: q.put(("progress", ev)), cap)
        elif kind == "dcip2d":  # TASKS.csv #322
            from app.geophys.dcip2d import run_job as run_dcip
            out = run_dcip(req, lambda ev: q.put(("progress", ev)))
        elif kind == "dcip3d":  # TASKS.csv #643
            from app.geophys.dcip3d import run_job as run_dcip3d
            out = run_dcip3d(req, lambda ev: q.put(("progress", ev)), cap)
        elif kind == "pfields":  # TASKS.csv #1985 — Harmonica: Euler deconvolution, equivalent sources
            from app.geophys.pfields import run_job as run_pfields
            out = run_pfields(req, lambda ev: q.put(("progress", ev)))
            if isinstance(out, dict):
                out = {**out, "warmEngine": warm}  # #3124 — the engine was still loaded from a recent run
        elif kind == "em1d":  # TASKS.csv #1986 — 1D inversion of loop-loop FDEM soundings
            from app.geophys.em1d import run_job as run_em1d
            out = run_em1d(req, lambda ev: q.put(("progress", ev)))
        elif kind == "implicit":
            # TASKS.csv #355 — the same implicit_model() the synchronous endpoint runs, in this process.
            from fastapi import HTTPException
            from app.main import implicit_model, ImplicitModelRequest
            q.put(("progress", {"stage": "modelling", "message": "Solving the implicit model (GemPy)…"}))
            try:
                out = implicit_model(ImplicitModelRequest(**req)).model_dump()
                out = {**out, "warmEngine": warm}  # #3281 — GemPy was still loaded from a recent run
            except HTTPException as exc:  # a handled, user-facing message (too few points, etc.)
                q.put(("error", str(exc.detail), ""))
                return
        else:
            raise ValueError(f"Unknown job kind {kind!r}")
        q.put(("result", out))
    except Exception as exc:  # the parent turns this into the job's error state
        q.put(("error", f"{type(exc).__name__}: {exc}", traceback.format_exc()))


class JobManager:
    def __init__(self):
        self._lock = threading.Lock()
        self._job = None
        self._warm = None  # #3124 — { kind, proc, queue, inbox, idleSince } of a gridding worker waiting for its next job

    def busy(self):
        j = self._job
        return bool(j and j["state"] in ("queued", "running"))

    def running_id(self):
        """TASKS.csv #515 — the id of the job holding the slot (None when free), so a 409 can name it."""
        j = self._job
        return j["id"] if j and j["state"] in ("queued", "running") else None

    def start(self, kind, req):
        with self._lock:
            if self.busy():
                return None
            w = self._warm
            if w and w["kind"] == kind and w["proc"].is_alive() and w["idleSince"] is not None and time.time() - w["idleSince"] < WARM_IDLE_S - WARM_MARGIN_S:
                proc, q = w["proc"], w["queue"]  # #3124 — the engine is still loaded: hand it the job
                w["idleSince"] = None
                w["inbox"].put(req)
            else:
                self._retire_warm()  # an inversion, another kind, or an expired worker: its memory back first
                ctx = mp.get_context("spawn")
                q = ctx.Queue()
                cap = sensitivity_cap_bytes()
                inbox = ctx.Queue() if kind in WARM_KINDS else None
                proc = ctx.Process(target=_child, args=(kind, req, q, cap, inbox, WARM_IDLE_S), daemon=True)
                proc.start()
                if inbox is not None:
                    self._warm = {"kind": kind, "proc": proc, "queue": q, "inbox": inbox, "idleSince": None}
            job = {"id": uuid.uuid4().hex[:12], "kind": kind, "state": "running", "startedAt": time.time(),
                   "progress": {"stage": "starting"}, "history": [], "result": None, "error": None, "proc": proc, "queue": q}
            self._job = job
            threading.Thread(target=self._drain, args=(job,), daemon=True).start()
            return job["id"]

    def _retire_warm(self):
        w, self._warm = self._warm, None
        if not w:
            return
        p = w["proc"]
        if p.is_alive():
            try:
                w["inbox"].put(None)
                p.join(2)
            except Exception:
                pass
            if p.is_alive():
                p.terminate()
                p.join(5)

    def _drain(self, job):
        q, proc = job["queue"], job["proc"]
        while True:
            try:
                msg = q.get(timeout=0.5)
            except queue.Empty:
                if not proc.is_alive():
                    # Drain anything that raced the exit, then settle the state.
                    try:
                        while True:
                            self._apply(job, q.get_nowait())
                    except queue.Empty:
                        pass
                    if job["state"] == "running":
                        job["state"] = "failed"
                        job["error"] = f"The {'modelling' if job['kind'] == 'implicit' else 'inversion'} process exited unexpectedly (exit code {proc.exitcode}). It may have run out of memory."
                    return
                continue
            self._apply(job, msg)
            if job["state"] != "running":
                w = self._warm
                if w and w["proc"] is proc and job["state"] in ("done", "failed"):
                    w["idleSince"] = time.time()  # #3124 — waiting for the next gridding job
                return

    def _apply(self, job, msg):
        if msg[0] == "progress":
            ev = msg[1]
            job["progress"] = ev
            if ev.get("stage") == "iterating" and "phi_d" in ev:
                job["history"].append({k: ev.get(k) for k in ("iter", "phi_d", "beta")})
        elif msg[0] == "result":
            job["result"] = msg[1]
            job["state"] = "done"
        elif msg[0] == "error":
            job["error"] = msg[1]
            job["trace"] = msg[2]
            job["state"] = "failed"

    def status(self, job_id):
        j = self._job
        if not j or j["id"] != job_id:
            return None
        return {"id": j["id"], "kind": j["kind"], "state": j["state"], "progress": j["progress"],
                "history": j["history"], "error": j["error"], "elapsed": time.time() - j["startedAt"]}

    def result(self, job_id):
        j = self._job
        if not j or j["id"] != job_id or j["state"] != "done":
            return None
        return j["result"]

    def cancel(self, job_id):
        j = self._job
        if not j or j["id"] != job_id:
            return False
        if j["state"] == "running":
            j["state"] = "cancelled"
            p = j["proc"]
            if self._warm and self._warm["proc"] is p:
                self._warm = None  # #3124 — a cancelled warm worker is not reused
            p.terminate()
            p.join(5)
            if p.is_alive():
                p.kill()
        return True


manager = JobManager()
