// TASKS.csv #1419 — MLS (linear) on Silvertip gave a mean 87 % above nearest neighbour with 529 of 533 blocks extrapolated, and
// only the generic mean-gap note; it now says why when most blocks are extrapolated
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("an MLS run with mostly extrapolated blocks carries a method-specific warning", () => {
  const s = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(s, /result\.params\?\.method === "mls1" && result\.supportCounts && result\.blocksEstimated > 0 && result\.supportCounts\.extrapolated \/ result\.blocksEstimated > 0\.5/);
  assert.match(s, /Moving least squares fits a linear trend through each block's samples, and \{pct\}% of these blocks lie beyond the holes/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const j = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    assert.ok(Object.keys(j).some((k) => k.startsWith("Moving least squares fits a linear trend")), l);
  }
});
