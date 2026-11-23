"""TASKS.csv #4027 — GemPy's field evaluation on several threads.

Measured on Mount Raymond's Model from map request (Erosional, 12 tops in 11 packages, 6 faults, 821 points, a 96 x 96 x 5 block and
19,812 map-check points): of a 345 s solve, 0.3 s was the 17 kriging solves and the rest was evaluating each field at the grid points
(the block and the check points 211 s, the mesh edges 134 s). That evaluation (gempy_engine generic_evaluator) is numpy, one chunk of
grid points after another, on ONE core: the BLAS threads (#440) hardly take part. The chunks are independent, so here they run on
eval_threads() threads; numpy releases the interpreter lock in its array work. Mount Raymond: 4 threads 129 s (2.7 x), with the
surfaces, the block and the check points bit-for-bit the same as one thread.

One catch: gempy_engine keeps the scalar kernel's distance matrices in a module-wide buffer (_kernels_assembler.DistancesBuffer) for the
gradient kernels that follow it. Shared by threads, a gradient took another chunk's distances (seen: a shape error on the last, shorter
chunk; on chunks of equal size it would be silently wrong values). The buffer is made per thread.
"""
import gc
import os
import threading
from concurrent.futures import ThreadPoolExecutor

_lock = threading.Lock()
_state = {"installed": False, "threads": 1, "original": None, "pool": None}


def eval_threads():
    """Threads for the evaluation: GEOSTRIX_GEMPY_THREADS if set, else half the logical cores, at most 4 (the rule of the BLAS
    threads, #440: the other half keeps the app responsive during a long solve)."""
    v = os.environ.get("GEOSTRIX_GEMPY_THREADS")
    if v:
        try:
            return max(1, int(v))
        except ValueError:
            pass
    return max(1, min(4, (os.cpu_count() or 2) // 2))


def install(threads=None):
    """Make gempy_engine evaluate its fields on `threads` threads (eval_threads() by default). Idempotent: with no count, an earlier
    install stands (each solve calls this). 1 thread leaves GemPy as it is. Returns the thread count in use."""
    with _lock:
        if _state["installed"] and threads is None:
            return _state["threads"]
        n = eval_threads() if threads is None else max(1, int(threads))
        if _state["installed"] and _state["threads"] == n:
            return n
        import gempy_engine.API.interp_single._interp_scalar_field as isf
        import gempy_engine.modules.evaluator.generic_evaluator as ge
        import gempy_engine.modules.kernel_constructor._kernels_assembler as ka
        if _state["original"] is None:
            _state["original"] = ge.generic_evaluator
        original = _state["original"]
        if n < 2:
            isf.generic_evaluator = original
            _state.update(installed=True, threads=1)
            return 1
        if not isinstance(ka.DistancesBuffer, threading.local):
            class _PerThreadDistances(threading.local):
                last_internal_distances_matrices = None
            ka.DistancesBuffer = _PerThreadDistances()
        if _state["pool"] is not None:
            _state["pool"].shutdown(wait=False)
        pool = ThreadPoolExecutor(n, thread_name_prefix="gempy-eval")

        def threaded_evaluator(solver_input, weights, options):
            from gempy_engine.core.backend_tensor import BackendTensor
            from gempy_engine.core.data.exported_fields import ExportedFields
            grid_size = solver_input.xyz_to_interpolate.shape[0]
            chunk = max(1, int(options.evaluation_chunk_size / weights.shape[0]))  # GemPy's own chunking
            n_chunks = -(-grid_size // chunk)
            if n_chunks < 2:
                return original(solver_input, weights, options)
            sf = BackendTensor.t.zeros(grid_size, dtype=weights.dtype)
            grad = [BackendTensor.t.zeros(grid_size, dtype=weights.dtype) for _ in range(options.number_dimensions)] if options.compute_scalar_gradient else None

            def one(i):
                s = slice(i * chunk, min(grid_size, (i + 1) * chunk))
                v, gx, gy, gz = ge._eval_on(solver_input=solver_input, weights=weights, options=options, slice_array=s)
                sf[s] = v
                if grad is not None:
                    for g, part in zip(grad, (gx, gy, gz)):
                        g[s] = part

            for _ in pool.map(one, range(n_chunks)):  # re-raises a chunk's error here
                pass
            gc.collect()
            if grad is None:
                return ExportedFields(sf, None, None, None)
            return ExportedFields(sf, grad[0], grad[1], grad[2] if len(grad) > 2 else None)

        isf.generic_evaluator = threaded_evaluator
        _state.update(installed=True, threads=n, pool=pool)
        return n
