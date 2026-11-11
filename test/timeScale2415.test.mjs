// TASKS.csv #2415 (review #2325) — 'Time-scale colours' fetches Macrostrat over the internet: its label, tooltip and offline message say so
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the button says it is online", () => {
  const p = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /\{tr\("Time-scale colours \(online\)"\)\}<\/button>/);
  assert.match(p, /fetched from Macrostrat \(CC BY 4\.0\) over the internet\. The others keep their colours\."\)\}/);
  assert.match(p, /The time-scale colours come from Macrostrat over the internet: offline, the units keep their colours\./);
});
