// TASKS.csv #1553 — the Structures picker listed types with no oriented picks (VnGy: 13 picks, 0 oriented) and no counts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("each type shows how many of its picks are oriented, and a type with none cannot be chosen", () => {
  const s = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(s, /const structCounts = useMemo\(/);
  assert.match(s, /Number\.isFinite\(Number\(r\.dip\)\) && Number\.isFinite\(Number\(r\.azimuth\)\)/);
  assert.match(s, /<option key=\{u\} value=\{u\} disabled=\{!c\.k\}>\{tr\("\{type\} · \{k\} of \{n\} oriented", \{ type: u, k: c\.k, n: c\.n \}\)\}<\/option>/);
});
