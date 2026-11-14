// TASKS.csv #3202 (#3195, Galore Creek) — a survey file's ids with no collar (test pits, hand pits) were kept silently, counted as holes and raised by
// Data QC as one error each. They are counted in the dialog (left out by default), said at import, and Data QC groups them. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { surveyIdsWithoutCollar, idList } from "../src/lib/surveyCollarCheck.js";
import { runDataQC } from "../src/lib/dataQC.js";

const collars = [{ hole_id: "DH1", x: 0, y: 0, z: 0, length: 100 }, { hole_id: "DH2", x: 50, y: 0, z: 0, length: 100 }];

test("the ids with no collar and their stations; nothing without collars or rows", () => {
  const rows = [{ BHID: "DH1" }, { BHID: "DH1" }, { BHID: "TP-01" }, { BHID: " HP-02 " }, { BHID: "TP-01" }, { BHID: "" }];
  assert.deepEqual(surveyIdsWithoutCollar(rows, collars, "BHID"), { ids: ["TP-01", "HP-02"], stations: 3 });
  assert.equal(surveyIdsWithoutCollar(rows, [], "BHID"), null, "no collars yet: a survey may come first");
  assert.equal(surveyIdsWithoutCollar([{ hole_id: "DH1" }], collars), null);
  assert.equal(idList(["a", "b", "c", "d", "e", "f"]), "a, b, c, d, e, …");
});

test("Data QC: many ids with no collar are one line naming them; a few keep their own", () => {
  const survey = [{ hole_id: "DH1", depth: 0, azimuth: 0, dip: 60 }, ...Array.from({ length: 12 }, (_, i) => ({ hole_id: `TP-${i}`, depth: 0, azimuth: 0, dip: 90 }))];
  const many = runDataQC({ project: { epsg: 26910, name: "t" }, collars, survey, layers: {}, boundaries: [], assays: [] }).issues.filter((i) => /no matching collar/.test(i.message));
  assert.equal(many.length, 1);
  assert.match(many[0].message, /^12 survey hole ids have no matching collar \(TP-0, TP-1, TP-2, TP-3, TP-4, TP-5, TP-6, TP-7, …\): their 12 stations cannot be desurveyed and won't render\.$/);
  const few = runDataQC({ project: { epsg: 26910, name: "t" }, collars, survey: survey.slice(0, 3), layers: {}, boundaries: [], assays: [] }).issues.filter((i) => /no matching collar/.test(i.message));
  assert.equal(few.length, 2);
});

test("the dialog offers to leave them out (ticked); the import leaves them out by default and says so either way", () => {
  const d = readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8");
  assert.match(d, /checked=\{modal\.dropUncollared !== false\}/);
  const p = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(p, /const noCollar = surveyIdsWithoutCollar\(all, importStateRef\.current\.collars\);/);
  assert.match(p, /if \(data\.dropUncollared !== false\) \{ const gone = new Set\(noCollar\.ids\); all = all\.filter/);
  assert.match(p, /skippedRowsText\(svDropped, allRows\.length\) \+ noCollarNote/);
});
