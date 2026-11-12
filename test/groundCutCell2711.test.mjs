// TASKS.csv #2711 (split from #2634) — a closed body's cut at the ground closes within a cell of it (37-43 m cells on Harry): a body near
// the surface on coarse cells keeps up to a cell of air. The result says so when the cell height is 10 m or more and the ground cut acted.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the body run warns of a coarse cut at the ground", () => {
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /if \(altCap\.capped && cellZ >= 10\) setNotices\(\(p\) => \[\.\.\.p, notice\("\\"\{label\}\\" is cut at the ground on \{z\} m tall cells/);
  assert.ok(r.indexOf("let cellZ = cell;") < r.indexOf("if (altCap.capped && cellZ >= 10)"), "cellZ is set before");
});
