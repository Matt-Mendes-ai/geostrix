// TASKS.csv #941 — a fault-bounded explicit surface: inputs on the side of the fault that is cut away are left out of the
// fit (and returned, for the panel to name), so they no longer bend the kept surface
import test from "node:test";
import assert from "node:assert/strict";
import { fitExplicitSurface } from "../src/lib/explicitSurface.js";
import { fitBoundedSurface, inputsBySide } from "../src/lib/explicitTrim.js";

// the review's case: a vertical fault at E 500 (normal +E), a hanging-wall block of 30 picks flat at 1000 m west of it
const fault = { positions: Float64Array.from([500, -500, 600, 500, 1500, 600, 500, 1500, 1400, 500, -500, 1400]), indices: [0, 1, 2, 0, 2, 3] };
const picks = [];
for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) picks.push({ x: 50 + i * 80, y: 50 + j * 200, z: 1000, src: "pick" });
const wrong = [{ x: 520, y: 400, z: 950, src: "pick", hole: "SG-12", md: 143 }, { x: 540, y: 600, z: 950, src: "pick" }];
const fit = (pts) => fitExplicitSurface(pts, { resolution: 60 });
const maxDev = (res) => { let m = 0; for (let v = 0; v < res.positions.length / 3; v++) { const x = res.positions[3 * v]; if (x <= 500 && x >= 50) m = Math.max(m, Math.abs(res.positions[3 * v + 2] - 1000)); } return m; };

test("#941 picks on the cut-away side are left out and returned; the kept surface stays on the block's own picks", () => {
  const res = fitBoundedSurface([...picks, ...wrong], fit, fault, -1);
  assert.equal(res.trim.changed, true);
  assert.equal(res.trim.offSide.length, 2);
  assert.equal(res.trim.offSide[0].hole, "SG-12");
  assert.ok(maxDev(res) < 0.5, `kept surface off its flat contact by ${maxDev(res)} m`);
  // the same picks without the side check bent it by tens of metres (the review measured 37.9 m)
  const bent = fit([...picks, ...wrong]);
  let worst = 0;
  for (let v = 0; v < bent.positions.length / 3; v++) { const x = bent.positions[3 * v]; if (x <= 500 && x >= 400) worst = Math.max(worst, Math.abs(bent.positions[3 * v + 2] - 1000)); }
  assert.ok(worst > 10, `${worst}`);
  // every input on the kept side: nothing left out
  assert.equal(fitBoundedSurface(picks, fit, fault, -1).trim.offSide.length, 0);
});

test("#941 points on the fault, or beside its extent, have no side and are kept; too few kept is refused by name", () => {
  const { keep, off } = inputsBySide([{ x: 500.2, y: 0, z: 1000 }, { x: 520, y: 2000, z: 1000 }, { x: 520, y: 0, z: 1000 }], fault, -1);
  assert.equal(keep.length, 2); // on the fault (0.2 m), and beyond its north end (nearest fault point on its edge)
  assert.equal(off.length, 1);
  assert.throws(() => fitBoundedSurface([...wrong, { x: 560, y: 500, z: 950 }, { x: 100, y: 100, z: 1000 }], fit, fault, -1), /Only 1 of this surface's 4 inputs/);
});
