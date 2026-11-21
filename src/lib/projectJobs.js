// TASKS.csv #3953 (Matt's first-time test, data integrity) — a grade shell still running when Matt closed its project finished into another open
// project: a long job captured the store's setters when it started and called them when it finished, and by then they acted on whatever project was
// shown. Every long job (grade shell, estimation, GemPy solves, model from map, surfaces / solids, inversions, terrain / imagery fetches, the AI action
// tools) now belongs to the project it started in, and delivers only there:
//  - its project is shown: it delivers at once;
//  - its project is open in another tab: the result waits, that tab is marked unsaved and the notice names it; the job delivers when that tab is shown
//    (its own code then runs on that project's live state, unchanged);
//  - its project was closed or replaced (File > Open into an empty tab, a reprojection): it is cancelled (its own cancel is called) and nothing lands.
// A job does `const job = jobs.start({ label, cancel })`, runs, and right before it delivers calls `await job.landing()`, with no other await between
// that and the delivery. landing() also waits while a project is still loading (a tab switch expanding its tables, #3492 / #3931's gate), so a job
// never lands in a half-loaded project. Pure (no React): the store gives it the project now shown, the open tabs, and how to tell the user.
//
// A project is known by a key the store gives it when it is created, opened or restored, and its tab carries it across tab switches (#466's counter
// moved on every switch, so a job whose tab was left and shown again was dropped as if its project had gone).

export class ProjectGoneError extends Error {
  constructor(label, reason) { super(`${label}: its project was ${reason}`); this.projectGone = true; this.cancelled = true; this.reason = reason; }
}
export const isProjectGone = (e) => !!(e && e.projectGone);

// env: { activeKey(): the shown project's key; tabOfKey(key): { name } of an open tab NOT shown that holds this project, else null;
//        loading(): a project is still loading; whenLoaded(): a promise for its end; markUnsaved(key): mark that tab unsaved;
//        notify(event): { kind: "held" | "delivered" | "cancelled" | "lost", label, project, reason } -> the store turns it into a notice }
export function createProjectJobs(env) {
  const jobs = new Map(); // id -> job
  let seq = 0;
  const waiters = new Map(); // key -> Set of { resolve, reject }

  const wake = (key) => { const w = waiters.get(key); if (!w) return; waiters.delete(key); for (const resolve of w) resolve(); };

  function start({ label = "Task", cancel = null, key = env.activeKey() } = {}) {
    const job = { id: ++seq, key, label, cancel, gone: null, held: false, ended: false };
    job.landing = () => landing(job);
    job.end = () => { job.ended = true; jobs.delete(job.id); };
    job.isLive = () => !job.gone && env.activeKey() === job.key;
    jobs.set(job.id, job);
    return job;
  }

  async function landing(job) {
    for (;;) {
      if (job.gone) throw job.gone;
      if (env.loading?.()) { await env.whenLoaded(); continue; }
      if (env.activeKey() === job.key) {
        if (job.held) { job.held = false; env.notify?.({ kind: "delivered", label: job.label, project: job.heldIn }); }
        job.landed = true; // its work is done: a close from now on drops it quietly (nothing to cancel), and a later landing() still checks
        return "active";
      }
      const tab = env.tabOfKey(job.key);
      if (!tab) { // closed or replaced, and nobody cancelled it (a job not registered for the close): drop it here
        job.gone = new ProjectGoneError(job.label, "closed");
        env.notify?.({ kind: "lost", label: job.label, reason: "closed" });
        job.end();
        throw job.gone;
      }
      if (!job.held) { job.held = true; job.heldIn = tab.name; env.markUnsaved?.(job.key); env.notify?.({ kind: "held", label: job.label, project: tab.name }); }
      await new Promise((resolve) => { if (!waiters.has(job.key)) waiters.set(job.key, new Set()); waiters.get(job.key).add(resolve); });
    }
  }

  // the store calls this once a project is shown and loaded: the jobs waiting for it deliver now
  function projectShown(key) { wake(key); }

  // a project closed or replaced: its jobs are cancelled and say so; a job waiting to land fails with ProjectGoneError
  function projectClosed(key, reason = "closed") {
    const mine = [...jobs.values()].filter((j) => j.key === key && !j.ended && !j.gone);
    let cancelled = 0;
    for (const j of mine) {
      j.gone = new ProjectGoneError(j.label, reason);
      jobs.delete(j.id);
      if (j.landed) continue; // finished and delivered already: nothing to stop or say
      try { j.cancel?.(); } catch { /* a cancel that throws must not stop the others */ }
      env.notify?.({ kind: "cancelled", label: j.label, reason });
      cancelled++;
    }
    wake(key); // a job waiting to land goes round its loop, finds itself gone and throws its own ProjectGoneError
    return cancelled;
  }

  const running = (key) => [...jobs.values()].filter((j) => !j.ended && !j.gone && !j.landed && (key == null || j.key === key));
  return { start, projectShown, projectClosed, running };
}

// The store's bookkeeping after each render (pure, for the test): `keys` (Map tab id -> project key) gets the shown tab's live key and loses the
// tabs that are gone. -> the projects that are no longer in any tab: [{ key, reason }], "closed" when their tab is gone, "replaced" when their tab
// now holds another project (File > Open into the empty tab, a reprojection, New in the last tab).
export function syncTabKeys(keys, tabIds, activeTabId, liveKey) {
  const before = new Map([...keys].map(([id, k]) => [k, id]));
  const ids = new Set(tabIds);
  for (const id of [...keys.keys()]) if (!ids.has(id)) keys.delete(id);
  keys.set(activeTabId, liveKey);
  const held = new Set(keys.values());
  return [...before].filter(([k]) => !held.has(k)).map(([key, id]) => ({ key, reason: ids.has(id) ? "replaced" : "closed" }));
}

// A call site's one line: `if (!(await landed(job))) return;` -> true when the job may deliver now (its project shown), false when its project
// is gone (the store has said so: the caller just stops). Any other error is the job's own and is thrown on. No job (a caller outside the
// store): true.
export async function landed(job) {
  if (!job) return true;
  try { await job.landing(); return true; } catch (e) { if (isProjectGone(e)) return false; throw e; }
}
// a job for code that may run with no store (tests, a browser preview): it always lands
export const noJob = (label = "Task") => ({ id: 0, key: null, label, landing: async () => "active", end() {}, isLive: () => true, gone: null });

let keySeq = 0;
// a fresh project key (a project created, opened or restored)
export const newProjectKey = () => `p${Date.now().toString(36)}_${(++keySeq).toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
