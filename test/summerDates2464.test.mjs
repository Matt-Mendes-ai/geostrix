// TASKS.csv #2464 — Spectral index proposed northern-summer dates (1 July to 15 September) on a project at 30 S
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lastSummer } from "../src/lib/summerDates.js";

test("the last completed summer of the hemisphere", () => {
  const nov2026 = new Date(2026, 10, 11);
  assert.deepEqual(lastSummer(-30, nov2026), { from: "2025-12-01", to: "2026-02-28" });
  assert.deepEqual(lastSummer(56, nov2026), { from: "2026-07-01", to: "2026-09-15" });
  assert.deepEqual(lastSummer(null, nov2026), { from: "2026-07-01", to: "2026-09-15" }); // unknown: north, as before
  assert.deepEqual(lastSummer(-30, new Date(2027, 0, 20)), { from: "2025-12-01", to: "2026-02-28" }); // January: this summer is not over
  assert.deepEqual(lastSummer(56, new Date(2026, 7, 1)), { from: "2025-07-01", to: "2025-09-15" }); // August: last year's
});

test("the dialog starts on the first area's latitude", () => {
  const src = readFileSync(new URL("../src/components/SpectralIndexModal.jsx", import.meta.url), "utf8");
  assert.match(src, /useState\(\(\) => \{ const b = areaOptions\[0\]\?\.bboxLonLat; return lastSummer\(b \? \(b\[1\] \+ b\[3\]\) \/ 2 : null\); \}\)/);
});
