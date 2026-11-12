// TASKS.csv #2765 — the assay import's element list has a filter box for a large suite (symbol or column name)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const m = readFileSync(new URL("../src/components/AssayImportModal.jsx", import.meta.url), "utf8");

test("the filter narrows both list layouts; it appears above twelve elements", () => {
  assert.match(m, /e\.symbol\.toLowerCase\(\)\.includes\(f\) \|\| String\(e\.header \|\| ""\)\.toLowerCase\(\)\.includes\(f\)/);
  assert.equal((m.match(/\{shownEls\.map\(\(e\) => \(/g) || []).length, 2);
  assert.match(m, /modal\.elements\.length > 12 && <input type="search" value=\{elFilter\}/);
  assert.match(m, /const setAll = \(checked\) => onChange\(\{ \.\.\.modal, elements: modal\.elements\.map/, "All / None still act on every element");
});
