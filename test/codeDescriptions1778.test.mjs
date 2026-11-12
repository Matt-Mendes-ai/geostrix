// TASKS.csv #1778 (review #1645, Copley) — a code -> description CSV sets a layer's legend labels once, for every legend.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Papa from "papaparse";
import { codeDescriptions } from "../src/lib/codeDescriptions.js";

const codes = ["ANDS", "HYBX", "IFGD", "shr", "CL-EP±CP"];
const parse = (t) => Papa.parse(t, { skipEmptyLines: true }).data;

test("a header names the columns, in any order; codes match case-insensitively and keep the layer's spelling", () => {
  const r = codeDescriptions(parse("Description,Code\nAndesite,ands\nHydrothermal breccia,HYBX\nShear zone,SHR\nBasalt,BAS\n"), codes);
  assert.equal(r.header, true);
  assert.deepEqual(r.apply, [{ value: "ANDS", label: "Andesite" }, { value: "HYBX", label: "Hydrothermal breccia" }, { value: "shr", label: "Shear zone" }]);
  assert.deepEqual(r.unmatched, ["BAS"]);
});

test("no header: the first two columns; blanks, repeats and a third column are ignored; quoted commas kept", () => {
  const r = codeDescriptions(parse('IFGD,"Feldspar porphyry, grey",x\nIFGD,Something else\nANDS,\n,Lonely\nCL-EP±CP,Chlorite-epidote ± carbonate\n'), codes);
  assert.equal(r.header, false);
  assert.deepEqual(r.apply, [{ value: "IFGD", label: "Feldspar porphyry, grey" }, { value: "CL-EP±CP", label: "Chlorite-epidote ± carbonate" }]);
  assert.deepEqual(codeDescriptions([], codes), { apply: [], unmatched: [], header: false });
});

test("the layer inspector offers it and sets labels through onSetLabel (colours untouched)", () => {
  const s = readFileSync(new URL("../src/components/LayerInspector.jsx", import.meta.url), "utf8");
  assert.match(s, /const found = codeDescriptions\(parsed\.data, categories\.map\(\(\[v\]\) => v\)\);\s*found\.apply\.forEach\(\(\{ value, label \}\) => onSetLabel\(value, label\)\);/);
  assert.match(s, /\{tr\("Descriptions from CSV…"\)\}/);
  assert.ok(!/importDescriptions[\s\S]{0,600}onSetColor/.test(s.slice(s.indexOf("const importDescriptions"), s.indexOf("const searched"))));
});
