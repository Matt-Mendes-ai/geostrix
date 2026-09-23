# TASKS.csv #321 — SimPEG potential-field modelling. Kept in its own package, imported ONLY inside the
# job child process (see app/jobs.py), so the sidecar parent never pays SimPEG/numba import cost (2.4-6.1 s
# measured from source, 4.1-4.4 s frozen) or its RAM unless an inversion is actually run.
