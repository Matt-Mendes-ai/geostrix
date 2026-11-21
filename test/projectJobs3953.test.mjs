// TASKS.csv #3953 (Matt's first-time test, data integrity) — a long job delivers only into the project it started in. Synthetic projects A and B,
// a made-up result; the core rule (lib/projectJobs.js) with a model of the store's tabs.
import test from "node:test";
import assert from "node:assert/strict";
import { createProjectJobs, isProjectGone, newProjectKey } from "../src/lib/projectJobs.js";

// a model of the workspace: tabs with their project's key, one shown; each project's live data; the notices
function workspace() {
  const w = { tabs: [{ id: "t1", name: "Project A", key: "kA" }, { id: "t2", name: "Project B", key: "kB" }], shown: "t1", loading: false, loadWaiters: [], data: { kA: [], kB: [] }, notices: [], unsaved: new Set() };
  w.activeKey = () => w.tabs.find((t) => t.id === w.shown)?.key;
  w.jobs = createProjectJobs({
    activeKey: w.activeKey,
    tabOfKey: (key) => { const t = w.tabs.find((x) => x.key === key && x.id !== w.shown); return t ? { name: t.name } : null; },
    loading: () => w.loading,
    whenLoaded: () => new Promise((ok) => w.loadWaiters.push(ok)),
    markUnsaved: (key) => w.unsaved.add(key),
    notify: (e) => w.notices.push(e),
  });
  w.show = (id) => { w.shown = id; w.jobs.projectShown(w.activeKey()); };
  w.close = (id) => { const t = w.tabs.find((x) => x.id === id); w.tabs = w.tabs.filter((x) => x.id !== id); if (w.shown === id) w.shown = w.tabs[0]?.id; w.jobs.projectClosed(t.key, "closed"); if (w.shown) w.jobs.projectShown(w.activeKey()); };
  // a job as the app runs one: start, a long wait, landing(), then the delivery into the live project (whatever is shown at that moment)
  w.run = (label, finish) => {
    const job = w.jobs.start({ label, cancel: () => { job.cancelledByClose = true; } });
    const done = (async () => { await finish; await job.landing(); w.data[w.activeKey()].push(label); job.end(); return "delivered"; })().catch((e) => (isProjectGone(e) ? "gone" : Promise.reject(e)));
    return { job, done };
  };
  return w;
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test("the project is shown when the job finishes: it lands at once, there", async () => {
  const w = workspace(); let fin; const p = new Promise((r) => { fin = r; });
  const { done } = w.run("Au > 0.5 g/t shell", p);
  fin(); assert.equal(await done, "delivered");
  assert.deepEqual(w.data, { kA: ["Au > 0.5 g/t shell"], kB: [] });
  assert.equal(w.notices.length, 0);
});

test("started in A, B shown when it finishes: nothing lands in B; it waits, names A, marks A unsaved, and lands when A is shown", async () => {
  const w = workspace(); let fin; const p = new Promise((r) => { fin = r; });
  const { done } = w.run("Au > 0.5 g/t shell", p);
  w.show("t2"); fin(); await tick(); await tick();
  assert.deepEqual(w.data, { kA: [], kB: [] }, "nothing in B");
  assert.deepEqual(w.notices.map((n) => [n.kind, n.project]), [["held", "Project A"]]);
  assert.ok(w.unsaved.has("kA"));
  w.show("t1");
  assert.equal(await done, "delivered");
  assert.deepEqual(w.data, { kA: ["Au > 0.5 g/t shell"], kB: [] });
  assert.equal(w.notices.at(-1).kind, "delivered");
});

test("A left and shown again before the job ends: it still lands in A (the key travels with the tab)", async () => {
  const w = workspace(); let fin; const p = new Promise((r) => { fin = r; });
  const { done } = w.run("Kriged Cu", p);
  w.show("t2"); w.show("t1"); fin();
  assert.equal(await done, "delivered");
  assert.deepEqual(w.data, { kA: ["Kriged Cu"], kB: [] });
});

test("A closed while the job runs: it is cancelled and says so, and nothing lands anywhere", async () => {
  const w = workspace(); let fin; const p = new Promise((r) => { fin = r; });
  const { job, done } = w.run("Au > 0.5 g/t shell", p);
  w.close("t1"); fin();
  assert.equal(await done, "gone");
  assert.ok(job.cancelledByClose, "its own cancel was called (the worker / sidecar stops)");
  assert.deepEqual(w.data, { kA: [], kB: [] });
  assert.deepEqual(w.notices.map((n) => [n.kind, n.label, n.reason]), [["cancelled", "Au > 0.5 g/t shell", "closed"]]);
  assert.equal(w.jobs.running().length, 0);
});

test("A closed while its finished result waits in the background: dropped, nothing lands in B", async () => {
  const w = workspace(); let fin; const p = new Promise((r) => { fin = r; });
  const { done } = w.run("GemPy stack", p);
  w.show("t2"); fin(); await tick(); await tick();
  w.close("t1");
  assert.equal(await done, "gone");
  assert.deepEqual(w.data, { kA: [], kB: [] });
});

test("a project replaced in its tab with no close registered (the key is gone): the job drops itself", async () => {
  const w = workspace(); let fin; const p = new Promise((r) => { fin = r; });
  const { done } = w.run("Terrain fetch", p);
  w.tabs[0].key = "kA2"; w.data.kA2 = []; fin();
  assert.equal(await done, "gone");
  assert.deepEqual(w.data, { kA: [], kB: [], kA2: [] });
  assert.equal(w.notices[0].kind, "lost");
});

test("a project still loading: the job waits for the load before it lands", async () => {
  const w = workspace(); let fin; const p = new Promise((r) => { fin = r; });
  const { done } = w.run("Model from map", p);
  w.loading = true; fin(); await tick(); await tick();
  assert.deepEqual(w.data.kA, [], "not while loading");
  w.loading = false; w.loadWaiters.splice(0).forEach((f) => f());
  assert.equal(await done, "delivered");
  assert.deepEqual(w.data.kA, ["Model from map"]);
});

test("two jobs in two projects: each lands in its own", async () => {
  const w = workspace(); let fa, fb;
  const a = w.run("Shell A", new Promise((r) => { fa = r; }));
  w.show("t2");
  const b = w.run("Shell B", new Promise((r) => { fb = r; }));
  fa(); fb();
  assert.equal(await b.done, "delivered");
  w.show("t1");
  assert.equal(await a.done, "delivered");
  assert.deepEqual(w.data, { kA: ["Shell A"], kB: ["Shell B"] });
});

test("a job that landed: a later close says nothing and cancels nothing; a second landing() after that close stops it", async () => {
  const w = workspace();
  const job = w.jobs.start({ label: "Shell", cancel: () => { job.cancelled = true; } });
  assert.equal(await job.landing(), "active"); // the first landing (after the worker)
  assert.equal(await job.landing(), "active"); // and again before the last delivery: free when nothing changed
  assert.equal(w.jobs.running().length, 0, "a landed job is not running");
  w.close("t1");
  assert.equal(job.cancelled, undefined);
  assert.deepEqual(w.notices, []);
  await assert.rejects(job.landing(), (e) => isProjectGone(e)); // closed between its two landings: the last delivery does not happen
});

test("project keys are unique", () => {
  const s = new Set(Array.from({ length: 500 }, newProjectKey));
  assert.equal(s.size, 500);
});
