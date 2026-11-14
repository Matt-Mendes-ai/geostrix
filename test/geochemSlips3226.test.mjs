// TASKS.csv #3226 (part, review #3195 Galore Creek) — (2) a result its values cannot give (the log of a negative number) counted apart from a
// missing element (see geochemSlips3160's case); (6) Isocon's means in significant figures, not two decimals ('0.00' for Pt, Re, Te)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/components/IsoconTool.jsx", import.meta.url), "utf8");
const { sig3 } = new Function(`${src.match(/const sig3 = [^\n]*;/)[0]} return { sig3 };`)();

test("(6) Isocon's means keep three significant figures", () => {
  assert.equal(sig3(0.0042), "0.0042"); assert.equal(sig3(0.0234), "0.0234"); assert.equal(sig3(13582.335), "13,582"); assert.equal(sig3(0), "0");
  assert.match(src, /\{sig3\(r\.precursor\)\} <span/); assert.match(src, /\{sig3\(r\.altered\)\} <span/);
  assert.doesNotMatch(src, /r\.precursor\.toFixed\(2\)/);
});

test("(2) the notice says the values could not give a result", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /could not be computed from their values \(a division by zero, the log or root of a negative number\)/);
  const c = readFileSync(new URL("../src/lib/calcElement.js", import.meta.url), "utf8");
  assert.match(c, /if \(!Number\.isFinite\(v\)\) \{ if \(ops\.length && ops\.every\(/);
});
