// TASKS.csv #3743 (Scottie Gold review; regression of #2942) — an imported assay row carries its own source string ('assay', 'pXRF'); sourceRow
// must not take it for a parent row, or the lithology lookup misses and 'by logged lithology' paints every sample grey. Synthetic rows.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { anhydrousRows, sourceRow, majorOxides } from "../src/lib/oxideTotals.js";
import { lithologyBySample } from "../src/lib/sampleLithology.js";

const els = ["Si", "Ti", "Al", "Fe", "Mn", "Mg", "Ca", "Na", "K", "P"].map((s) => ({ symbol: s, unit: "%" }));
const vals = { Si: 47.5, Ti: 1.5, Al: 15, Fe: 11, Mn: 0.2, Mg: 7, Ca: 10, Na: 2.4, K: 0.6, P: 0.3, Au: 1 };
// rows as the importers make them: each with its own source string
const assays = [
  { hole_id: "H1", from: 0, to: 1, source: "assay", values: { ...vals } },
  { hole_id: "H1", from: 1, to: 2, source: "assay", values: { ...vals } },
  { hole_id: "H1", from: 5, to: 6, source: "pXRF", values: { ...vals } },
];
const litho = [{ hole_id: "H1", from: 0, to: 1, value: "AND" }, { hole_id: "H1", from: 1, to: 3, value: "MZNA" }, { hole_id: "H1", from: 3, to: 8, value: "SLT" }];

test("#3743: an imported row (source: 'assay') is its own row: the lithology colour and the hover find its code", () => {
  const lith = lithologyBySample(assays, litho);
  const codes = assays.map((a) => lith.get(sourceRow(a)));
  assert.deepEqual(codes, ["AND", "MZNA", "SLT"], "more than one code: not every sample on the 'no code' grey");
  assert.equal(sourceRow(assays[0]), assays[0]);
  assert.equal(sourceRow(null), null);
});

test("#3743: a volatile-free copy leads back to its row and keeps the row's source string", () => {
  const majors = majorOxides(els);
  const out = anhydrousRows(assays, majors);
  assert.equal(out.length, 3);
  const lith = lithologyBySample(assays, litho);
  assert.deepEqual(out.map((r) => lith.get(sourceRow(r))), ["AND", "MZNA", "SLT"]);
  assert.deepEqual(out.map((r) => r.source), ["assay", "assay", "pXRF"], "a lab / pXRF filter still reads the copy right");
  assert.ok(out.every((r, i) => sourceRow(r) === assays[i]));
});

test("wiring: the module looks the colour and the hover line up through sourceRow", () => {
  const s = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(s, /lithColors\[sampleLith\.get\(sourceRow\(sample\)\) \?\? NOT_LOGGED\]/);
  assert.match(s, /sampleLith\.get\(sourceRow\(sm\)\)/);
});
