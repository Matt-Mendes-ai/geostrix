// TASKS.csv #2280 / #2598 — the nested series says when a long schedule flattens the NPV; the by-product placeholder names a route that works
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("the panes", () => {
  const n = fs.readFileSync("src/components/NestedPitsPane.jsx", "utf8");
  assert.match(n, /long = runs\.filter\(\(r\) => r\.years > 30\)/);
  assert.match(n, /Math\.abs\(b - a\) <= 0\.01 \* Math\.max\(Math\.abs\(a\), 1\)/);
  assert.ok(n.includes('tr("The NPV is within 1 % over {n} factors in a row: the discounting flattened it."'));
  assert.ok(fs.readFileSync("src/components/PitShellPane.jsx", "utf8").includes("(Estimation › Grid: Fit to the checked holes)"));
});
