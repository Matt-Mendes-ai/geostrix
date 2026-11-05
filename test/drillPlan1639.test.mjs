// TASKS.csv #1639 — the Layout drill plan: collars, traces and non-overlapping labels at a true scale
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pxPerMetre, holePlan, fitDrillPlan, holeSeries, placeLabels, drillPlanGeometry } from "../src/lib/drillPlan.js";
import { viewPxPerMetre, insertScaleBar } from "../src/lib/layoutLinks.js";

const holes = Array.from({ length: 60 }, (_, i) => ({ hole_id: (i < 30 ? "21CCDD" : "22GTDD") + String(i + 1).padStart(3, "0"), x: 609000 + (i % 10) * 120, y: 6355000 + Math.floor(i / 10) * 150, azimuth: 70, dip: -50, length: 200 }));

test("scale: 1:20,000 is 50 mm of paper per km", () => {
  assert.ok(Math.abs(1000 * pxPerMetre(20000) - (50 * 96) / 25.4) < 1e-9);
});

test("a hole in plan: azimuth 90 runs east, dip 90 is a point, a negative dip is down too", () => {
  const p = holePlan({ x: 0, y: 0, azimuth: 90, dip: 60, length: 100 });
  assert.ok(Math.abs(p.x1 - 50) < 1e-9 && Math.abs(p.y1) < 1e-9);
  assert.deepEqual(holePlan({ x: 5, y: 6, azimuth: 0, dip: 90, length: 100 }).y1.toFixed(6), "6.000000");
  assert.ok(Math.abs(holePlan({ x: 0, y: 0, azimuth: 0, dip: -60, length: 100 }).y1 - 50) < 1e-9);
});

test("fit: the smallest round scale that shows every collar and trace", () => {
  const f = fitDrillPlan(holes, 760, 480);
  assert.ok([5000, 10000].includes(f.scale), String(f.scale));
  const g = drillPlanGeometry({ w: 760, h: 480, ...f }, holes);
  assert.equal(g.holes.length, 60);
  assert.ok(g.holes.every((h) => h.inside && h.bx >= 0 && h.bx <= 760 && h.by >= 0 && h.by <= 480));
});

test("series and labels: prefixes, no overlaps, all inside", () => {
  assert.equal(holeSeries("21CCDD042"), "21CCDD"); assert.equal(holeSeries("COP-23-0005"), "COP-23"); assert.equal(holeSeries("21AGBDD043B"), "21AGBDD");
  const pts = Array.from({ length: 40 }, (_, i) => ({ id: `H${i}`, x: 100 + (i % 4) * 6, y: 100 + Math.floor(i / 4) * 4 }));
  const { placed, skipped } = placeLabels(pts, { fontPx: 9, w: 400, h: 300 });
  assert.equal(placed.length + skipped, 40); assert.ok(skipped > 0, "a crowd cannot all be labelled");
  const boxes = placed.map((l) => { const tw = l.id.length * 9 * 0.56; const x0 = l.anchor === "start" ? l.x : l.anchor === "end" ? l.x - tw : l.x - tw / 2; return { x0, x1: x0 + tw, y0: l.y - 9, y1: l.y }; });
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    assert.ok(!(a.x0 < b.x1 - 0.5 && a.x1 > b.x0 + 0.5 && a.y0 < b.y1 - 0.5 && a.y1 > b.y0 + 0.5), `labels ${i} and ${j} overlap`);
  }
});

test("a scale bar binds to a drill plan", () => {
  const dp = { id: "dp", type: "drillplan", x: 60, y: 80, w: 760, h: 480, scale: 20000, centre: { x: 0, y: 0 } };
  assert.equal(viewPxPerMetre(dp), pxPerMetre(20000));
  assert.equal(insertScaleBar({ id: "s", type: "scale", x: 0, y: 0, meters: 100 }, [dp], null).boundTo, "dp");
});

test("wired: ribbon, insert, render, sidebar", () => {
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /label="Drill plan"[^\n]*onClick=\{\(\) => addElement\("drillplan"\)\}/);
  assert.match(m, /if \(type === "drillplan"\) \{/);
  assert.match(m, /<DrillPlanElement el=\{el\} collars=\{ctx\?\.collars \|\| \[\]\} \/>/);
  assert.match(m, /sel\.type === "drillplan" && \(\(\) => \{/);
});
