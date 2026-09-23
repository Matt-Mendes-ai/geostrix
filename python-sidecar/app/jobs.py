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


def _child(kind, req, q, cap):
    threading.Thread(target=_watch_parent, daemon=True).start()
    # Leave headroom for the UI and the renderer: numba defaults to every LOGICAL core (8 on a 4-core
    # hyper-threaded laptop), which starves them. Physical cores minus one (approximated as logical/2 - 1,
    # at least 2) — building the matrix still gets most of its measured 2.6x parallel speed-up.
    logical = os.cpu_count() or 2
    n = max(2, logical // 2 - 1) if logical >= 4 else 1
    os.environ.setdefault("NUMBA_NUM_THREADS", str(n))
    os.environ.setdefault("OMP_NUM_THREADS", str(n))
    try:
        if kind == "potential":
            from app.geophys.potential import run_job
            out = run_job(req, lambda ev: q.put(("progress", ev)), cap)
        else:
            raise ValueError(f"Unknown job kind {kind!r}")
        q.put(("result", out))
    except Exception as exc:  # the parent turns this into the job's error state
        q.put(("error", f"{type(exc).__name__}: {exc}", traceback.format_exc()))


class JobManager:
    def __init__(self):
        self._lock = threading.Lock()
        self._job = None

    def busy(self):
        j = self._job
        return bool(j and j["state"] in ("queued", "running"))

    def start(self, kind, req):
        with self._lock:
            if self.busy():
                return None
            ctx = mp.get_context("spawn")
            q = ctx.Queue()
            cap = sensitivity_cap_bytes()
            proc = ctx.Process(target=_child, args=(kind, req, q, cap), daemon=True)
            job = {"id": uuid.uuid4().hex[:12], "kind": kind, "state": "running", "startedAt": time.time(),
                   "progress": {"stage": "starting"}, "history": [], "result": None, "error": None, "proc": proc, "queue": q}
            self._job = job
            proc.start()
            threading.Thread(target=self._drain, args=(job,), daemon=True).start()
            return job["id"]

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
                        job["error"] = f"The inversion process exited unexpectedly (exit code {proc.exitcode}). It may have run out of memory."
                    return
                continue
            self._apply(job, msg)
            if job["state"] != "running":
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
            p.terminate()
            p.join(5)
            if p.is_alive():
                p.kill()
        return True


manager = JobManager()
