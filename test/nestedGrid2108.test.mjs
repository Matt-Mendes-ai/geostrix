// TASKS.csv #2108 (review #2013, Woodjam) — when the nested series' grid (sized for its largest factor) is not the shell's own grid, the
// pane says so and puts factor 1's ore beside the shell's.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const p = readFileSync(new URL("../src/components/NestedPitsPane.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const s = readFileSync(new URL("../src/components/PitShellPane.jsx", import.meta.url), "utf8");
test("the shell records its grid; the pane compares (5 % tolerance) and says it", () => {
  assert.ok(s.includes("gridCellM: r.cell.map((v) => +v.toFixed(1))"));
  assert.match(p, /const sc = lastPit\?\.params\?\.gridCellM, rc = res\.cell\.map\(\(v\) => \+v\.toFixed\(1\)\);/);
  assert.match(p, /sc\.every\(\(v, i\) => Math\.abs\(v - rc\[i\]\) <= 0\.05 \* Math\.max\(1, v\)\)\) return null;/);
  assert.match(p, /so its factor-1 row \(\{a\} t of ore\) differs from the shell it was run from \(\{b\} t\)\./);
});
