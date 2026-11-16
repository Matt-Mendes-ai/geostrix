// TASKS.csv #3769 + #3782 — one rule for a fitted plane: is it the shape of the drilling? (lib/drillingPlane.js). Synthetic drilling only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planeVsDrilling, holeAxes } from "../src/lib/drillingPlane.js";
import { samplesTrend } from "../src/lib/samplesTrend.js";
import { shellPlaneSearch } from "../src/lib/viewer/shellPlane.js";
import { estimatePlane } from "../src/lib/estimatePlane.js";

const rng = (seed) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; };
// fans: 33 holes drilled east at -45 to -59 from pads along a north-south line; the gold is nuggety, anywhere along them (no plane of its own)
function fans(seed = 7) {
  const r = rng(seed), pts = [];
  for (let h = 0; h < 33; h++) {
    const y0 = h * 28, dip = ((45 + (h % 3) * 7) * Math.PI) / 180;
    for (let d = 1; d < 250; d += 2) pts.push({ hole_id: `F${h}`, x: d * Math.cos(dip) + (r() - 0.5) * 4, y: y0 + (r() - 0.5) * 4, z: -d * Math.sin(dip), value: r() < 0.06 ? 3 + r() * 20 : r() * 0.5 });
  }
  return pts;
}
// vertical holes on a grid through a zone dipping `dipDeg` east, graded within halfM of it
function zone(dipDeg, { dx = 25, halfM = 5, seed = 3 } = {}) {
  const r = rng(seed), pts = [], t = Math.tan((dipDeg * Math.PI) / 180), c = Math.cos((dipDeg * Math.PI) / 180);
  let h = 0;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++, h++) {
    const x = i * dx, y = j * 30;
    for (let z = -2; z > -400; z -= 2) { const d = Math.abs(-z - (x * t + 20)) * c; pts.push({ hole_id: `S${h}`, x, y, z, value: d < halfM ? 5 + r() : r() * 0.5 }); }
  }
  return pts;
}
const check = (P, cut = 3) => { const at = P.filter((p) => p.value >= cut), f = samplesTrend(at); return { f, v: planeVsDrilling(f, P, at.length, { usedPts: at }) }; };

test("#3782 — a plane fitted to nuggety gold in fans is the shape of the drilling: same pole, no flatter, the holes in it", () => {
  const { f, v } = check(fans());
  assert.ok(f, "the gold gives a plane");
  assert.equal(v.drilling, true);
  assert.ok(v.angleDeg <= Math.max(v.drawDeg, v.floorDeg), JSON.stringify(v));
  assert.ok(v.within >= v.holes / 2 && v.holes === 33);
  assert.ok(v.medianHoleDeg < 30);
});

test("#3782 — a zone crossed by the holes keeps its plane, steep (holes 25° from it) or not", () => {
  for (const dip of [45, 65]) {
    const { f, v } = check(zone(dip));
    assert.ok(Math.abs(f.dip - dip) < 3, `fit ${f.dip}`);
    assert.equal(v.drilling, false, `${dip}°: ${JSON.stringify(v)}`);
    assert.equal(v.flatter, true, "the grades lie in a slab the drilling's draws never make");
  }
  // 65°: every vertical hole runs about 25° from the zone, so the holes alone would have called it the drilling
  const v65 = check(zone(65)).v;
  assert.equal(v65.within, v65.holes);
});

test("#3782 — the same draws every run, and a hole's axis is its line", () => {
  const P = fans(11), a = check(P).v, b = check(P).v;
  assert.deepEqual(a, b);
  const ax = holeAxes([{ hole_id: "H", x: 0, y: 0, z: 0 }, { hole_id: "H", x: 0, y: 0, z: -50 }, { hole_id: "H", x: 0, y: 0, z: -100 }, { hole_id: "K", x: 0, y: 0, z: 0 }]);
  assert.equal(ax.length, 1);
  assert.ok(Math.abs(Math.abs(ax[0].axis.z) - 1) < 1e-9);
  assert.equal(planeVsDrilling(null, P, 10), null);
});

test("#3782 — the shell's plane search and the estimate's take the rule: the sphere where the plane is the drilling's", () => {
  const P = fans();
  const at = P.filter((p) => p.value >= 3);
  const sh = shellPlaneSearch(at, 60, { allPts: P });
  assert.equal(sh.trend, null, "no ellipsoid along the drilling");
  assert.equal(sh.drilling.drilling, true);
  const kept = shellPlaneSearch(zone(65).filter((p) => p.value >= 3), 60, { allPts: zone(65) });
  assert.ok(kept.trend && kept.drilling.drilling === false);
  // without the area's samples the rule cannot run, and the plane is used as before
  assert.ok(shellPlaneSearch(at, 60).trend);
  const e = estimatePlane(P.map((p) => ({ ...p })), { cutoff: 3, name: "s" });
  assert.equal(e.trend, null);
  assert.equal(e.drilling.drilling, true);
  assert.ok(e.rejected && Number.isFinite(e.rejected.dip), "the plane it would have used, for the note");
});

test("#3782 / #3769 — the wiring: the shell, the envelope, the estimate and the Trends panel say it", () => {
  const runs = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(runs, /shellPlaneSearch\(boxAll\(bi\)[\s\S]{0,120}\{ allPts: boxAll\(bi\) \}\)/, "the shell passes the area's composites");
  assert.match(runs, /envelopeSearch\(atOfBox\(bi\), envS, \{ allPts: boxAll\(bi\) \}\)/, "and the envelope");
  assert.match(runs, /is the shape of the drilling/);
  const modal = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(modal, /planeFit\?\.drilling\?\.drilling \? tr\("No plane: the \{n\} samples at or above \{cutoff\} \{unit\} lie on \{dip\}° towards \{dir\}°, but that is the shape of the drilling/);
  const tp = readFileSync(new URL("../src/components/TrendsPanel.jsx", import.meta.url), "utf8");
  assert.match(tp, /planeVsDrilling\(/);
  assert.match(tp, /the shape of the drilling/);
});
