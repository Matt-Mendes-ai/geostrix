// TASKS.csv #2149 — mTo / ToDepth / DepthTo / dTo / EndDepth read as the interval To column (WAMEX and DMIRS headers)
import test from "node:test";
import assert from "node:assert/strict";
import { TARGET_SCHEMAS, guessColumn, guessMapping } from "../src/lib/layers.js";
import { looksLikeAssay } from "../src/lib/viewer/importHelpers.js";
import { detectLongAssay } from "../src/lib/longAssays.js";

const aliasesOf = (schema, key) => TARGET_SCHEMAS[schema].fields.find((f) => f.key === key).aliases;

test("the interval schemas read the WAMEX / DMIRS from and to names", () => {
  for (const [from, to] of [["mFrom", "mTo"], ["FromDepth", "ToDepth"], ["DepthFrom", "DepthTo"], ["dFrom", "dTo"], ["StartDepth", "EndDepth"], ["m_from", "m_to"], ["From (m)", "To (m)"]]) {
    const headers = ["HoleID", from, to, "Lith_Code"];
    for (const schema of ["litho", "alt", "custom"]) {
      assert.equal(guessColumn(headers, aliasesOf(schema, "from")), from, `${schema} from ${from}`);
      assert.equal(guessColumn(headers, aliasesOf(schema, "to")), to, `${schema} to ${to}`);
    }
  }
});

test("the short names match a whole header only", () => {
  assert.equal(guessColumn(["HoleID", "From", "Comment_total"], aliasesOf("litho", "to")), "");
  assert.equal(guessColumn(["HoleID", "From", "photo_dtop"], aliasesOf("litho", "to")), "");
});

test("a whole mapping of an alteration table with FromDepth / ToDepth", () => {
  const m = guessMapping("alt", ["HoleId", "FromDepth", "ToDepth", "AltCode"]);
  assert.equal(m.from, "FromDepth");
  assert.equal(m.to, "ToDepth");
  const cu = guessMapping("custom", ["HoleId", "FromDepth", "ToDepth", "AltCode"]);
  assert.equal(cu.from, "FromDepth");
  assert.equal(cu.depth, "", "the from column is not also the point depth");
  assert.equal(guessMapping("custom", ["HoleId", "Depth", "Reading"]).depth, "Depth");
});

test("assay detection and the long-format detector", () => {
  assert.equal(looksLikeAssay(["HoleID", "mFrom", "mTo", "SampleID", "Au_ppm"]), true);
  assert.equal(looksLikeAssay(["HoleID", "FromDepth", "ToDepth", "SampleID", "Au_ppm"]), true);
  assert.equal(looksLikeAssay(["HoleID", "dFrom", "dTo", "SampleID", "Au_ppm"]), true);
  const long = detectLongAssay(["HoleID", "FromDepth", "ToDepth", "SampleID", "Analyte", "Value"]);
  assert.equal(long.from, "FromDepth");
  assert.equal(long.to, "ToDepth");
  assert.equal(detectLongAssay(["HoleID", "mFrom", "mTo", "Analyte", "Value"]).to, "mTo");
});
