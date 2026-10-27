// TASKS.csv #1022 — exported CSVs keep every column of mixed row kinds and neutralise formula cells
import test from "node:test";
import assert from "node:assert/strict";
import Papa from "papaparse";
import { toExportCsv } from "../src/lib/tabular.js";

test("#1022 the header is the union of all rows' keys (Surface QA/QC: batch rows, then failures)", () => {
  const rows = [
    { section: "batch", batch: "B1", samples: 40, standards: 2 },
    { section: "standard Au (ppb)", batch: "B1", sample_id: "S0101", code: "OREAS 501", value: 312, expected: 250, z: 3.1 },
    { section: "duplicate Au (ppb)", batch: "B1", sample_id: "S0120", parent: "S0119", original: 10, duplicate: 30, rpd_pct: 100 },
  ];
  const { data, meta } = Papa.parse(toExportCsv(rows), { header: true, skipEmptyLines: true });
  for (const k of ["sample_id", "code", "value", "expected", "z", "parent", "rpd_pct"]) assert.ok(meta.fields.includes(k), `${k} kept`);
  assert.equal(data[1].sample_id, "S0101"); assert.equal(data[1].z, "3.1"); assert.equal(data[2].rpd_pct, "100");
  assert.equal(data[0].sample_id, ""); // a batch row has no sample: empty, not shifted
});

test("#1022 formula-leading text is escaped; numbers, negative numbers, '<' values and station labels are not", () => {
  const csv = toExportCsv([{ a: "=HYPERLINK(\"x\")", b: "@SUM(A1)", c: -60, d: "-60", e: "<0.005", f: "+100", g: "-x", h: "L+0 S+25" }]);
  const [r] = Papa.parse(csv, { header: true }).data;
  assert.equal(r.a, "'=HYPERLINK(\"x\")"); assert.equal(r.b, "'@SUM(A1)"); assert.equal(r.g, "'-x");
  assert.deepEqual([r.c, r.d, r.e, r.f, r.h], ["-60", "-60", "<0.005", "+100", "L+0 S+25"]);
});
