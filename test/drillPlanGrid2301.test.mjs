// TASKS.csv #2301 (review #2174, WA gold) — the Drill plan carries a coordinate grid with easting / northing labels and says whose metres they are
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { drillPlanGrid, pxPerMetre } from "../src/lib/drillPlan.js";

const el = { w: 700, h: 450, scale: 20000, centre: { x: 32150, y: 808200 } };

test("an automatic round spacing, about five lines across, labelled in the project's metres", () => {
  const g = drillPlanGrid(el);
  const widthM = 700 / pxPerMetre(20000); // ~3.7 km
  assert.ok(g.spacing >= widthM / 5 && [1, 2, 2.5, 5, 10].some((m) => Math.abs(g.spacing / 10 ** Math.floor(Math.log10(g.spacing)) - m) < 1e-9), String(g.spacing));
  assert.ok(g.xs.length >= 3 && g.xs.length <= 6);
  for (const t of g.xs) { assert.ok(t.px >= 0 && t.px <= 700); assert.match(t.label, /^\d{1,3}(,\d{3})* E$/); }
  for (const t of g.ys) { assert.ok(t.px >= 0 && t.px <= 450); assert.match(t.label, /^\d{1,3}(,\d{3})* N$/); }
  // the lines sit on the plan's own coordinates: a label's value maps back to its pixel
  const t0 = g.xs[0], x = Number(t0.label.replace(/[^\d]/g, ""));
  assert.ok(Math.abs(350 + (x - 32150) * pxPerMetre(20000) - t0.px) < 1e-6);
});

test("a typed spacing, and 0 for none", () => {
  assert.equal(drillPlanGrid({ ...el, gridM: 250 }).spacing, 250);
  assert.equal(drillPlanGrid({ ...el, gridM: 0 }), null);
});

test("drawn under the holes with its caption; the property field; the page context's caption", () => {
  const e = readFileSync(new URL("../src/components/DrillPlanElement.jsx", import.meta.url), "utf8");
  assert.match(e, /const grid = useMemo\(\(\) => drillPlanGrid\(el\), \[el\]\);/);
  assert.match(e, /`Grid \$\{grid\.spacing\.toLocaleString\("en-US"\)\} m, \$\{gridCaption\}`/);
  const l = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(l, /aria-label=\{tr\("Grid spacing \(m\)"\)\}/);
  assert.match(l, /const gridCaption = project\?\.crsSet === false \? \(project\?\.localGrid\?\.name \? `local grid: \$\{project\.localGrid\.name\}` : "local mine grid, no CRS"\)/);
});
