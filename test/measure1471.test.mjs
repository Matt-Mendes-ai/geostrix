// TASKS.csv #1471 — Measure's last segment: the bearing is grid (atan2 of easting / northing), and its plan length beside the 3D one.
// TASKS.csv #1538 — the readout is a card over the view (a portal), not a cell that squeezed the ribbon.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const s = readFileSync(new URL("../src/components/MeasureResults.jsx", import.meta.url), "utf8");

test("#1471: grid bearing and plan length on the last segment", () => {
  assert.ok(s.includes('tr("{v} @ {azimuth}° grid, {h} in plan (Δelev {v2}{vert} m)"'));
  assert.ok(s.includes("h: fmtLen(last.horiz)"));
});

test("#1538: rendered through a portal as a fixed card", () => {
  assert.match(s, /createPortal\(<MeasureCard \{\.\.\.props\} \/>, document\.body\)/);
  assert.match(s, /position: "fixed", right: 16, bottom: 40/);
});
