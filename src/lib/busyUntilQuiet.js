// TASKS.csv #3539 (Fireweed rehearsal) — after an import or a sample's files are committed, the 3D View builds the traces and layers they
// start for one to several seconds of back-to-back long tasks (at 4 x CPU the Macpass sample was 6.9 to 8.0 s after the import queue's
// label had already gone), with nothing on the status bar to say the window is busy. This keeps a label up until the main thread has
// been quiet (no long task) for a moment.
// whenQuiet(quietMs, maxMs): resolves once no long task has run for quietMs (a PerformanceObserver on "longtask"), or after maxMs at most.
export function whenQuiet(quietMs = 300, maxMs = 15000) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let last = t0, obs = null;
    try { obs = new PerformanceObserver(() => { last = performance.now(); }); obs.observe({ type: "longtask" }); } catch { obs = null; } // no long-task API: just the quiet wait
    const tick = () => {
      const now = performance.now();
      if (now - last >= quietMs || now - t0 >= maxMs) { obs?.disconnect(); resolve(); } else setTimeout(tick, 100);
    };
    setTimeout(tick, quietMs);
  });
}

// an open-ended busy label (no percentage), never over a cancellable task's own label (a modelling run with its Cancel: lib/taskSlot.js)
export function showBusy(setTaskProgress, label) {
  if (typeof setTaskProgress === "function") setTaskProgress((cur) => (cur && cur.onCancel && cur.label !== label ? cur : { label, indeterminate: true }));
}
// the status-bar label until the main thread is quiet, then cleared: only that label (a later task's own label is left as it is)
export function busyUntilQuiet(setTaskProgress, label, opts) {
  if (typeof setTaskProgress !== "function") return Promise.resolve();
  showBusy(setTaskProgress, label);
  return whenQuiet(opts?.quietMs, opts?.maxMs).then(() => setTaskProgress((cur) => (cur && cur.label === label ? null : cur)));
}
