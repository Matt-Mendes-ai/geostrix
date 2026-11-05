// TASKS.csv #1725 (review #1645, Copley) — Undrilled zones says when the shell it measures rests on one hole or is mostly extrapolated
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unitSupport } from "../src/lib/unitSupport.js";

test("#1725 a one-hole, all-extrapolated grade shell is weak; a bracketed many-hole one is not; a unit volume has no support", () => {
  // Copley's Cu >= 1000 ppm shell: 2,876 cells, all from COP-23-0001, 0 interpolated
  const copley = unitSupport({ tool: "numeric grade shell", cellsEstimated: 2876, singleHoleCells: 2876, supportCounts: { interpolated: 0, extrapolated: 2876, unsupported: 0 }, surfaceSupportCounts: { interpolated: 0, extrapolated: 1210, unsupported: 0 } });
  assert.deepEqual(copley, { cells: 2876, oneHoleShare: 1, extrapolatedShare: 1, weak: true });
  const good = unitSupport({ cellsEstimated: 10000, singleHoleCells: 400, supportCounts: { interpolated: 9000, extrapolated: 1000, unsupported: 0 } });
  assert.equal(good.weak, false);
  assert.ok(Math.abs(good.oneHoleShare - 0.04) < 1e-9 && Math.abs(good.extrapolatedShare - 0.1) < 1e-9);
  // the boundary's own counts win over the grid's (#91: what matters for a reported volume)
  const edge = unitSupport({ cellsEstimated: 100, singleHoleCells: 0, supportCounts: { interpolated: 90, extrapolated: 10, unsupported: 0 }, surfaceSupportCounts: { interpolated: 20, extrapolated: 70, unsupported: 10 } });
  assert.equal(edge.extrapolatedShare, 0.8); assert.equal(edge.weak, true);
  assert.equal(unitSupport({ tool: "unit volume", blockSizeM: [10, 10, 10] }), null);
  assert.equal(unitSupport(null), null);
});

test("#1725 the pane shows the support line, and the solids carry their params", () => {
  const u = readFileSync(new URL("../src/components/UndrilledZonesPane.jsx", import.meta.url), "utf8");
  assert.ok(u.includes("unitSupport(unit.params)") && u.includes("rests on one hole") && u.includes("is mostly extrapolated"));
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.ok(v.includes("type: sf.type, params: sf.params || null, ...(sf.type === \"unit_volume\""));
});
