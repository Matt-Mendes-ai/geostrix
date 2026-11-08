// TASKS.csv #2059 (review #2013, Woodjam) — the grade shell honours Model settings › Model area, as the other modelling tools do (#1546).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { restrictRowsToHoles, checkedHoleCount } from "../src/lib/modelArea.js";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("restrictRowsToHoles keeps the checked (and never-toggled) holes and rows without a hole id", () => {
  const rows = [{ hole_id: "DH24-101", Cu: 1 }, { hole_id: "TK24-5", Cu: 2 }, { hole_id: "DH24-102", Cu: 3 }, { x: 1, y: 2 }];
  const vis = { "DH24-101": true, "TK24-5": false }; // DH24-102 never toggled: shown
  assert.deepEqual(restrictRowsToHoles(rows, vis).map((r) => r.hole_id ?? "none"), ["DH24-101", "DH24-102", "none"]);
  assert.deepEqual(restrictRowsToHoles(null, vis), []);
  assert.equal(restrictRowsToHoles(rows, null).length, 4);
  assert.deepEqual(checkedHoleCount([{ hole_id: "DH24-101" }, { hole_id: "TK24-5" }, { hole_id: "DH24-102" }], vis), { checked: 2, all: 3 });
});

test("the grade shell restricts its source rows, records the area and says it; the viewer passes the area", () => {
  const r = read("src/modules/viewer/modellingRuns.js");
  assert.match(r, /const srcRows = inArea \? restrictRowsToHoles\(numSrc \? srcData\.assays : assays, visibleHoles\) : \(numSrc \? srcData\.assays : assays\);/);
  assert.match(r, /const srcAssays = numericIncludeQAQC \? srcRows : excludeQAQC\(srcRows\);/); // everything downstream (composites, raw samples, cap audit) reads srcAssays
  assert.match(r, /modelArea: inArea \? `holes checked in the Holes list \(\$\{area\.checked\} of \$\{area\.all\}\)` : "whole property"/);
  assert.match(r, /was modelled from the \{n\} hole\(s\) checked in the Holes list/);
  assert.match(r, /if \(inArea && area\.checked < area\.all\) setNotices/); // not "the other 0 were left out"
  assert.match(read("src/modules/ViewerModule.jsx"), /modelArea, visibleHoles, \/\/ TASKS\.csv #2059/);
});
