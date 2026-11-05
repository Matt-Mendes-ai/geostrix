// TASKS.csv #1518 — immobile-element tools warn when Zr / Hf / Nb / Ta / Y / REE came from a partial digestion
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PARTIAL_DIGESTION, methodColumnFor, methodsIn, partialDigestionFor } from "../src/lib/digestion.js";

test("lab codes: four-acid and aqua regia are partial; fusion / lithium borate are not", () => {
  for (const c of ["ME-MS61", "ME-ICP61", "ME-MS41", "MA250", "AQ200", "GE_ICP40Q", "4A", "four-acid", "aqua regia"]) assert.ok(PARTIAL_DIGESTION.test(c), c);
  for (const c of ["ME-MS81", "ME-XRF26", "LF100", "FUS-MS", "Au-ICP21", ""]) assert.ok(!PARTIAL_DIGESTION.test(c), c);
});

test("the method column of a wide file, and its codes", () => {
  const headers = ["hole_id", "from", "to", "zr_ppm", "zr_analysis_code", "ti_pct", "ti_analysis_code", "au_ppm"];
  assert.equal(methodColumnFor(headers, "Zr"), "zr_analysis_code");
  assert.equal(methodColumnFor(headers, "Au"), null);
  assert.deepEqual(methodsIn([{ zr_analysis_code: "ME-MS61" }, { zr_analysis_code: "ME-MS61" }], "zr_analysis_code"), ["ME-MS61"]);
});

test("the warning names the resistant elements measured by a partial digestion only", () => {
  const els = [{ symbol: "Zr", methods: ["ME-MS61"] }, { symbol: "Ti", methods: ["ME-MS61"] }, { symbol: "Nb", methods: ["ME-MS81"] }, { symbol: "Y", methods: ["ME-MS61"] }];
  assert.deepEqual(partialDigestionFor(els, ["Zr", "Ti", "Nb", "Y"]), [["Zr", "ME-MS61"], ["Y", "ME-MS61"]]);
  assert.deepEqual(partialDigestionFor([{ symbol: "Zr" }], ["Zr"]), [], "no method kept: no claim");
});

test("wired: the import keeps methods; the caption, the exported figure and the classifier notice warn", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /methodsIn\(allRows, methodColumnFor\(/);
  assert.equal((g.match(/partialDigestionFor\(assayElements, (diagram|method)\.requires\)/g) || []).length, 3);
});
