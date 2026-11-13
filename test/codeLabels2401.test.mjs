// TASKS.csv #2401 — a blank code was an unlabelled group in Downhole logs, and long code names were cut at the left of the box plot
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("one label rule for the box plot and the ranking sentence", () => {
  const src = readFileSync(new URL("../src/components/DownholeLogsPane.jsx", import.meta.url), "utf8");
  const i = src.indexOf("function codeLabel(k, max = 0) {");
  assert.ok(i > 0);
  const body = src.slice(i, i + 400);
  assert.match(body, /k === NOT_LOGGED \? tr\("\(not logged\)"\) : String\(k \?\? ""\)\.trim\(\) === "" \? tr\("\(blank\)"\) : String\(k\)/);
  assert.match(body, /max && t\.length > max \? `\$\{t\.slice\(0, max - 1\)\}…` : t/);
  assert.match(src, /domainLabel=\{\(k\) => `\$\{codeLabel\(k, 16\)\}/);
  assert.match(src, /(groups|\(ranked\.common\.length \? ranked\.common : groups\))\.slice\(0, 8\)\.map\(\(g\) => `\$\{codeLabel\(g\.key\)\}/); // #2951 — the codes at or above the minimum count
});
