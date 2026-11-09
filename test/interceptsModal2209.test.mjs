// TASKS.csv #2209 (review #2174, WA gold) — the Boundary intercepts modal takes one snapshot when it opens, pages its rows and keeps them
// across unrelated viewer renders
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const m = readFileSync(new URL("../src/components/BoundaryInterceptsModal.jsx", import.meta.url), "utf8");
const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");

test("the 3D view hands over the function, not a fresh array each render", () => {
  assert.doesNotMatch(v, /intercepts=\{computeIntercepts\(\)\}/);
  assert.match(v, /<BoundaryInterceptsModal\s+getIntercepts=\{computeIntercepts\}/);
});

test("one snapshot per opening; rows a page at a time, memoized on what they show; the handlers through a ref", () => {
  assert.match(m, /const \[snapshot\] = useState\(\(\) => \(getIntercepts \? getIntercepts\(\) \|\| \[\] : null\)\)/);
  assert.match(m, /export const INTERCEPT_PAGE = 500;/);
  assert.match(m, /const rowEls = useMemo\(\(\) => shown\.slice\(0, limit\)\.map/);
  assert.match(m, /\[shown, limit, excludedSet, softSet, memberSet, editingId\]\);/);
  assert.match(m, /handlers\.current\.onToggle\(i\.id\)/);
  assert.match(m, /setLimit\(\(l\) => l \+ INTERCEPT_PAGE\)/);
  assert.doesNotMatch(m, /\{shown\.map\(\(i\) => \{/); // every row is no longer drawn at once
  assert.match(m, /useEscapeKey\(onCancel\)/); // Escape still closes it
});
