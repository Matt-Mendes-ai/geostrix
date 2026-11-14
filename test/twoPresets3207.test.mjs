// TASKS.csv #3207 follow-up — a log with both a QC sample-type column and a 'Rejected?' flag: both presets apply (only the QC one did, and the
// rejected rows came in). Synthetic SG table.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { defaultRowFilter, applyRowFilter } from "../src/lib/importRowFilter.js";

const H = ["HOLE_ID", "FROM", "TO", "SG", "SG Sample Type", "Rejected?"];
const rows = [
  ...Array.from({ length: 30 }, (_, i) => ({ HOLE_ID: "SY-1", FROM: String(i * 3), TO: String(i * 3 + 0.2), SG: "2.8", "SG Sample Type": "Original", "Rejected?": "N" })),
  { HOLE_ID: "SY-1", FROM: "999", TO: "1000", SG: "2.95", "SG Sample Type": "Standard", "Rejected?": "N" },
  { HOLE_ID: "SY-1", FROM: "999", TO: "1000", SG: "1.1", "SG Sample Type": "Blank", "Rejected?": "N" },
  { HOLE_ID: "SY-1", FROM: "55", TO: "55.2", SG: "9.9", "SG Sample Type": "Original", "Rejected?": "Y" },
  { HOLE_ID: "SY-1", FROM: "56", TO: "56.2", SG: "8.1", "SG Sample Type": "Original", "Rejected?": "Y" },
];

test("the QC preset carries the reject flag, and both apply", () => {
  const f = defaultRowFilter(H, rows);
  assert.equal(f.col, "SG Sample Type"); assert.equal(f.flag, "qc");
  assert.equal(f.also.col, "Rejected?"); assert.deepEqual(f.also.keep, ["N"]); assert.equal(f.also.drop, 2);
  const r = applyRowFilter(rows, f);
  assert.equal(r.rows.length, 30); assert.equal(r.dropped, 4);
  assert.ok(r.rows.every((x) => x.SG === "2.8"));
});

test("one preset alone is as before; an assay import keeps its QC samples and still drops the rejected rows", () => {
  const onlyQc = rows.map(({ "Rejected?": _r, ...x }) => x);
  assert.equal(defaultRowFilter(H.slice(0, 5), onlyQc).also, undefined);
  const a = defaultRowFilter(H, rows, { qc: false });
  assert.equal(a.col, "Rejected?"); assert.equal(a.also, undefined);
  assert.equal(applyRowFilter(rows, a).dropped, 2);
});

test("the dialog and the notice say the second column", () => {
  const b = fs.readFileSync(new URL("../src/components/RowFilterBox.jsx", import.meta.url), "utf8");
  assert.match(b, /preset\?\.also && f === preset/);
  assert.match(b, /const kept = f\?\.also \? applyRowFilter\(rows, f\)\.rows\.length/, "the box's count includes the second column");
  const u = fs.readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(u, /rowFilter\.also \? " " \+ tr\("\{col\} was also kept only where it is \{values\}\."/);
});
