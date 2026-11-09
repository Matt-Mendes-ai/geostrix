// TASKS.csv #2266 (review #2174, WA lode gold) — the log's own structure codes classed, and a per-project class for a code no rule knows
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { structureClass, structureCodeKey, parseStructureRows, STRUCTURE_CLASSES } from "../src/lib/mapLayers.js";

test("the WA log's codes: shear, S-C, the VN family, crenulation, S-zero, dyke", () => {
  for (const c of ["SH", "SHZ", "SC", "SCZ", "Shear"]) assert.equal(structureClass(c), "fault", c);
  for (const c of ["VN", "VNM", "VNS", "VNQ", "VNX", "VNW", "VNL", "VNT", "VNP", "VBR", "QZV"]) assert.equal(structureClass(c), "vein", c);
  for (const c of ["CNL", "CREN", "crenulation", "S3"]) assert.equal(structureClass(c), "cleavage", c);
  assert.equal(structureClass("SO"), "bedding");
  assert.equal(structureClass("DYK"), "contact");
  // the earlier codes keep their class (#2082)
  assert.equal(structureClass("FLTBX"), "fault");
  assert.equal(structureClass("JT"), "joint");
  assert.equal(structureClass("CON"), "contact");
  assert.equal(structureClass("S1"), "foliation");
  // still unknown: Other, so the import card asks for it
  assert.equal(structureClass("CAN"), "other");
  assert.equal(structureClass("BN"), "other");
});

test("a project's own class for a code wins, and only a real class is taken", () => {
  assert.equal(structureClass("CAN", { CAN: "contact" }), "contact");
  assert.equal(structureClass(" can ", { CAN: "contact" }), "contact"); // keyed trimmed, upper-cased
  assert.equal(structureClass("SC", { SC: "foliation" }), "foliation"); // a project reading SC as schistosity can say so
  assert.equal(structureClass("CAN", { CAN: "nonsense" }), "other");
  assert.equal(structureCodeKey(" vnm "), "VNM");
  assert.ok(STRUCTURE_CLASSES.includes("other") && STRUCTURE_CLASSES.length === 9);
});

test("parseStructureRows applies the project's classes", () => {
  const rows = [{ E: "1", N: "2", Dip: "60", DD: "90", T: "CAN" }, { E: "1", N: "2", Dip: "60", DD: "90", T: "SH" }];
  const cols = { x: "E", y: "N", dip: "Dip", dipDir: "DD", type: "T" };
  assert.deepEqual(parseStructureRows(rows, cols).rows.map((r) => r.cls), ["other", "fault"]);
  assert.deepEqual(parseStructureRows(rows, cols, { CAN: "contact" }).rows.map((r) => r.cls), ["contact", "fault"]);
});

test("the card offers a class per unknown code, saved to the project; Model from map names the Other measurements", () => {
  const p = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /Class for code \{code\}/);
  assert.match(p, /setStructureCodeClasses\(picked\)/);
  assert.match(p, /parseStructureRows\(p\.rows, p\.cols, codeClasses\)/);
  assert.match(readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8"), /structureCodeClasses: \{ \.\.\.\(p\.structureCodeClasses \|\| \{\}\), \.\.\.m \}/);
  assert.match(readFileSync(new URL("../src/components/MapModelPanel.jsx", import.meta.url), "utf8"), /none of the \{n\} outcrop measurement\(s\) is in a class ticked/);
});
