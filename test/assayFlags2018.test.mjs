// TASKS.csv #2018 (review #2013, Import) — '<el>_flag' columns (LDL / UDL) beside wide-format values become the rows' qualifiers;
// the plot footers state the half-detection rule only for the samples that hold a '<' value.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { flagColumns, flagQualifier, censoredSamples } from "../src/lib/assayFlags.js";
import { geochemFurniture } from "../src/lib/figureFurniture.js";
const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("an element's flag column is found by its prefix; cert / code columns are not flags", () => {
  const headers = ["sample_id", "au_cert_num", "au_analysis_code", "au_ppm", "au_flag", "cu_ppm", "Cu_qual", "ag_ppm_flag", "zn_ppm"];
  const chosen = [{ symbol: "Au", header: "au_ppm" }, { symbol: "Cu", header: "cu_ppm" }, { symbol: "Ag", header: "ag_ppm" }, { symbol: "Zn", header: "zn_ppm" }];
  const m = flagColumns(headers, chosen);
  assert.deepEqual([...m], [["Au", "au_flag"], ["Cu", "Cu_qual"], ["Ag", "ag_ppm_flag"]]);
});
test("flag codes: LDL / BDL / '<' below, UDL / OL / '>' above, anything else plain", () => {
  for (const c of ["LDL", "ldl", "BDL", "<", "<DL", "ND", "Below detection"]) assert.equal(flagQualifier(c), "<", c);
  for (const c of ["UDL", "OL", ">", "over limit", "ODL"]) assert.equal(flagQualifier(c), ">", c);
  for (const c of ["", null, "OK", "IS", "dup", "0.5"]) assert.equal(flagQualifier(c), null, String(c));
});
test("the censored count reads assay qualifiers and surface bdl lists; the figure caption says it only when counted", () => {
  const rows = [{ values: { Au: 0.0005 }, qualifiers: { Au: "<" } }, { values: { Au: 0.2 } }, { values: { Au: 0.0005 }, bdl: ["Au"] }, { values: { Cu: 1 }, qualifiers: { Cu: "<" } }];
  assert.equal(censoredSamples(rows, ["Au"]), 2);
  assert.equal(censoredSamples(rows, ["Au", "Cu"]), 3);
  const base = { title: "T", caption: "C", plotted: 4, total: 4, spider: false, date: "2026-11-08" };
  assert.match(geochemFurniture(base).caption[1], /Below-detection values substituted at half the detection limit\./); // not counted: as before
  assert.equal(geochemFurniture({ ...base, censored: 0 }).caption[1], "4 of 4 samples plotted.");
  assert.match(geochemFurniture({ ...base, censored: 2 }).caption[1], /2 of them hold a below-detection value \('<'\)/);
});
test("wired into the drillhole and surface imports and the footers", () => {
  assert.match(g, /const flagCols = format === "wide" \? flagColumns\(/);
  assert.match(g, /if \(v != null && !q && flagCols\.has\(e\.symbol\)\) \{ \/\/ #2018/);
  assert.match(g, /flagQualifier\(r\[flagCols\.get\(e\.symbol\)\]\) === "<"\) \{ bdl\.push\(e\.symbol\);/);
  assert.match(g, /censoredSamples\(plotted, diagram\.spider \? diagram\.order : diagram\.requires\)/);
  assert.match(g, /censored: censoredCount \}\);/);
});
