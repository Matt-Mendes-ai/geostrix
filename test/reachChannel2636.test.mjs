// TASKS.csv #2636 — Estimation 'sometimes' never became runnable (Run disabled or 'Running… 0%' for minutes, CPU idle). The dialog
// asks the reach worker two kinds of question through one client: the block count for the current grid (sent 120 ms after the grid
// settles) and, when the box changes, the 10 m cell-fit (#1570). The client's single 'newest request wins' counter let the cell-fit
// request make the count stale: the count's answer was dropped, its key never changed again, and the dialog waited for ever.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// a stand-in module worker: answers each message in order, asynchronously, as the real one does
class FakeWorker {
  constructor() { FakeWorker.made++; }
  postMessage(msg) { setTimeout(() => this.onmessage?.({ data: { id: msg.id, result: { echo: msg.args.tag } } }), 5); }
  terminate() {}
}
FakeWorker.made = 0;
globalThis.Worker = FakeWorker;
const { makeReachClient } = await import("../src/lib/blockReachClient.js");

test("#2636: a cell-fit request sent after the block count does not drop the count's answer", async () => {
  const c = makeReachClient();
  const count = c.request({ tag: "count" });
  const fit = c.request({ tag: "fit10" }, "fit10");
  const [r1, r2] = await Promise.all([count.promise, fit.promise]);
  assert.equal(r1.echo, "count");
  assert.equal(r2.echo, "fit10");
  assert.equal(count.latest(), true, "the count is still the newest count");
  assert.equal(fit.latest(), true);
  c.stop();
});

test("#2636: a newer count still supersedes an older count (typing a cell size sends one answer that counts)", async () => {
  const c = makeReachClient();
  const a = c.request({ tag: "a" }), b = c.request({ tag: "b" });
  await Promise.all([a.promise, b.promise]);
  assert.equal(a.latest(), false);
  assert.equal(b.latest(), true);
  c.stop();
});

test("#2636: the Estimation dialog sends its cell-fit on its own channel", () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const src = fs.readFileSync(path.join(root, "src", "components", "GradeEstimationModal.jsx"), "utf8");
  assert.match(src, /reachClient\.current\.request\(\{ \.\.\.reachArgs, fitAllowed: false, fit10: true \}, "fit10"\)/);
});
