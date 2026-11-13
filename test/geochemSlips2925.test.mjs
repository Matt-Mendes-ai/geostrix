// TASKS.csv #2925 (review #2876, WA iron) — small Geochem slips: (4) the X-Y empty-frame sentence when the lithology filter hid every sample,
// (5) ticks at round values, (6) the SQL placeholder from the project's lead
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rd = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("(5) round ticks: Fe 0-72.62 by 20 or 10, not 12.1 / 24.21 …", async () => {
  // GeochemPlot.jsx is JSX: take linTicks' source and run it
  const src = rd("../src/components/GeochemPlot.jsx");
  const i = src.indexOf("export function linTicks(");
  const body = src.slice(i + "export ".length, src.indexOf("\n}", i) + 2);
  const linTicks = new Function(`${body}; return linTicks;`)();
  assert.deepEqual(linTicks(0, 72.62, 6), [0, 20, 40, 60]);
  assert.deepEqual(linTicks(35, 80, 6), [40, 50, 60, 70, 80]);
  assert.deepEqual(linTicks(0, 1, 5), [0, 0.2, 0.4, 0.6, 0.8, 1]);
  assert.deepEqual(linTicks(-1.5, 1.5, 6), [-1.5, -1, -0.5, 0, 0.5, 1, 1.5]);
  assert.deepEqual(linTicks(3, 3, 6), [3]);
});

test("(4) and (6) wiring", () => {
  assert.match(rd("../src/modules/GeochemModule.jsx"), /plottedCount === 0 && sourceRows\.length && plotted\.length \/\* #2925 \(4\)/);
  assert.match(rd("../src/components/SQLWorkspaceModal.jsx"), /placeholder=\{state\.status === "ready" \? defaultQueryFor\(state\.tables, leadFor\(assays, assayElements\)\)/);
});
