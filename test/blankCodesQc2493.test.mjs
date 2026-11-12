// TASKS.csv #2493 (review #2486, WA lithium; Matt's decision 2026-11-12, as proposed) — blank codes: always said, optionally kept as
// "(no code)"; the rows an import left out kept with the project; Data QC infos: holes missing from a layer most holes have (assayed counted
// apart), logs ending more than 1 m short of the hole, the rows the imports left out.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { NO_CODE, blankCodeText } from "../src/lib/viewer/importHelpers.js";
import { withImportLeftOut, importLeftOutList } from "../src/lib/importLeftOut.js";
import { coverageInfos, SHORT_M } from "../src/lib/dataQcCoverage.js";
import { checkableHoleLengths, runDataQC } from "../src/lib/dataQC.js";

test("#2493 the blank-code line: always said, with what became of the rows", () => {
  assert.equal(NO_CODE, "(no code)");
  assert.equal(blankCodeText("Rock1", 3, 100), "3 of 100 row(s) have a blank Rock1: 3 skipped.");
  assert.equal(blankCodeText("Rock1", 1998, 20000, 400, 1598), "1,998 of 20,000 row(s) have a blank Rock1: 400 took the code of the next code column, 1,598 kept as (no code).");
  assert.equal(blankCodeText("Rock1", 5, 9, 2, 0), "5 of 9 row(s) have a blank Rock1: 2 took the code of the next code column, 3 skipped.");
});

test("#2493 what an import left out, kept per layer and file; a clean re-import removes the entry", () => {
  const p0 = { name: "P" };
  const dropped = [{ reason: "no code" }, { reason: "no code" }, { reason: "no from" }];
  const p1 = withImportLeftOut(p0, "litho", "geo.csv", dropped, 120);
  assert.deepEqual(p1.importLeftOut, { litho: { "geo.csv": { n: 3, total: 120, why: { "no code": 2, "no from": 1 } } } });
  assert.equal(p0.importLeftOut, undefined, "the input is not changed");
  assert.equal(withImportLeftOut(p1, "alt", "x.csv", [], 10), p1, "nothing left out, nothing there: the same object");
  const p2 = withImportLeftOut(p1, "alt", "alt.csv", [{ reason: "no hole id" }], 5);
  assert.deepEqual(importLeftOutList(p2).map((e) => [e.layerKey, e.file, e.n]), [["litho", "geo.csv", 3], ["alt", "alt.csv", 1]]);
  const p3 = withImportLeftOut(p2, "litho", "geo.csv", [], 120);
  assert.equal(p3.importLeftOut.litho, undefined, "the file re-imported with nothing left out");
  assert.equal(withImportLeftOut(p3, "alt", "alt.csv", [], 5).importLeftOut, undefined);
});

const iv = (hole, to, value = "SA") => ({ hole_id: hole, from: to - 5, to, value });

test("#2493 Data QC infos: holes missing from a layer most holes have (assayed apart), logs short of the hole, rows left out", () => {
  const collars = ["H1", "H2", "H3", "H4", "H5"].map((h) => ({ hole_id: h, length: 50 }));
  const layers = { litho: [iv("H1", 50), iv("H2", 50), iv("H3", 45), iv("H4", 48.5)], alt: [iv("H1", 10)] };
  const assays = [{ hole_id: "H5", from: 0, to: 1, values: {} }];
  const project = withImportLeftOut({}, "litho", "geo.csv", [{ reason: "no code" }, { reason: "no code" }], 300);
  const infos = coverageInfos({ collars, layers, assays, lengths: checkableHoleLengths(collars, []), project, customLayers: [{ name: "Gamma", rows: [{}], notes: "12 rows binned." }] });
  const msgs = infos.map((i) => `${i.category} | ${i.message}`);
  assert.ok(msgs.some((m) => m === "Lithology | 1 of 5 holes with a collar have no Lithology rows, 1 of them assayed (checked because more than half the holes have this layer): H5."), msgs.join("\n"));
  assert.ok(!msgs.some((m) => /Alteration/.test(m)), "alteration: only 1 of 5 holes (not 'most'), and not checked for short logs");
  assert.equal(SHORT_M, 1);
  assert.ok(msgs.some((m) => m === "Lithology | 2 hole(s) have their Lithology log ending more than 1 m short of the hole's length: H3 (45 of 50 m), H4 (48.5 of 50 m)."), msgs.join("\n")); // H1 / H2 reach 50 m
  assert.ok(msgs.some((m) => m === "Lithology | 2 of 300 row(s) of geo.csv were left out of Lithology at import: 2 blank code."), msgs.join("\n"));
  assert.ok(msgs.some((m) => m === "Gamma | Gamma: 12 rows binned."));
  // in runDataQC, as infos
  const { issues } = runDataQC({ project, collars: collars.map((c) => ({ ...c, x: 0, y: 0, z: 0 })), survey: [], layers, boundaries: [], assays, customLayers: [] });
  assert.ok(issues.some((i) => i.severity === "info" && /left out of Lithology at import/.test(i.message)));
});

test("#2493 a 1.5 m short log counts, 1 m or less does not; a cleared layer says nothing about what was left out", () => {
  const collars = ["A", "B"].map((h) => ({ hole_id: h, length: 50 }));
  const infos = coverageInfos({ collars, layers: { litho: [iv("A", 48.5), iv("B", 49)] }, lengths: checkableHoleLengths(collars, []) });
  assert.match(infos.map((i) => i.message).join("\n"), /1 hole\(s\) have their Lithology log ending more than 1 m short of the hole's length: A \(48\.5 of 50 m\)\./);
  const left = withImportLeftOut({}, "alt", "alt.csv", [{ reason: "no code" }], 4);
  assert.equal(coverageInfos({ collars, layers: { alt: [] }, project: left }).length, 0);
});

test("#2493 wiring: the dialog's choice, the import's use of it, the left-out record, Data QC's custom layers", () => {
  const dlg = fs.readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8");
  assert.match(dlg, /onChange=\{\(e\) => onChange\(\{ \.\.\.modal, keepBlankCodes: e\.target\.checked \}\)\}/);
  assert.match(dlg, /if \(!b \|\| !b\.blank\) return null;/, "said from the first blank row");
  const imp = fs.readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.match(imp, /else if \(data\.keepBlankCodes\) \{ r\.value = NO_CODE; blankKept\+\+; \}/);
  assert.match(imp, /recordImportLeftOut\?\.\(target, fileName, dropped, allRows\.length\);/);
  // the setter the import calls is one the store really gives (a guarded call to a missing setProject recorded nothing, found live)
  const store = fs.readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8");
  assert.match(store, /const recordImportLeftOut = useCallback\(\(layerKey, file, dropped, total\) => setProject\(\(p\) => withImportLeftOut\(p, layerKey, file, dropped, total\)\), \[\]\);/);
  assert.match(store, /\r?\n {4}recordImportLeftOut, \/\/ TASKS\.csv #2493\r?\n/); // CRLF in a Windows checkout
  assert.match(imp, /blankCodeText\(mapping\.value, blankRows, allRows\.length, blankTookNext, blankKept\)/);
  const modal = fs.readFileSync(new URL("../src/components/DataQCModal.jsx", import.meta.url), "utf8");
  assert.match(modal, /terrain, customLayers,/);
});
