// TASKS.csv #3294 (#3226 (7), (8), Galore Creek review) — In_MEMS61_ppm held ppb (median 530 'ppm'; the crust averages 0.056 ppm) and passed every
// tool without a word; and the pXRF import took a lab file whose method codes sit inside the analyte names (no lab-job column). SYNTHETIC files.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ppmColumnsReadingPpb, UPPER_CRUST_PPM } from "../src/lib/percentAsPpm.js";
import { pxrfSignature } from "../src/lib/pxrfSignature.js";

const rows = Array.from({ length: 300 }, (_, i) => ({ In_MEMS61_ppm: String(400 + (i % 50) * 5), Au_ppm: String(0.02 + (i % 30) * 0.1), Te_ppm: String(0.5 + (i % 10) * 0.1), Cu_ppm: String(9000 + i) }));
const els = [
  { symbol: "In", header: "In_MEMS61_ppm", unit: "ppm", checked: true },
  { symbol: "Au", header: "Au_ppm", unit: "ppm", checked: true },
  { symbol: "Te", header: "Te_ppm", unit: "ppm", checked: true },
  { symbol: "Cu", header: "Cu_ppm", unit: "ppm", checked: true },
];

test("a ppm column whose median is thousands of times the crust's average is flagged as ppb; an ore grade is not", () => {
  const out = ppmColumnsReadingPpb(rows, els);
  assert.deepEqual(out.map((o) => o.symbol), ["In"]);
  assert.ok(out[0].median > 500 && out[0].crust === UPPER_CRUST_PPM.In);
  assert.deepEqual(ppmColumnsReadingPpb(rows, [{ ...els[0], unitChosen: true }]), [], "a unit the user chose");
  assert.deepEqual(ppmColumnsReadingPpb(rows, [{ ...els[0], unit: "ppb" }]), [], "already ppb");
});

test("the pXRF import sees a lab file by the method codes in its analyte names", () => {
  const s = pxrfSignature(["SAMPLE", "Au_PGM-ICP23_ppm", "Cu_OG62_pct", "In_MEMS61_ppm", "Ag_ME-MS61_ppm"]);
  assert.equal(s.looksLikeLab, true);
  assert.deepEqual(s.lab, ["Au_PGM-ICP23_ppm", "Cu_OG62_pct", "In_MEMS61_ppm", "Ag_ME-MS61_ppm"]);
  assert.equal(pxrfSignature(["Reading No", "Instrument", "Cu_ppm", "Au_PGM-ICP23_ppm", "Zn_OG62_pct"]).looksLikeLab, false, "a pXRF export");
  assert.equal(pxrfSignature(["SAMPLE", "Cu_ppm", "Zn_ppm", "Pb_ppm"]).looksLikeLab, false);
  assert.equal(pxrfSignature(["SAMPLE", "Au_FA30_ppm"]).looksLikeLab, false, "one method column is not enough");
});

test("the assay dialog says it, with ppb one click away", () => {
  const s = fs.readFileSync(new URL("../src/components/AssayImportModal.jsx", import.meta.url), "utf8");
  assert.ok(s.includes("ppmColumnsReadingPpb(modal.allRows || [], modal.elements.filter((e) => e.checked))"));
  assert.ok(s.includes('onClick={() => setUnits(ppmAsPpb.map((o) => o.symbol), "ppb")}'));
});
