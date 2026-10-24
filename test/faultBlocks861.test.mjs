// TASKS.csv #861 — a faulted contact as one explicit surface per block, each trimmed at the fault (Matt: "get its own
// surface trimmed"). The #855 review's case: a contact dropped 40 m west of a N-S fault; one spline through all picks
// ramps across the fault (22 deg, >= 23 m off), two block surfaces trimmed at the fault do not.
import test from "node:test";
import assert from "node:assert/strict";
import { fitExplicitSurface } from "../src/lib/explicitSurface.js";
import { splitAcrossSurface } from "../src/lib/crosscut.js";

const FAULT_X = 125;
const contact = (x, y) => 900 + 0.3 * x + 5 * Math.sin(y / 40) - (x < FAULT_X ? 40 : 0); // west block dropped 40 m
const picks = [];
for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) { const x = 12 + i * 45, y = j * 50; picks.push({ x, y, z: contact(x, y) }); }
// a vertical fault plane x = 125, normals pointing east (+x): + side = east
const fault = { positions: [FAULT_X, -200, 600, FAULT_X, 500, 600, FAULT_X, 500, 1300, FAULT_X, -200, 1300], indices: [0, 1, 2, 0, 2, 3] }; // wound so the normal is +x

const block = (side) => {
  const own = picks.filter((p) => (side > 0 ? p.x > FAULT_X : p.x < FAULT_X));
  const res = fitExplicitSurface(own, { resolution: 40 });
  const sp = splitAcrossSurface({ positions: res.positions, indices: Array.from(res.indices) }, fault);
  assert.ok(sp.ok && sp.changed, "the fault crosses the extrapolated surface");
  return { own, part: side > 0 ? sp.positive : sp.negative };
};

test("#861 each block's surface stops at the fault and passes through its own picks", () => {
  for (const side of [1, -1]) {
    const { own, part } = block(side);
    const P = part.positions, used = new Set(part.indices); // the clipper keeps unused input vertices (the pane compacts them)
    for (const v of used) assert.ok(side > 0 ? P[3 * v] >= FAULT_X - 1e-6 : P[3 * v] <= FAULT_X + 1e-6, `vertex x ${P[3 * v]} on the wrong side`);
    for (const p of own) {
      let best = Infinity;
      for (let k = 0; k < P.length; k += 3) best = Math.min(best, Math.hypot(P[k] - p.x, P[k + 1] - p.y, P[k + 2] - p.z));
      assert.ok(best < 1e-6, "every pick of the block is a vertex of its trimmed surface");
    }
  }
});

test("#861 at the fault the two blocks keep the throw instead of a ramp", () => {
  const east = block(1).part.positions, west = block(-1).part.positions;
  const atFault = (P) => { const z = []; for (let k = 0; k < P.length; k += 3) if (Math.abs(P[k] - FAULT_X) < 1e-6 && P[k + 1] > 40 && P[k + 1] < 160) z.push(P[k + 2]); return z.reduce((a, v) => a + v, 0) / z.length; };
  const step = atFault(east) - atFault(west);
  assert.ok(Math.abs(step - 40) < 6, `throw at the fault ${step.toFixed(1)} m (true 40 m)`);
});
