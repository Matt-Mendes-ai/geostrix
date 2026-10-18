// TASKS.csv #691 — the geoML add-on job client: missed polls tolerated, a give-up cancels, a restart is named, 409 -> id
import { test } from "node:test";
import assert from "node:assert/strict";
import { runJob, MAX_MISSES } from "../src/lib/geomlAddon.js";

function mockAddon(script) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const path = url.replace(/^http:\/\/127\.0\.0\.1:\d+/, ""), method = opts.method || "GET";
    calls.push(`${method} ${path}`);
    const r = script(method, path, calls);
    if (r instanceof Error) throw r;
    return { ok: r.status < 400, status: r.status, json: async () => r.body };
  };
  return calls;
}
const ok = (body) => ({ status: 200, body });

test("a few failed status polls are retried; the job finishes", async () => {
  let n = 0;
  const calls = mockAddon((m, p) => {
    if (m === "POST" && p === "/v1/jobs") return ok({ id: "j1" });
    if (p === "/v1/jobs/j1") { n++; if (n <= 2) return Object.assign(new Error("timeout"), { name: "TimeoutError" }); return ok({ state: n < 4 ? "running" : "done" }); }
    if (p === "/v1/jobs/j1/result") return ok({ blocks: 1 });
    return { status: 500, body: {} };
  });
  const res = await runJob("grade", {}, null, null, { pollMs: 1 });
  assert.deepEqual(res, { blocks: 1 });
  assert.ok(!calls.some((c) => c.endsWith("/cancel")));
});

test(`after ${MAX_MISSES} failed polls in a row the job is cancelled and the error says so`, async () => {
  const calls = mockAddon((m, p) => {
    if (m === "POST" && p === "/v1/jobs") return ok({ id: "j2" });
    if (p === "/v1/jobs/j2/cancel") return ok({ state: "cancelled" });
    if (p === "/v1/jobs/j2") return Object.assign(new Error("timeout"), { name: "TimeoutError" });
    return { status: 500, body: {} };
  });
  await assert.rejects(runJob("grade", {}, null, null, { pollMs: 1 }), /Lost contact with the add-on .* cancelled/);
  assert.ok(calls.includes("POST /v1/jobs/j2/cancel"));
});

test("a job that vanished (add-on restarted) is reported as such, not as a bare 404", async () => {
  mockAddon((m, p) => {
    if (m === "POST" && p === "/v1/jobs") return ok({ id: "j3" });
    if (p === "/v1/jobs/j3") return { status: 404, body: { detail: "No such job." } };
    return ok({});
  });
  await assert.rejects(runJob("grade", {}, null, null, { pollMs: 1 }), /add-on stopped while the model was running/);
});

test("a 409 from a model already running carries that job's id", async () => {
  mockAddon((m, p) => (m === "POST" && p === "/v1/jobs" ? { status: 409, body: { detail: "busy", job: { id: "old", state: "running" } } } : ok({})));
  await assert.rejects(runJob("grade", {}, null, null, { pollMs: 1 }), (e) => e.busyJobId === "old" && /already running/.test(e.message));
});

test("cancelling from the panel cancels the job in the add-on", async () => {
  const calls = mockAddon((m, p) => (m === "POST" && p === "/v1/jobs" ? ok({ id: "j5" }) : p.endsWith("/cancel") ? ok({}) : ok({ state: "running" })));
  const ctrl = new AbortController();
  const pr = runJob("grade", {}, null, ctrl.signal, { pollMs: 5 });
  setTimeout(() => ctrl.abort(), 12);
  await assert.rejects(pr, /Cancelled/);
  assert.ok(calls.includes("POST /v1/jobs/j5/cancel"));
});
