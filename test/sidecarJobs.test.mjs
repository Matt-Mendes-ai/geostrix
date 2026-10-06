// TASKS.csv #515 — a poll loop that gives up on a sidecar job must cancel it, so the engine's single job
// slot is freed; and a job the app abandoned without being able to cancel is reclaimed on the next start.
// fetch is mocked; the desktop bridge is a stub (desktop.js reads window.desktop once, at import).
import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = { desktop: { isDesktop: true, getSidecarToken: async () => "tok", ensureSidecar: async () => ({ spawned: false }) }, dispatchEvent() {} };
const D = await import("../src/lib/desktop.js");
const J = await import("../src/lib/inversionJobs.js");

let calls, server;
const json = (o, s = 200) => ({ ok: s < 400, status: s, text: async () => JSON.stringify(o), json: async () => o });
const down = () => { const e = new Error("t"); e.name = "TimeoutError"; throw e; };
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  calls.push(`${opts.method || "GET"} ${u.pathname}`);
  if (u.pathname === "/health") return json({ proof: await D.sidecarProof("tok", u.searchParams.get("nonce")) });
  return server(u.pathname, opts);
};
const reset = (fn) => { calls = []; server = fn; };
const count = (re) => calls.filter((c) => re.test(c)).length;

test("#515 implicit run: one missed poll is tolerated, the run still completes", async () => {
  let n = 0;
  reset((p) => {
    if (p === "/v1/jobs") return json({ id: "imp1" });
    if (p === "/v1/jobs/imp1") { n++; if (n === 1) down(); return json({ state: n >= 2 ? "done" : "running" }); }
    if (p === "/v1/jobs/imp1/result") return json({ surfaces: [], range_used: 1, orientations_deduplicated: 3 });
    return json({}, 404);
  });
  const r = await D.pythonImplicitModel([0, 1, 0, 1, 0, 1], [], {});
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.orientationsDeduplicated, 3);
  assert.equal(count(/\/cancel$/), 0);
});

test("#515 implicit run: giving up after repeated failed polls sends /cancel", async () => {
  reset((p) => {
    if (p === "/v1/jobs") return json({ id: "imp2" });
    if (p === "/v1/jobs/imp2") down();
    if (p === "/v1/jobs/imp2/cancel") return json({ ok: true });
    return json({}, 404);
  });
  const r = await D.pythonImplicitModel([0, 1, 0, 1, 0, 1], [], {});
  assert.equal(r.ok, false);
  assert.match(r.error, /Lost contact.*the job was cancelled/);
  assert.equal(count(/^GET \/v1\/jobs\/imp2$/), D.JOB_POLL_MAX_MISSES);
  assert.equal(count(/^POST \/v1\/jobs\/imp2\/cancel$/), 1);
});

test("#515 inversion job: losing contact cancels the job before marking it failed", async () => {
  reset((p) => {
    if (p === "/v1/jobs") return json({ id: "inv1", plan: {} });
    if (p === "/v1/jobs/inv1") down();
    if (p === "/v1/jobs/inv1/cancel") return json({ ok: true });
    return json({}, 404);
  });
  const s = await J.startInversionJob({}, { label: "test" }, { kind: "potential" });
  assert.equal(s.ok, true);
  for (let i = 0; i < 100 && J.currentInversionJob().status.state === "running"; i++) await new Promise((r) => setTimeout(r, 100));
  assert.equal(J.currentInversionJob().status.state, "failed");
  assert.match(J.currentInversionJob().error, /the job was cancelled/);
  assert.equal(count(/^POST \/v1\/jobs\/inv1\/cancel$/), 1);
});

test("#515 a job abandoned while the engine was unreachable is cancelled by the next start (409 names it)", async () => {
  // 1) give up on job "old1" while even /cancel fails -> remembered as abandoned
  reset((p) => (p === "/v1/jobs/old1/cancel" ? down() : json({}, 404)));
  const c = await D.abandonSidecarJob("old1");
  assert.equal(c.ok, false);
  // 2) next start: the engine still holds old1 and answers 409 naming it; the client cancels it and retries
  let running = true, posts = 0;
  reset((p) => {
    if (p === "/v1/jobs") { posts++; return running ? json({ detail: "Another modelling or inversion job is already running — wait for it or cancel it first.", running_job: "old1" }, 409) : json({ id: "new1" }); }
    if (p === "/v1/jobs/old1/cancel") { running = false; return json({ ok: true }); }
    if (p === "/v1/jobs/old1") return json({ state: running ? "running" : "cancelled" });
    return json({}, 404);
  });
  const r = await D.startSidecarJob("dcip2d", {});
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.id, "new1");
  assert.equal(posts, 2);
  // 3) a 409 for a job this app did NOT abandon (someone else's run) is left alone and reported
  reset((p) => (p === "/v1/jobs" ? json({ detail: "Another modelling or inversion job is already running — wait for it or cancel it first.", running_job: "other" }, 409) : json({}, 404)));
  const r2 = await D.startSidecarJob("implicit", {});
  assert.equal(r2.ok, false);
  assert.equal(r2.status, 409);
  assert.match(r2.error, /already running/);
  assert.equal(count(/cancel/), 0);
});

test("#563 implicit start failures keep their real reason; no pip advice in the installed app", async () => {
  reset((p) => { if (p === "/v1/jobs") down(); return json({}, 404); }); // the start request times out
  let r = await D.pythonImplicitModel([0, 1, 0, 1, 0, 1], [], {});
  assert.equal(r.ok, false);
  assert.match(r.error, /didn't answer within \d+ s/);
  assert.doesNotMatch(r.error, /pip install|not reachable/);
  reset((p) => { if (p === "/v1/jobs") throw new TypeError("fetch failed"); return json({}, 404); }); // nothing listening
  r = await D.pythonImplicitModel([0, 1, 0, 1, 0, 1], [], {});
  assert.match(r.error, /isn't reachable/);
  assert.doesNotMatch(r.error, /pip install/); // window.desktop is set: an installed app has no pip
  reset((p) => (p === "/v1/jobs" ? json({ detail: "gempy failed: bad orientation" }, 500) : json({}, 404)));
  r = await D.pythonImplicitModel([0, 1, 0, 1, 0, 1], [], {});
  assert.match(r.error, /bad orientation/); // an HTTP error's own detail is passed through
});
