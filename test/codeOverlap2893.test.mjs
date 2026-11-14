// TASKS.csv #2893 (review #2876, WA bedded iron) — geology_bores.csv (rock names) went into a Lithology layer of strand codes from
// geology.csv without a word, and in a multi-file drop with no dialog. The dialog now says when none of the file's codes is in the layer,
// with 'Import it as its own layer', and the queue never commits such a file unseen.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { codeOverlap, otherCodeSystem } from "../src/lib/codeOverlap.js";

const layer = [
  { hole_id: "RC1", value: "ALU", _src: "geology.csv" }, { hole_id: "RC1", value: "DID_L", _src: "geology.csv" }, { hole_id: "RC2", value: "MNG", _src: "geology.csv" },
];
const bores = [{ Hole_id: "RHDB0165", Rock1: "Alluvium" }, { Hole_id: "RHDB0165", Rock1: "Shale" }, { Hole_id: "RHDB0166", Rock1: "Alluvium" }];

test("the bore log's rock names share no code with the strand log: another code system", () => {
  const o = codeOverlap(layer, bores, "Rock1", "Hole_id");
  assert.deepEqual(o, { codes: 2, shared: 0, layerCodes: 3, holes: 2, sharedHoles: 0, files: ["geology.csv"] });
  assert.equal(otherCodeSystem(o), true);
});

test("a file that shares codes, an empty layer, or no codes: nothing to say", () => {
  assert.equal(otherCodeSystem(codeOverlap(layer, [{ H: "RC9", V: "ALU" }, { H: "RC9", V: "NEW" }], "V", "H")), false, "1 of 2 shared: the same scheme");
  // the real case: 2 of the bore log's 19 rock names (CID, DID) are strand codes too
  const strands = ["ALU", "CID", "DID", "MNG", "NJ", "NS", "CAV", "FILL"].map((v) => ({ hole_id: "RC1", value: v }));
  const rocks = ["Alluvium", "BIF", "CID", "Calcrete", "Chert", "Clay", "DID", "Detritals", "Dolomite", "Ferricrete", "Goethite", "Hematite", "Maghemite", "Manganese", "No Sample", "Shale", "Silcrete", "Silt", "Siltstone"].map((v) => ({ H: "B1", R: v }));
  const o = codeOverlap(strands, rocks, "R", "H");
  assert.equal(o.shared, 2); assert.equal(o.codes, 19); assert.equal(otherCodeSystem(o), true);
  assert.equal(codeOverlap([], bores, "Rock1", "Hole_id"), null);
  assert.equal(codeOverlap(layer, [{ Rock1: "" }], "Rock1", "Hole_id"), null);
});

test("the dialog says it with the way out; the queue opens the dialog instead of committing", () => {
  const d = readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8");
  assert.match(d, /\{f\.key === "value" && codeClash && \(/);
  assert.match(d, /const asOwnLayer = \(\) => onChange\(\{ \.\.\.modal, target: "custom", customName:/);
  const u = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(u, /const otherCodes = !LAYER_META\[target\]\?\.numeric && otherCodeSystem\(codeOverlap\(importStateRef\.current\.layers\?\.\[target\], data, mapping\.value, mapping\.hole_id\)\);/);
  assert.match(u, /exactRequired && dipsAgree && azOk && !otherCodes;/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const j = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["None of the {n} codes in {col} is in {layer}, which holds {m} codes from {files}: adding them puts two code systems in one layer.", "Only {shared} of the {n} codes in {col} are in {layer}, which holds {m} codes from {files}: adding them puts two code systems in one layer.", "Import it as its own layer", "an earlier import"]) assert.ok(j[k], `${l}: ${k}`);
  }
});
