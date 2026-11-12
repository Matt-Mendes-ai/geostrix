// TASKS.csv #2900 (review #2876, WA bedded iron) — small slips in the import dialogs and notices: the ones fixed here
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { northRefText } from "../src/lib/azimuthRef.js";
import { rowFilterColumns } from "../src/lib/importRowFilter.js";

const modal = readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8");
const pipe = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");

test("(1) collars on a project with no CRS: the dialog says the azimuths are converted once the CRS question is answered", () => {
  assert.match(modal, /modal\.target === "collars" \/\/ #2900 \(1\)/);
  assert.ok(modal.includes(`tr("The project has no coordinate system yet: importing these collars asks for it first, and these azimuths are then converted to grid north.")`));
});

test("(2) the convergence is said as a direction (grid = true + 1.14: grid north is west of true north)", () => {
  assert.equal(northRefText("true", null, { convergence: 1.14 }), "true north (grid north 1.14° west of true north)");
  assert.equal(northRefText("true", null, { convergence: -0.5 }), "true north (grid north 0.50° east of true north)");
  assert.equal(northRefText("magnetic", "2018-06-01", { declination: 1.39, convergence: 1.1 }), "magnetic north (IGRF-14 at 2018-06-01: declination +1.39°, grid north 1.10° west of true north)");
});

test("(3) a blank code is said once; (5) a numeric layer gets no code note, and a small share is not '0 %'", () => {
  assert.ok(pipe.includes(`skippedRowsText(blankRows ? dropped.filter((d) => d.reason !== "no code") : dropped, allRows.length)`));
  assert.match(modal, /modal\.target !== "custom" && !LAYER_META\[modal\.target\]\?\.numeric \/\* #2900 \(5\)/);
  assert.equal((modal.match(/pct: blankPct\(b\.blank, b\.total\)/g) || []).length, 2);
});

test("(11) a measurement column is not a row filter; a 0 / 1 flag still is", () => {
  const rows = [
    ...Array.from({ length: 30 }, () => ({ Met_ASB_pct: "", Total_Pct: "100", Flag: "", Wet: "1", Cu_ppm: "" })),
    ...Array.from({ length: 5 }, () => ({ Met_ASB_pct: "0", Total_Pct: "", Flag: "1", Wet: "2", Cu_ppm: "5" })),
  ];
  const cols = rowFilterColumns(["Met_ASB_pct", "Total_Pct", "Flag", "Wet", "Cu_ppm"], rows).map((c) => c.col);
  assert.deepEqual(cols, ["Flag", "Wet"]);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["grid north {d}° west of true north", "grid north {d}° east of true north", ": declination {v}, {gn}", "The project has no coordinate system yet: importing these collars asks for it first, and these azimuths are then converted to grid north."]) assert.ok(d[k], `${l}: ${k}`);
  }
});
