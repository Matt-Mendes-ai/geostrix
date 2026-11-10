// TASKS.csv #2396 (review #2325, WA uranium) — Downhole logs says a log's unit and bin size, not "values as logged"
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { numericSourceChoices } from "../src/lib/numericSources.js";

test("a binned log carries its bin size and unit to the pane", () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ hole_id: "H", from: i / 2, to: i / 2 + 0.5, value: 20 + i, min: 10, max: 40, n: 9 }));
  const [g] = numericSourceChoices({ layers: {}, customLayers: [{ id: "g", name: "Gamma: eU3O8_cased_ppm", unit: "ppm", binM: 0.5, rows }] });
  assert.equal(g.binM, 0.5);
  assert.equal(g.unit, "ppm");
  const p = readFileSync(new URL("../src/components/DownholeLogsPane.jsx", import.meta.url), "utf8");
  assert.match(p, /source\?\.binM \? "\{n\} bins of \{b\} m, in \{u\}\{v\}\." : unitOf\(source\?\.unit\) \? "\{n\} readings, in \{u\}\{v\}\."/);
});
