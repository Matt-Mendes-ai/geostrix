// TASKS.csv #2194 (review #2174, WA gold) — lab repeat columns (AuRp1, AuRp2) kept as QC duplicates that QAQC pairs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { repeatColumns } from "../src/lib/geochem.js";
import { duplicatePairs } from "../src/lib/qaqc.js";

test("#2194 the repeat columns of the chosen elements", () => {
  const h = ["HOLEID", "SAMPLEID", "SAMPFROM", "SAMPTO", "Au", "AuRp1", "AuRp2", "Au_Rpt", "Au-Dup", "AU_CHK", "Au1", "Cu", "CuRp1", "Aurora"];
  assert.deepEqual(repeatColumns(h, [{ symbol: "Au", header: "Au" }]).map((r) => r.header), ["AuRp1", "AuRp2", "Au_Rpt", "Au-Dup", "AU_CHK"]);
  assert.deepEqual(repeatColumns(h, [{ symbol: "Cu", header: "Cu" }]).map((r) => r.header), ["CuRp1"]);
  assert.deepEqual(repeatColumns(["AuRp1"], [{ symbol: "Au", header: "AuRp1" }]), []); // never the column the element is read from
});

test("#2194 a 'lab repeat' row with its parent's sample id pairs in QAQC as a pulp duplicate", () => {
  const assays = [
    { hole_id: "WB1", from: 0, to: 1, values: { Au: 1.0 }, sample_id: "S1", source: "assay" },
    { hole_id: "WB1", from: 0, to: 1, values: { Au: 1.2 }, sample_id: "S1#AuRp1", parent_id: "S1", sample_type: "lab repeat", source: "assay" },
  ];
  const pairs = duplicatePairs(assays, "Au", { Au: "ppm" });
  assert.equal(pairs.length, 1); assert.equal(pairs[0].how, "parent id"); assert.equal(pairs[0].kind, "pulp");
  assert.ok(Math.abs(pairs[0].rpd - 18.18) < 0.1);
});

test("#2194 wiring: the import builds them (on by default) and says how many; the dialog offers the box", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /if \(modal\.keepRepeats !== false\) \{/);
  assert.match(g, /sample_type: "lab repeat"/);
  assert.match(g, /lab repeat\(s\) kept as QC duplicates/);
  assert.match(readFileSync(new URL("../src/components/AssayImportModal.jsx", import.meta.url), "utf8"), /Keep the lab repeats as QC duplicates/);
});
