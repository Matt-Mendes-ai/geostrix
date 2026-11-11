// TASKS.csv #2473 (review #2325, WA uranium) — the drill plan colours its collars by series, a collar field or a grade per hole, with a
// key whose classes come from the holes' own values; a top-down viewport of vertical holes points to it
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { drillPlanColourBy, holeGradeValues, gradeBreaks, classOf, drillPlanColouring, drillPlanGeometry, allHolesSteep, placeLabels, GRADE_COLOURS, GRADE_RADIUS_MM } from "../src/lib/drillPlan.js";
import { resolvedSegments } from "../src/lib/geochem.js";

const collars = Array.from({ length: 20 }, (_, i) => ({ hole_id: `NND${String(i + 1).padStart(3, "0")}`, x: 1000 + i * 50, y: 2000, dip: -90, length: 40, attrs: { hole_type: i % 3 ? "AC" : "DD", year: i < 10 ? "2019" : "" } }));
const el = { w: 700, h: 450, scale: 5000, centre: { x: 1475, y: 2000 } };
const holes = drillPlanGeometry(el, collars).holes;

test("an older plan saved with the series tick keeps its series colours; a new one is plain", () => {
  assert.equal(drillPlanColourBy({ bySeries: true }), "series");
  assert.equal(drillPlanColourBy({}), "none");
  assert.equal(drillPlanColourBy({ bySeries: true, colourBy: "max:U" }), "max:U");
  const c = drillPlanColouring({ ...el, bySeries: true }, holes, collars, { palette: ["#111", "#222"] });
  assert.deepEqual(c.key.map((k) => k.label), ["NND"]);
});

test("per-hole grade: the highest result, and grade x length summed over the assayed metres", () => {
  const segs = [{ hole_id: "A", from: 0, to: 2, value: 1 }, { hole_id: "A", from: 2, to: 3, value: 5 }, { hole_id: "B", from: 0, to: 4, value: 0.5 }];
  assert.deepEqual([...holeGradeValues(segs, "max")], [["A", 5], ["B", 0.5]]);
  assert.deepEqual([...holeGradeValues(segs, "gt")], [["A", 7], ["B", 2]]);
});

test("classes break at the holes' own 50th / 75th / 90th percentiles, merged when values repeat", () => {
  const v = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.deepEqual(gradeBreaks(v), [50, 75, 90]);
  assert.deepEqual(gradeBreaks([0, 0, 0, 0, 0, 0, 0, 0, 3, 9]), [3]); // the median is the minimum: no class below it
  assert.deepEqual(gradeBreaks([2, 2, 2]), []);
  assert.equal(classOf(49, [50, 75, 90]), 0);
  assert.equal(classOf(50, [50, 75, 90]), 1);
  assert.equal(classOf(95, [50, 75, 90]), 3);
});

test("a grade colouring from real assay rows: ramp colours, larger rings for higher classes, hollow rings for holes not assayed", () => {
  const assays = [];
  collars.slice(0, 16).forEach((c, i) => { assays.push({ hole_id: c.hole_id, from: 0, to: 2, values: { U: (i + 1) * 10 } }); assays.push({ hole_id: c.hole_id, from: 2, to: 4, values: { U: 1 } }); });
  assays.push({ hole_id: "NND001", from: 4, to: 4, values: { U: 9999 } }); // a zero-length QC insert does not count
  const segs = resolvedSegments(assays, "U", "ppm", { U: "ppm" });
  const c = drillPlanColouring({ ...el, colourBy: "max:U" }, holes, collars, { segs, unit: "ppm" });
  assert.equal(c.title, "Highest U in the hole");
  assert.deepEqual(c.breaks, [80, 120, 150]);
  assert.deepEqual(c.key.map((k) => k.label), ["< 80 ppm", "80 – 120 ppm", "120 – 150 ppm", "≥ 150 ppm", "no U result"]);
  assert.deepEqual(c.styleOf("NND001"), { colour: GRADE_COLOURS[0], rMm: GRADE_RADIUS_MM[0], hollow: false }); // 10 ppm
  assert.deepEqual(c.styleOf("NND016"), { colour: GRADE_COLOURS[3], rMm: GRADE_RADIUS_MM[3], hollow: false }); // 160 ppm
  assert.equal(c.styleOf("NND020").hollow, true);
  const gt = drillPlanColouring({ ...el, colourBy: "gt:U" }, holes, collars, { segs, unit: "ppm" });
  assert.equal(gt.title, "U grade × length, whole hole");
  assert.match(gt.key[0].label, /m × ppm$/);
});

test("classes stay put when the frame is panned: they come from every hole the plan takes", () => {
  const segs = collars.map((c, i) => ({ hole_id: c.hole_id, from: 0, to: 1, value: i + 1 }));
  const all = drillPlanColouring({ ...el, colourBy: "max:Cu" }, holes, collars, { segs, unit: "%" });
  const panned = { ...el, colourBy: "max:Cu", centre: { x: 1000, y: 2000 } };
  const part = drillPlanColouring(panned, drillPlanGeometry(panned, collars).holes, collars, { segs, unit: "%" });
  assert.ok(drillPlanGeometry(panned, collars).holes.length < collars.length);
  assert.deepEqual(part.breaks, all.breaks);
});

test("a collar field colours by its values, with 'not recorded' for holes without one", () => {
  const c = drillPlanColouring({ ...el, colourBy: "attr:year" }, holes, collars, { palette: ["#a00", "#0a0"] });
  assert.equal(c.title, "year");
  assert.deepEqual(c.key.map((k) => k.label), ["2019", "not recorded"]);
  assert.equal(c.styleOf("NND015").hollow, true);
  assert.equal(c.styleOf("NND001").colour, "#a00");
});

test("a frame of vertical holes is flagged; one inclined hole clears it", () => {
  const ids = new Set(collars.map((c) => c.hole_id));
  assert.equal(allHolesSteep(collars, ids), true);
  assert.equal(allHolesSteep([...collars, { hole_id: "X1", x: 0, y: 0, dip: -60, length: 100 }], new Set([...ids, "X1"])), false);
  assert.equal(allHolesSteep(collars, new Set()), false);
  assert.equal(allHolesSteep([{ hole_id: "Z", dip: 0, length: 50 }], new Set(["Z"])), true); // no dip recorded: drawn vertical
});

test("hole labels keep out of the key's box", () => {
  const pts = [{ id: "A1", x: 20, y: 20 }, { id: "B2", x: 300, y: 300 }];
  const free = placeLabels(pts, { fontPx: 9, w: 400, h: 400 });
  assert.equal(free.placed.length, 2);
  const kept = placeLabels(pts, { fontPx: 9, w: 400, h: 400, avoid: [{ x0: 0, y0: 0, x1: 120, y1: 80 }] });
  assert.deepEqual(kept.placed.map((p) => p.id), ["B2"]);
  assert.equal(kept.skipped, 1);
});

test("the sheet and the PDF get the assays; the sidebar has the Colour by list and the viewport note", () => {
  const src = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(src, /<DrillPlanElement [^>]*assays=\{ctx\?\.assays/);
  assert.match(src, /<LayoutPrintRoot [^>]*assays=\{assays\}/);
  assert.match(src, /<DrillPlanColourControls /);
  assert.match(src, /steepHoles=\{/);
});
