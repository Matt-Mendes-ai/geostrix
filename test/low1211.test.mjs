import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { suggestQcTypes, qcRowPlacement, indexAssaysForPlacement } from "../src/lib/labCertificate.js";
import { importCheckSummary } from "../src/lib/dataQC.js";
import { rasterFloorZ } from "../src/lib/evidenceSources.js";
import { categoryColor, categoryLabel } from "../src/lib/layers.js";

const ids = (rows) => Object.fromEntries(rows.map((r) => [r.sample_id, r]));
const cols = [{ symbol: "Cu" }];
const row = (sample_id, Cu) => ({ sample_id, Cu: String(Cu) });
test("#1211 names suggest a type: standards by material, a duplicate finds its original", () => {
  const drill = Array.from({ length: 30 }, (_, i) => row(`L6926${10 + i}`, 50 + i * 37));
  const out = ids(suggestQcTypes([row("OREAS 252-1", 901), row("OREAS 252-2", 955), row("L692633-DUP", 3), row("BLANK-1", 777), row("MYSTERY", 400)], drill, cols));
  assert.equal(out["OREAS 252-1"].type, "standard");
  assert.equal(out["OREAS 252-1"].qc_code, "OREAS 252");
  assert.equal(out["L692633-DUP"].type, "duplicate");
  assert.equal(out["L692633-DUP"].parent_id, "L692633");
  assert.equal(out["BLANK-1"].type, "blank");
  assert.equal(out.MYSTERY.type, "unclassified");
});
test("#1211 a name sharing its prefix with drill samples is a drill sample's name, not a marker", () => {
  const drill = Array.from({ length: 30 }, (_, i) => row(`BLK22-${100 + i}`, 50 + i * 37));
  assert.equal(suggestQcTypes([row("BLK22-900", 411)], drill, cols)[0].type, "unclassified");
});
test("#1211 standards and blanks always place; a duplicate needs its original", () => {
  const idx = indexAssaysForPlacement([{ hole_id: "H1", from: 0, to: 2, sample_id: "S100" }, { hole_id: "H1", from: 2, to: 4, sample_id: "S101" }]);
  assert.deepEqual(qcRowPlacement({ sample_id: "OREAS 252-1", type: "standard" }, idx), { hole_id: "OREAS 252-1", from: 0, to: 0, own: true });
  assert.deepEqual(qcRowPlacement({ sample_id: "S102", type: "blank" }, idx), { hole_id: "H1", from: 4, to: 4 });
  assert.equal(qcRowPlacement({ sample_id: "X-DUP", type: "duplicate" }, idx), null);
  assert.deepEqual(qcRowPlacement({ sample_id: "S101-DUP", type: "duplicate", parent_id: "S101" }, idx), { hole_id: "H1", from: 2, to: 4 });
});
test("#1204 the floor is a round elevation under the deepest point", () => {
  assert.equal(rasterFloorZ(new Map([["A", [{ z: 1000 }, { z: 613 }]], ["B", [{ z: 980 }, { z: 707 }]]])), 600);
  assert.equal(rasterFloorZ(new Map()), null);
});
test("#1289 one resolver", () => {
  const meta = { colorFn: () => "#111", nameFn: (v) => (v === "A" ? "Andesite" : "") };
  assert.equal(categoryColor(undefined, meta, "A"), "#111");
  assert.equal(categoryColor({ color: "#222" }, meta, "A"), "#222");
  assert.equal(categoryLabel(undefined, meta, "A"), "Andesite");
  assert.equal(categoryLabel(undefined, meta, "B"), "B");
  assert.equal(categoryLabel({ label: "Mine" }, meta, "A"), "Mine");
  assert.equal(categoryLabel({ label: undefined }, { colorFn: meta.colorFn }, "C"), "C");
  const log = readFileSync("src/components/StripLog.jsx", "utf8");
  for (const k of ["vein", "breccia", "structzone", "mnlgy"]) assert.ok(log.includes(`nameFn: nameOf("${k}")`), k);
});
test("#1211 a standard under its own name is not a hole with no collar; a plain row still is", () => {
  const collars = [{ hole_id: "H1", length: 100 }];
  const qc = { hole_id: "OREAS 252-1", from: 0, to: 0, sample_type: "standard" };
  assert.ok(!/no collar/.test(importCheckSummary([qc], collars, []) || ""));
  assert.match(importCheckSummary([{ hole_id: "H9", from: 0, to: 1 }], collars, []), /no collar/);
});
