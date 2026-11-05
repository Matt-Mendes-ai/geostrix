// TASKS.csv #1664 — surface rows with no coordinates are counted in the import notice; 'Control' rows with a CRM name are QC (#1794)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { qcRecordFromFileRow } from "../src/lib/surfaceQaqc.js";

test("'Control' beside a Standard Type value: blank when it says blank, else a standard with that code", () => {
  assert.equal(qcRecordFromFileRow({ sample_id: "S1", type: "Control", values: {}, attrs: { "Standard Type": "Coarse Blank - Sand" } }).kind, "blank");
  const std = qcRecordFromFileRow({ sample_id: "S2", type: "Control", values: {}, attrs: { "Standard Type": "CDN-GEO-1901" } });
  assert.equal(std.kind, "standard"); assert.equal(std.code, "CDN-GEO-1901");
  assert.equal(qcRecordFromFileRow({ sample_id: "S3", type: "REG", values: {} }), null);
});

test("the import counts rows left out for missing coordinates", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.ok(g.includes("const noXY = mappedRows.filter((r) => r && !(Number.isFinite(r.x) && Number.isFinite(r.y))).length - reprojectFailed;"));
  assert.ok(g.includes("row(s) with no easting / northing were left out"));
});
