// TASKS.csv #3728 (Scottie Gold review) — the assay import dropped its text columns (Zone, Target) without naming them and had nowhere to keep
// one. The dialog now offers them as fields kept with each sample, the notice names what was kept and what was left out, and Grade statistics /
// Compositing / Thresholds offer a kept field as a domain. Synthetic rows only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assayTextColumns, assayUsedColumns, chosenExtraColumns, defaultExtraColumns, assayAttrs, isTextColumn } from "../src/lib/assayExtraFields.js";
import { attributeDomainOptions, attributeDomainLabel } from "../src/lib/customDomains.js";
import { mergeAssayRows } from "../src/lib/geochem.js";

const headers = ["hole_id", "from", "to", "sample", "Au_ppm", "Cu_ppm", "width (m)", "Zone", "Target", "Comment", "Blank"];
const rows = Array.from({ length: 150 }, (_, i) => ({ hole_id: `SG-${1 + (i % 3)}`, from: String(i), to: String(i + 1), sample: `S${i}`, Au_ppm: "0.5", Cu_ppm: "12", "width (m)": "1.0",
  Zone: i % 2 ? "Blueberry" : "Gully", Target: i % 10 === 0 ? "T1" : "", Comment: `note ${i}`, Blank: "" }));
const mapping = { hole_id: "hole_id", from: "from", to: "to" }, qc = { sample_id: "sample" };
const elements = [{ symbol: "Au", header: "Au_ppm" }, { symbol: "Cu", header: "Cu_ppm" }];

test("the text columns on offer: not mapped, not elements, not numeric, not empty; the groupable ones ticked", () => {
  const offer = assayTextColumns(headers, rows, assayUsedColumns(mapping, qc, elements));
  assert.deepEqual(offer.map((c) => c.col), ["Zone", "Target", "Comment"], "width (m) is numeric (named by #2498), Blank is empty, sample is the QC column");
  assert.deepEqual(offer.find((c) => c.col === "Zone"), { col: "Zone", n: 150, distinct: 2 });
  assert.equal(offer.find((c) => c.col === "Target").n, 15);
  assert.ok(offer.find((c) => c.col === "Comment").distinct > 100);
  assert.deepEqual(defaultExtraColumns(offer), ["Zone", "Target"], "a 150-value note is offered, not ticked");
  assert.deepEqual(chosenExtraColumns({}, offer), ["Zone", "Target"]);
  assert.deepEqual(chosenExtraColumns({ extraCols: ["Comment", "Gone"] }, offer), ["Comment"], "the user's choice, limited to the columns on offer");
  assert.equal(isTextColumn(rows, "Au_ppm"), false);
  assert.deepEqual(assayAttrs(rows[1], ["Zone", "Target"]), { attrs: { Zone: "Blueberry" } }, "a blank cell is not kept");
  assert.deepEqual(assayAttrs(rows[1], []), {});
});

test("a kept field is a domain: Sample · Zone, one row per assay interval; a field on part of the samples too", () => {
  const assays = rows.map((r) => ({ hole_id: r.hole_id, from: +r.from, to: +r.to, values: { Au: 0.5 }, ...assayAttrs(r, ["Zone", "Target", "Comment"]) }));
  const opts = attributeDomainOptions(assays, []);
  const zone = opts.find((o) => o.key === "assay:Zone");
  assert.ok(zone, opts.map((o) => o.key).join());
  assert.equal(zone.rows.length, 150);
  assert.deepEqual([...new Set(zone.rows.map((r) => r.value))].sort(), ["Blueberry", "Gully"]);
  assert.equal(attributeDomainLabel(zone, (s, v) => s.replace("{field}", v.field)), "Sample · Zone");
  assert.equal(opts.find((o) => o.key === "assay:Target"), undefined, "one value (T1) is not a grouping");
  assert.equal(opts.find((o) => o.key === "assay:Comment"), undefined, "150 values are not a grouping");
  const two = assays.map((a, i) => (i % 10 === 0 ? { ...a, attrs: { ...a.attrs, Target: i % 20 ? "T1" : "T2" } } : a));
  assert.equal(attributeDomainOptions(two, []).find((o) => o.key === "assay:Target").rows.length, 15);
});

test("a re-import adds to a sample's kept fields, it does not wipe them", () => {
  const old = [{ hole_id: "A", from: 0, to: 1, values: { Au: 1 }, attrs: { Zone: "Gully" } }];
  const merged = mergeAssayRows(old, [{ hole_id: "A", from: 0, to: 1, values: { Cu: 5 }, attrs: { Target: "T1" } }]);
  const rowsOut = merged.rows || merged;
  assert.deepEqual(rowsOut[0].attrs, { Zone: "Gully", Target: "T1" });
  assert.deepEqual(rowsOut[0].values, { Au: 1, Cu: 5 });
});

test("wiring: the dialog section, the commit's rows and the notice", () => {
  const modalSrc = readFileSync(new URL("../src/components/AssayImportModal.jsx", import.meta.url), "utf8");
  assert.match(modalSrc, /tr\("Extra fields \(kept with each sample\)"\)/);
  assert.match(modalSrc, /assayTextColumns\(modal\.headers \|\| \[\], modal\.allRows \|\| \[\], assayUsedColumns\(modal\.mapping, modal\.qc, modal\.elements\)\)/);
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /const tagQC = \(out, r\) => Object\.assign\(out, qcFields\(r, qcCols\), assayAttrs\(r, extraCols\)\);/, "wide and long rows both go through tagQC");
  assert.match(g, /tr\("Not imported \(text\): \{cols\}\.", \{ cols: extraLeft\.join\(", "\) \}\)/);
  assert.match(g, /tr\("Kept with each sample: \{cols\}/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const j = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["Extra fields (kept with each sample)", "Not imported (text): {cols}.", "Sample · {field}"]) assert.ok(j[k], `${l}: ${k}`);
  }
});
