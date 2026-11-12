// TASKS.csv #2655 — a custom layer's numeric field read where its coded sibling holds one code (GEOL_Rock2_pct where GEOL_Rock2 = P)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { siblingCodedFields, siblingRef, parseSiblingRef, siblingRows } from "../src/lib/evidenceSources.js";
import { evidenceDeps } from "../src/lib/evidenceCache.js";

const rows = [];
for (let i = 0; i < 12; i++) rows.push({ hole_id: "H", from: i, to: i + 1, GEOL_Rock2: ["P", "p", "Q", "Q"][i % 4], GEOL_Rock2_pct: 10 + i, GEOL_Rock1: "BAS", Cu_ppm: 5 * i });

test("the numeric field that starts with a coded field's name is its sibling; codes folded by case, those met 3+ times", () => {
  const s = siblingCodedFields(rows);
  assert.deepEqual(s, [{ field: "GEOL_Rock2_pct", by: "GEOL_Rock2", codes: ["P", "Q"] }]); // Cu_ppm has no coded sibling; Rock1 has no numeric field
  const ref = siblingRef("cl7", "GEOL_Rock2_pct", "GEOL_Rock2", "P");
  assert.deepEqual(parseSiblingRef(ref), { id: "cl7", f: "GEOL_Rock2_pct", c: "GEOL_Rock2", v: "P" });
  assert.equal(parseSiblingRef("custom:cl7:x"), null);
  const p = siblingRows(rows, parseSiblingRef(ref));
  assert.equal(p.length, 6); assert.ok(p.every((r) => r.GEOL_Rock2.toUpperCase() === "P"));
  assert.deepEqual(p.map((r) => r.GEOL_Rock2_pct), [10, 11, 14, 15, 18, 19]);
});

test("the card's cache follows its custom layer; the pane offers the cards and reads the rows", () => {
  const cl = { id: "cl7", rows };
  const d = { customLayers: [cl], collars: [1], survey: [2], desurveyMethod: "m" };
  assert.deepEqual(evidenceDeps({ kind: "numeric", ref: siblingRef("cl7", "GEOL_Rock2_pct", "GEOL_Rock2", "P") }, {}, d), [rows, d.collars, d.survey, d.desurveyMethod]);
  const p = fs.readFileSync("src/components/EvidenceOverlayPane.jsx", "utf8");
  assert.match(p, /for \(const s of siblingCodedFields\(cl\.rows\)\) for \(const code of s\.codes\) out\.push/);
  assert.match(p, /const sw = parseSiblingRef\(ref\); if \(sw\) \{ const cl = customLayers\.find/);
});
