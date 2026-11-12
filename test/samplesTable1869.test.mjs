// TASKS.csv #1869 — a samples table for the Layout (surface samples with one element, highest first) and an empty collar table that says why
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { samplesTableRows, holesWithoutCollars } from "../src/lib/samplesTable.js";

const samples = [
  { sample_id: "R1", x: 600100.4, y: 6200200.6, medium: "rock", values: { Au: 0.05 } },
  { sample_id: "R2", x: 600200, y: 6200300, medium: "rock", values: { Au: 12.3 } },
  { sample_id: "R3", x: 600300, y: 6200400, medium: "rock", values: { Au: 0.0025 }, qualifiers: { Au: "<" } },
  { sample_id: "S1", x: 600400, y: 6200500, medium: "soil", values: { Cu: 80 } },
];

test("highest first, the element's unit in the header, a '<' kept", () => {
  const t = samplesTableRows(samples, { symbol: "Au", units: { Au: "ppm" } });
  assert.deepEqual(t.rows.map((r) => r[0]), ["R2", "R1", "R3"]);
  assert.equal(t.columns[4], "Au (g/t)");
  assert.deepEqual(t.rows[0].slice(1, 4), ["600200", "6200300", "rock"]);
  assert.equal(t.rows[2][4], "<0.0025");
  assert.equal(t.total, 3);
});

test("a threshold and a row limit", () => {
  const t = samplesTableRows(samples, { symbol: "Au", units: { Au: "ppm" }, threshold: 0.01 });
  assert.deepEqual(t.rows.map((r) => r[0]), ["R2", "R1"]);
  const u = samplesTableRows(samples, { symbol: "Au", units: { Au: "ppm" }, maxRows: 1 });
  assert.equal(u.rows.length, 1);
  assert.equal(u.more, 2);
});

test("holes with assays or logs but no collar are counted", () => {
  assert.equal(holesWithoutCollars([{ hole_id: "A" }], [{ hole_id: "A" }, { hole_id: "B" }], { litho: [{ hole_id: "C" }, { hole_id: "B" }] }), 2);
  assert.equal(holesWithoutCollars([], [], {}), 0);
});

test("wired: the table branch, the insert, the sidebar and the print copy", () => {
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /if \(el\.source === "samples"\) \{/);
  assert.match(m, /onClick=\{\(\) => addElement\("samplestable"\)\}/);
  assert.match(m, /if \(type === "samplestable"\) \{ type = "table"; base\.type = "table"; base\.source = "samples";/);
  assert.match(m, /surfaceSamples, surfaceElements, layers \/\* #1869 \*\/, /);
  assert.match(m, /const k = holesWithoutCollars\(ctx\?\.collars, ctx\?\.assays, ctx\?\.layers\);/);
});
