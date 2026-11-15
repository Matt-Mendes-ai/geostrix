// TASKS.csv #3587 (Matt: '1-6 in both, editable') — one plausible density range, 1 to 6 t/m³ by default, a project setting a user can raise: Data QC flags by it and the tonnage tools leave a value
// outside it out of the density mean and say how many. Before: Data QC 1-6, the tonnage tools 1-8, so Macpass's six values above 6 went into the mean.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Papa from "papaparse";
import { DEFAULT_DENSITY_RANGE, densityRangeOf, isDefaultDensityRange } from "../src/lib/densityRange.js";
import { sgSummary } from "../src/lib/gradeTonnage.js";
import { sgInsideSolid } from "../src/lib/sgInSolid.js";
import { runDataQC, PLAUSIBLE_RANGE } from "../src/lib/dataQC.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const loc = (lang) => JSON.parse(fs.readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
const rd = (f) => Papa.parse(read(`../sample_data/yk_macpass/${f}`), { header: true, skipEmptyLines: true, dynamicTyping: true }).data;
const sg = rd("sg.csv").map((r) => ({ hole_id: r.hole_id, from: r.from, to: r.to, value: r.sg }));

test("the range: 1-6 by default; a project's own when sensible; a nonsense one falls back", () => {
  assert.deepEqual(DEFAULT_DENSITY_RANGE, { min: 1, max: 6 }); assert.deepEqual(PLAUSIBLE_RANGE.sg, DEFAULT_DENSITY_RANGE);
  assert.deepEqual(densityRangeOf(null), DEFAULT_DENSITY_RANGE); assert.deepEqual(densityRangeOf({}), DEFAULT_DENSITY_RANGE);
  assert.deepEqual(densityRangeOf({ densityRange: { min: 1.5, max: 8 } }), { min: 1.5, max: 8 });
  assert.deepEqual(densityRangeOf({ densityRange: { min: "2", max: "7.5" } }), { min: 2, max: 7.5 });
  for (const bad of [{ min: 5, max: 3 }, { min: -1, max: 4 }, { min: "a", max: 4 }, { min: 2 }, 7]) assert.deepEqual(densityRangeOf({ densityRange: bad }), DEFAULT_DENSITY_RANGE, JSON.stringify(bad));
  assert.equal(isDefaultDensityRange({ min: 1, max: 6 }), true); assert.equal(isDefaultDensityRange({ min: 1, max: 8 }), false);
});

test("the tonnage mean leaves out what Data QC flags: the Macpass six above 6 (default), counted; raise the range and they go in", () => {
  const d = sgSummary(sg);
  assert.equal(d.left, 6); assert.equal(d.n, sg.length - 6); assert.ok(d.max <= 6); assert.deepEqual(d.range, { min: 1, max: 6 });
  const r8 = sgSummary(sg, { min: 1, max: 8 });
  assert.equal(r8.left, 0); assert.equal(r8.n, sg.length); assert.ok(r8.max > 6.9);
  assert.ok(r8.mean > d.mean, "the six heavy values raise the mean");
  assert.equal(sgSummary([{ from: 0, to: 1, value: 0.5 }, { from: 1, to: 2, value: 9 }]), null, "nothing inside the range: no summary");
  // a typed layer too: the range is a parameter
  const rows = [{ from: 0, to: 2, value: 2.5 }, { from: 2, to: 4, value: 4.5 }, { from: 4, to: 5, value: 7 }];
  assert.equal(sgSummary(rows, { min: 1, max: 6 }).mean, 3.5); assert.equal(sgSummary(rows, { min: 1, max: 6 }).left, 1);
  assert.equal(sgSummary(rows, { min: 1, max: 8 }).mean, +((2.5 * 2 + 4.5 * 2 + 7) / 5).toFixed(3));
});

test("a solid's SG takes the same range (sgInsideSolid passes it on)", () => {
  assert.equal(sgInsideSolid([], [], null, null), null);
  const src = read("../src/lib/sgInSolid.js");
  assert.match(src, /export function sgInsideSolid\(rows, traces, positions, indices, range = DEFAULT_DENSITY_RANGE\)/);
  assert.match(src, /return sgSummary\(inside, range\);/);
});

test("Data QC flags by the project's range, and the same six: raise it to 8 and none is flagged", () => {
  const collars = rd("collars.csv");
  const flags = (densityRange) => runDataQC({ project: {}, collars, survey: [], layers: { sg }, boundaries: [], assays: [], densityRange }).issues.filter((i) => i.category === "Specific gravity" && /outside the plausible/.test(i.message));
  const d = flags(null);
  assert.equal(d.length, 6); assert.match(d[0].message, /outside the plausible 1–6 range/);
  assert.equal(flags({ min: 1, max: 8 }).length, 0);
  assert.equal(flags({ min: 3, max: 6 }).length > 6, true, "a tighter bottom flags the light ones too");
  assert.match(flags({ min: 2, max: 6 })[0].message, /plausible 2–6 range/);
});

test("the setters are in the store (project.densityRange, project.qcChecked), the tonnage tools read the range and say how many were left out", () => {
  const st = read("../src/lib/store.jsx");
  assert.match(st, /const setProjectDensityRange = useCallback\(\(range\) => setProject\(\(p\) => \{ const \{ densityRange: _old, \.\.\.rest \} = p;/);
  assert.match(st, /!\(min === 1 && max === 6\) \? \{ \.\.\.rest, densityRange: \{ min, max \} \} : rest/, "the default is stored as nothing");
  for (const [f, re] of [
    ["../src/components/GradeTonnageModal.jsx", /sgSummary\(layers\?\.sg, densityRange\)/],
    ["../src/components/PitShellPane.jsx", /sgSummary\(layers\?\.sg, shellDensityRange\)/],
    ["../src/components/StopesPane.jsx", /sgSummary\(layers\?\.sg, stopeDensityRange\)/],
    ["../src/modules/viewer/SurfaceTonnage.jsx", /sgSummary\(sgRows, dRange\)/],
  ]) assert.match(read(f), re, f);
  assert.match(read("../src/components/GradeTonnageModal.jsx"), /\$\{sgLayer\.left \? `, \$\{sgLayer\.left\} outside \$\{sgLayer\.range\.min\}-\$\{sgLayer\.range\.max\} t\/m3 left out` : ""\}/);
  for (const f of ["../src/components/GradeTonnageModal.jsx", "../src/components/PitShellPane.jsx", "../src/components/StopesPane.jsx", "../src/modules/viewer/SurfaceTonnage.jsx"]) assert.match(read(f), /density value\(s\) outside \{min\}–\{max\} t\/m³ left out/, f);
  const q = read("../src/components/DataQCModal.jsx");
  assert.match(q, /densityRange, terrain,/); assert.match(q, /setProjectDensityRange\?\.\(\{ min: a, max: b \}\)/); assert.match(q, /aria-label=\{tr\("Plausible density, highest \(t\/m³\)"\)\}/);
  assert.match(read("../src/lib/dataQC.js"), /range: densityRange \|\| opt\.range/);
  for (const lang of ["es", "pt", "fr", "ar"]) { const d = loc(lang); for (const k of ["{n} density value(s) outside {min}–{max} t/m³ left out of the mean (the range is set in Data QC).", "Density (t/m³)", "Plausible density, highest (t/m³)"]) assert.ok(d[k], `${lang}: ${k.slice(0, 30)}`); }
});
