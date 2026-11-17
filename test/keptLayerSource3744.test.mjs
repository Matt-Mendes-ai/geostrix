// TASKS.csv #3744 (regression of #3584) + #3750 — a kept composites layer is its own source in Best intercepts: the raw table's intercepts are the
// same with and without one, and each composited element is an entry of its own (Au, Ag, Cu of one layer), averaged on the composites. Synthetic.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compositeSources } from "../src/lib/compositeSources.js";
import { compositeLayerRows } from "../src/lib/compositeSet.js";
import { computeBestIntercepts } from "../src/lib/geochem.js";
import { labAssays } from "../src/lib/qaqc.js";

// raw Au down one hole: 417-418 1.95, 418-420 two low samples, 420-422.1 two high ones (the DH23-256 shape: ONE intercept at 1 g/t with 2 m dilution)
const raw = [
  { hole_id: "H", from: 417, to: 418, source: "assay", values: { Au: 1.95, Ag: 3, Cu: 100 } },
  { hole_id: "H", from: 418, to: 419, source: "assay", values: { Au: 0.01, Ag: 1, Cu: 50 } },
  { hole_id: "H", from: 419, to: 420, source: "assay", values: { Au: 0.01, Ag: 1, Cu: 50 } },
  { hole_id: "H", from: 420, to: 421, source: "assay", values: { Au: 2.63, Ag: 5, Cu: 300 } },
  { hole_id: "H", from: 421, to: 422.1, source: "assay", values: { Au: 6.5, Ag: 9, Cu: 800 } },
];
const set = [
  { hole_id: "H", from: 416, to: 418, avgGrade: 1.95, values: { Au: { grade: 1.95, coverage: 0.5 }, Ag: { grade: 3, coverage: 0.5 }, Cu: { grade: 100, coverage: 0.5 } } },
  { hole_id: "H", from: 418, to: 420, avgGrade: 0.01, values: { Au: { grade: 0.01, coverage: 1 }, Ag: { grade: 1, coverage: 1 }, Cu: { grade: 50, coverage: 1 } } },
  { hole_id: "H", from: 420, to: 422, avgGrade: 4.57, values: { Au: { grade: 4.57, coverage: 1 }, Ag: { grade: 7, coverage: 1 }, Cu: { grade: 550, coverage: 1 } } },
];
const layer = { id: "c1", name: "Composites 2 m: Au Ag Cu", rows: compositeLayerRows(set, ["Au", "Ag", "Cu"]), unit: "ppm", fieldUnits: { Au: "ppm", Ag: "ppm", Cu: "ppm" }, valueField: "Au",
  notes: "Composites of Au, Ag, Cu at 2 m, min coverage 50 %, grades length-weighted" };
const U = { Au: "ppm", Ag: "ppm", Cu: "ppm" };

test("#3750: one entry per composited element, named for the element and the length, in its unit, on the same intervals", () => {
  const { sources, bySymbol } = compositeSources([layer]);
  assert.deepEqual(sources[0].elements.map((e) => `${e.symbol}|${e.unit}`), ["Au (2 m composites)|ppm", "Ag (2 m composites)|ppm", "Cu (2 m composites)|ppm"]);
  assert.equal(sources[0].assays.length, 3);
  assert.deepEqual(sources[0].assays[2].values, { "Au (2 m composites)": 4.57, "Ag (2 m composites)": 7, "Cu (2 m composites)": 550 });
  assert.equal(bySymbol.get("Cu (2 m composites)"), sources[0]);
  // a second layer of the same element and length gets its own name
  const two = compositeSources([layer, { ...layer, id: "c2", name: "Composites 2 m: Au Ag Cu (2)" }]);
  assert.ok(two.bySymbol.has("Au (2 m composites, 2)"));
});

test("#3744: the raw table's intercepts are the same with and without a kept layer; the composites are cut alone, with their own sample count", () => {
  const before = computeBestIntercepts(labAssays(raw), "Au", "ppm", U, { cutoff: 1, maxInternalDilution: 2, minLength: 0 });
  assert.equal(before.length, 1, JSON.stringify(before));
  // what the dialog reads now for 'Au': the assay table only (compositeSources never touches it)
  const { sources } = compositeSources([layer]);
  const after = computeBestIntercepts(labAssays(raw), "Au", "ppm", U, { cutoff: 1, maxInternalDilution: 2, minLength: 0 });
  assert.deepEqual(after, before);
  const cs = sources[0], sym = "Au (2 m composites)";
  const onComp = computeBestIntercepts(labAssays(cs.assays), sym, "ppm", { [sym]: "ppm" }, { cutoff: 1, maxInternalDilution: 2, minLength: 0 });
  assert.equal(onComp.length, 1);
  // what the old mixing did: the raw rows cut at the composites' boundaries; keep it out
  const mixed = computeBestIntercepts(labAssays([...raw, ...cs.assays.map((a) => ({ ...a, values: { ...a.values, Au: a.values[sym] } }))]), "Au", "ppm", U, { cutoff: 1, maxInternalDilution: 2, minLength: 0 });
  assert.notDeepEqual(mixed, before, "the mixed table differs: the test would catch the old bug");
});

test("wiring: the dialog reads the chosen element's source only, and 'Also show' lists that source's elements", () => {
  const b = readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8");
  assert.match(b, /const chosenSrc = comp\.bySymbol\.get\(symbol\) \|\| null;/);
  assert.match(b, /const assaysIn = chosenSrc \? chosenSrc\.assays : assaysTable;/);
  assert.doesNotMatch(b, /\.\.\.\(assaysTable \|\| \[\]\), \.\.\./);
  assert.match(b, /const alsoSymbols = useMemo\(\(\) => \(chosenSrc \? chosenSrc\.elements\.map\(\(e\) => e\.symbol\) : \(elementsTable \|\| \[\]\)\.map\(\(e\) => e\.symbol\)\)/);
  assert.match(b, /const extraSymbols = useMemo\(\(\) => extraSymbolsKept\.filter\(\(s\) => alsoSymbols\.includes\(s\)\)/);
});

test("#3750: a composites entry reads as its element: 'Au (2 m composites)' in ppm is shown in g/t", async () => {
  const { gradeUnitLabel } = await import("../src/lib/geochemColumns.js");
  assert.equal(gradeUnitLabel("Au (2 m composites)", "ppm"), "g/t");
  assert.equal(gradeUnitLabel("Au (2 m composites, 2)", "ppm"), "g/t");
  assert.equal(gradeUnitLabel("Cu (2 m composites)", "ppm"), "ppm");
  assert.equal(gradeUnitLabel("Au", "ppm"), "g/t");
});
