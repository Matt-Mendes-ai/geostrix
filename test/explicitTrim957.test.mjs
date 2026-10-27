// TASKS.csv #957 — the fault trim of an explicit surface (now run in the worker): the kept side, unused vertices dropped,
// and the fault's normal for the hanging-wall / footwall label.
import test from "node:test";
import assert from "node:assert/strict";
import { trimAtFault, faultNormalZ } from "../src/lib/explicitTrim.js";

// a flat host 0..100 x 0..100 at z = 0 (4 x 4 squares), a fault plane x = 50 standing from z -50 to 50
function grid(n, size) {
  const positions = [], indices = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) positions.push((i * size) / n, (j * size) / n, 0);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1; indices.push(a, b, d, a, d, c); }
  return { positions: Float64Array.from(positions), indices: Uint32Array.from(indices) };
}
const fault = { positions: [50, -10, -50, 50, 110, -50, 50, 110, 50, 50, -10, 50], indices: [0, 1, 2, 0, 2, 3] };

test("#957: the host is cut at the fault and only one side kept, with no unused vertices", () => {
  const host = grid(4, 100);
  const plus = trimAtFault({ ...host }, fault, 1), minus = trimAtFault({ ...host }, fault, -1);
  assert.equal(plus.trim.changed, true);
  const xs = (r) => { const out = []; for (let k = 0; k < r.positions.length; k += 3) out.push(r.positions[k]); return out; };
  const sideOf = (r) => { const x = xs(r); return [Math.min(...x), Math.max(...x)]; };
  const [a, b] = [sideOf(plus), sideOf(minus)];
  assert.ok((a[0] >= 50 - 1e-9 && b[1] <= 50 + 1e-9) || (a[1] <= 50 + 1e-9 && b[0] >= 50 - 1e-9), `${a} / ${b}`);
  for (const r of [plus, minus]) { const used = new Set(r.indices); assert.equal(used.size, r.positions.length / 3); }
});

test("#957: a fault that misses the host trims nothing; a vertical fault has no hanging wall", () => {
  const far = { positions: fault.positions.map((v, i) => (i % 3 === 0 ? v + 500 : v)), indices: fault.indices };
  assert.equal(trimAtFault(grid(2, 100), far, 1).trim.changed, false);
  assert.ok(Math.abs(faultNormalZ(fault)) < 0.1);
  const dipping = { positions: [0, 0, 0, 100, 0, 0, 100, 100, 50, 0, 100, 50], indices: [0, 1, 2, 0, 2, 3] };
  assert.ok(Math.abs(faultNormalZ(dipping)) > 0.5);
});

test("#957: the worker answers superseded queued fits as stale and fits only the newest; it trims in the worker", async () => {
  const sent = [];
  globalThis.self = { postMessage: (m) => sent.push(m) };
  await import("../src/lib/explicitSurface.worker.js");
  const pts = [];
  // all on the kept (+x) side of the fault, the margin carrying the surface across it (#941: inputs on the cut-away side
  // are left out of the fit, so they no longer stretch it over the fault)
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) pts.push({ x: 55 + i * 10, y: j * 25, z: 10 + i * 2 });
  globalThis.self.onmessage({ data: { type: "fault", key: "f1", mesh: fault } });
  for (const id of [1, 2, 3]) globalThis.self.onmessage({ data: { id, points: pts, opts: { margin: 20, resolution: 20 }, cut: false, ...(id === 3 ? { trim: { key: "f1", side: 1 } } : {}) } });
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(sent.filter((m) => m.stale).map((m) => m.id), [1, 2]);
  const last = sent.find((m) => m.id === 3);
  assert.ok(last?.res?.positions?.length > 0, JSON.stringify(last).slice(0, 200));
  assert.equal(last.res.trim.changed, true);
  assert.deepEqual(last.res.trim.offSide, []);
  delete globalThis.self;
});
