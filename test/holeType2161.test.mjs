// TASKS.csv #2161 (WA drillhole review) — the hole type column found and its spellings normalized into a 'hole type' collar field
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { holeTypeColumn, normalizeHoleType } from "../src/lib/holeType.js";

test("#2161 the column, whatever it is called", () => {
  for (const h of ["Hole_Type", "HoleType", "Drill_code", "Drill Code", "DRILL_TYPE", "DrillType", "DrillholeType", "Rig_Type", "Drill_Method", "DH_Type"]) assert.equal(holeTypeColumn(["HOLEID", "EAST", h]), h, h);
  for (const h of ["Hole_Status", "Hole_Purpose", "Sample_Type", "Type"]) assert.equal(holeTypeColumn(["HOLEID", h]), null, h);
});

test("#2161 the spellings", () => {
  const want = { RC: "Reverse circulation (RC)", GCRC: "Reverse circulation (RC)", DD: "Diamond (DD)", DDH: "Diamond (DD)", D: "Diamond (DD)", "RC/DD": "RC + diamond tail", RCD: "RC + diamond tail", RAB: "RAB", PHRAB: "RAB",
    AC: "Aircore (AC)", AIRCORE: "Aircore (AC)", "AIR CORE": "Aircore (AC)", RCAC: "RC / aircore", VAC: "Vacuum", AU: "Auger", AUGER: "Auger", NR: "Not stated", DRILLHOLE: "Not stated", rc: "Reverse circulation (RC)" }; // #2488: RC in full
  for (const [raw, cls] of Object.entries(want)) assert.equal(normalizeHoleType(raw), cls, raw);
  assert.equal(normalizeHoleType(""), null); assert.equal(normalizeHoleType("Costean"), "COSTEAN"); // unknown: kept as written
});

test("#2161 the collar import adds it beside the file's own column", () => {
  const p = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.match(p, /"hole type": ht/);
  assert.match(p, /\.\.\.withHoleType\(surfaceAttrs\(r, attrCols\), r\)/);
});
