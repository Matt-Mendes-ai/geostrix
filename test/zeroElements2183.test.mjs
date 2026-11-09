// TASKS.csv #2183 (review #2174, WA gold) — the assay dialog's Import is disabled with no element ticked, and the commit refuses it too
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("#2183 no 'Import 0 elements'", () => {
  const m = readFileSync(new URL("../src/components/AssayImportModal.jsx", import.meta.url), "utf8");
  assert.match(m, /disabled=\{!!modal\.busy \|\| !scan \|\| checkedCount === 0\}/);
  assert.match(m, /Tick or add at least one element to import\./);
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /if \(!chosen\.length\) \{ setNotices\(\(p\) => \[\.\.\.p, errorNotice\(tr\("Tick or add at least one element to import\."\)\)\]\); return; \}/);
});
