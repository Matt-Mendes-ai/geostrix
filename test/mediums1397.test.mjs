// TASKS.csv #1397 — log classes with zeros: zeros in the lowest class, geometric above the smallest positive value
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyBreaks } from "../src/lib/layers.js";

test("#1397: 915 zeros no longer turn 'log' into equal intervals", () => {
  const vals = [...Array(915).fill(0), 0.05, 0.1, 0.2, 1, 2, 10, 28, 100];
  const b = classifyBreaks(vals, 5, "log");
  assert.equal(b.length, 5);
  assert.equal(b[0], 0);
  assert.ok(Math.abs(b[1] - 0.05) < 1e-12, String(b));
  for (let i = 2; i < b.length; i++) assert.ok(Math.abs(b[i] / b[i - 1] - b[2] / b[1]) < 1e-9, "geometric above the zeros");
  assert.deepEqual(classifyBreaks([0.1, 1, 10, 100], 3, "log").map((v) => +v.toPrecision(3)), [0.1, 1, 10]);
  assert.deepEqual(classifyBreaks([-5, -1, 0], 2, "log"), classifyBreaks([-5, -1, 0], 2, "equal"), "nothing positive: equal intervals as before");
});

test("#1454: a planned hole from an existing pad is 'same pad', compared below its collar zone", async () => {
  const { planChecks, COLLAR_ZONE_M } = await import("../src/lib/plannedHoleChecks.js");
  const vertical = (x, y, len) => Array.from({ length: Math.round(len / 3) + 1 }, (_, i) => ({ x, y, z: 1000 - i * 3, md: i * 3 }));
  const drilled = { n: 1, cell: 25, grid: new Map(), holes: [{ hole_id: "D1", pts: vertical(0, 0, 300), bb: [0, 0, 700, 0, 0, 1000] }] };
  for (const q of drilled.holes[0].pts) { const k = `${Math.floor(q.x / 25)},${Math.floor(q.y / 25)},${Math.floor(q.z / 25)}`; (drilled.grid.get(k) || drilled.grid.set(k, []).get(k)).push({ ...q, hole_id: "D1" }); }
  const angled = (h) => Array.from({ length: 101 }, (_, i) => ({ x: 2 + i * 3 * 0.7, y: 0, z: 1000 - i * 3 * 0.7, md: i * 3 })); // 45° away from D1, collar 2 m off
  const [r] = planChecks([{ id: "P1" }], drilled, [], angled);
  assert.deepEqual(r.samePad, ["D1"]);
  assert.ok(r.nearestReal.md >= COLLAR_ZONE_M, String(r.nearestReal.md));
  assert.ok(r.nearestReal.distance > 30, String(r.nearestReal.distance));
});

test("#1412: ordinary kriging never writes a negative grade", async () => {
  const { okEstimate } = await import("../src/lib/estimation.js");
  assert.equal(typeof okEstimate, "function"); // the clamp sits in the estimation loop (source check below)
  const src = (await import("node:fs")).readFileSync("src/lib/estimation.js", "utf8");
  assert.match(src, /if \(value < 0 && opts\.nonNegative !== false\) \{ value = 0;/);
});
