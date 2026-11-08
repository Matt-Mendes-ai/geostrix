// TASKS.csv #2082 (review #2013, Surface Geology) — outcrop structure types in the logs' own codes (FLT, FLTG, FLTBX, FRAC, CF, BRX…) all
// fell into 'Other'; the import notice now names the codes still unknown.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { structureClass, STRUCTURE_CLASS_COLORS, STRUCTURE_CLASS_LABELS } from "../src/lib/mapLayers.js";
const p = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("Woodjam's structure codes class as the reviewer expected; unknown codes stay Other", () => {
  const got = Object.fromEntries(["BED", "VEIN_Uniq", "FLT", "FRAC", "BRX", "CF", "CS", "FLTG", "CU", "FLTBX", "FZ", "SHR", "JT", "BX", "VN", "CONT"].map((c) => [c, structureClass(c)]));
  assert.deepEqual(got, { BED: "bedding", VEIN_Uniq: "vein", FLT: "fault", FRAC: "joint", BRX: "breccia", CF: "contact", CS: "other", FLTG: "fault", CU: "other", FLTBX: "fault", FZ: "fault", SHR: "fault", JT: "joint", BX: "breccia", VN: "vein", CONT: "contact" });
});
test("words still work as before", () => {
  for (const [t, c] of [["Fault zone", "fault"], ["sandstone bedding", "bedding"], ["S1 foliation", "foliation"], ["slaty cleavage", "cleavage"], ["Contact", "contact"], ["quartz vein", "vein"], ["Joint", "joint"], ["hydrothermal breccia", "breccia"], ["Clay seam", "other"]]) assert.equal(structureClass(t), c, t);
});
test("breccia has a colour and a label; the import names the codes left in Other", () => {
  assert.ok(STRUCTURE_CLASS_COLORS.breccia && STRUCTURE_CLASS_LABELS.breccia === "Breccia");
  assert.match(p, /const otherTypes = \[\.\.\.new Set\(out\.rows\.filter\(\(r\) => r\.cls === "other"/);
  assert.match(p, /Type code\(s\) \{codes\} are classed as Other/);
});
