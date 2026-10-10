"""TASKS.csv #536 — return the model that fits the data to the STATED uncertainty, not the one beta-cooling overshot to.

SimPEG's BetaSchedule halves beta every iteration and TargetMisfit stops only after the iteration whose phi_d is at
or below the target, so a run can end well under it: the #324 octree test went 230 (1.02x the target of 225, just
above it) -> 71.5 (0.32x), and the tensor test 374 (1.66x) -> 122 (0.54x). fitVerdict then said "likely fitting
noise; the uncertainty may be set too large" and the over-fitted, rougher model was kept and exported — blaming
a correctly stated uncertainty for a solver step.

Now:
  1. every iteration's model is tracked (only the last two and the best in-band one are kept: three copies of n_active
     floats, nothing that scales with iterations);
  2. if the last iterate is in the band [0.7, 1.05] x target it is used, as before;
  3. else an earlier in-band iterate is used (octree: iteration 7, 1.02x);
  4. else, when the last step jumped from above the target to below the band, the step is retried from the previous
     model with beta between the two (geometric bisection, at most `max_tries` single Gauss-Newton steps);
  5. else the last iterate is kept and the overshoot is reported as such.
The choice and the reason are returned so the result can say "the last solver step overshot" separately from
"the uncertainty may be too large".
"""
import numpy as np

BAND = (0.7, 1.05)  # upper = the app's "reached the target" test (#507)


class Track:
    def __init__(self, target):
        self.target = float(target)
        self.prev = None  # (iter, phi_d, beta, model)
        self.cur = None
        self.best = None  # the in-band iterate closest to the target

    def _score(self, phi):
        return abs(np.log(max(phi, 1e-300) / self.target))

    def push(self, it, phi, beta, model):
        self.prev, self.cur = self.cur, (int(it), float(phi), float(beta), np.array(model, dtype=float, copy=True))
        lo, hi = BAND
        if lo * self.target <= phi <= hi * self.target and (self.best is None or self._score(phi) < self._score(self.best[1])):
            self.best = self.cur


def track_directive(directives, track):
    """A directive that records each iteration's (phi_d, beta used, model). Put it BEFORE BetaSchedule in the directive
    list, so the beta it sees is the one that produced this iteration's model (BetaSchedule cools it at endIter)."""
    class KeepIterates(directives.InversionDirective):
        def endIter(self):
            track.push(self.opt.iter, self.invProb.phi_d, self.invProb.beta, self.invProb.model)
    return KeepIterates()


def choose(track, refine=None, max_tries=3):
    """refine(m_start, beta) -> model: one Gauss-Newton step at a fixed beta; phi(model) is computed by the caller's
    `refine` returning (model, phi). Returns {model, phi, how, overshot, lastPhi, iteration}."""
    lo, hi = BAND
    N = track.target
    last = track.cur
    if last is None:
        return None
    base = {"lastPhi": last[1], "lastIteration": last[0]}
    if lo * N <= last[1] <= hi * N:
        return {**base, "model": last[3], "phi": last[1], "how": "last", "overshot": False, "iteration": last[0]}
    overshot = last[1] < lo * N
    if track.best is not None:
        b = track.best
        return {**base, "model": b[3], "phi": b[1], "how": "earlier", "overshot": overshot, "iteration": b[0]}
    prev = track.prev
    if overshot and refine is not None and prev is not None and prev[1] > N and prev[2] > last[2] > 0:
        b_hi, b_lo = prev[2], last[2]  # prev's beta under-fit (phi > N), last's beta over-fit
        tried = []
        for _ in range(max_tries):
            b = float(np.sqrt(b_hi * b_lo))
            m, phi = refine(prev[3], b)
            tried.append({"beta": b, "phi": float(phi)})
            if lo * N <= phi <= hi * N:
                return {**base, "model": m, "phi": float(phi), "how": "refined", "overshot": True, "iteration": prev[0] + 1, "beta": b, "tried": tried}
            if phi > N:
                b_hi = b
            else:
                b_lo = b
        return {**base, "model": last[3], "phi": last[1], "how": "last", "overshot": True, "iteration": last[0], "tried": tried}
    return {**base, "model": last[3], "phi": last[1], "how": "last", "overshot": overshot, "iteration": last[0]}


def fit_report(choice):
    """The part of the result the app reads (no model arrays)."""
    if not choice:
        return None
    return {k: v for k, v in choice.items() if k != "model"}
