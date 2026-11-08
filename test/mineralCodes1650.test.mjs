// TASKS.csv #1650 — an interval logging several minerals was drawn and filtered by its first one only: chalcopyrite showed on 10 of
// Copley's 23 CP intervals. The plain codes are kept per interval, and the category pass shows an interval while any of them is shown.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync as readRaw } from "node:fs";
// v0.1.103 release CI: the Windows runner checks the sources out with CRLF, so the text pins compare LF text
const readFileSync = (p, enc) => readRaw(p, enc).replace(/\r\n/g, "\n");
import { allCodesOf, codeList } from "../src/lib/viewer/importHelpers.js";

test("the import keeps the plain codes beside the labelled list", () => {
  const sib = { first: "Min_Code1", firstPct: "Min_pct1", codes: ["Min_Code2", "Min_Code3"], pcts: ["Min_pct2", "Min_pct3"] };
  const a = allCodesOf({ Min_Code1: "PY", Min_pct1: "1", Min_Code2: "CP", Min_pct2: "0.3", Min_Code3: "" }, sib);
  assert.equal(a.all, "PY 1 · CP 0.3");
  assert.equal(a.extra, 1);
  assert.deepEqual(a.codes, ["PY", "CP"]);
});

test("codeList: the stored list, else read back from all_codes (projects imported before), else none", () => {
  assert.deepEqual(codeList({ codes: ["PY", "CP"], all_codes: "x" }), ["PY", "CP"]);
  assert.deepEqual(codeList({ all_codes: "PY 1 · CP 0.3 · HS" }), ["PY", "CP", "HS"]);
  assert.deepEqual(codeList({ value: "PY" }), []);
  assert.deepEqual(codeList(null), []);
});

test("the category pass shows a several-mineral interval while one of its listed codes is shown, in that code's colour", () => {
  const s = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(s, /const codes = codeList\(child\.userData\?\.row\);\n\s+if \(codes\.length > 1\) \{ const shown = codes\.find\(\(c\) => \(hidden\?\.size \? known\.has\(String\(c\)\) && !hidden\.has\(String\(c\)\) : true\)\); child\.visible = shown != null; if \(shown != null && !single && child\.material\?\.color\) child\.material\.color\.set\(effectiveColor\(key, shown\)\); return; \}/);
  assert.match(s, /\}, \[categoryFilter, syncLayerBatches, effectiveColor, layerStyles\]\);/);
  const p = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.match(p, /r\.all_codes = a\.all; r\.codes = a\.codes;/);
});
