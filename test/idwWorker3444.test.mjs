// TASKS.csv #3444 — IDW of a point survey in a worker, with progress and Cancel (the #3363 follow-up)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { idwGrid } from "../src/lib/idw.js";
import { idwGridAsync } from "../src/lib/idwGridClient.js";

const pts = Array.from({ length: 3000 }, (_, i) => ({ x: (i * 37) % 1000, y: (i * 91) % 1000, value: (i % 17) + 1 }));
const box = { xmin: 0, ymin: 0, xmax: 1000, ymax: 1000, cellSize: 10, power: 2, maxDistance: 80 };

test("#3444 idwGrid reports its rows; the result is the same with or without the hook", () => {
  const seen = [];
  const a = idwGrid(pts, { ...box, onRow: (row, rows) => seen.push([row, rows]) });
  const b = idwGrid(pts, box);
  assert.deepEqual(Array.from(a.values), Array.from(b.values));
  assert.equal(seen[0][0], 0); assert.equal(seen[0][1], 100); assert.ok(seen.length >= 12 && seen.length <= 13); assert.ok(seen.every(([r], i) => r === i * 8));
});

test("#3444 with no Worker (Node) the client runs the same code and resolves the grid", async () => {
  const job = idwGridAsync(pts, box);
  const r = await job.promise;
  assert.equal(r.gridW, 100); assert.equal(r.gridH, 100);
  assert.deepEqual(Array.from(r.values), Array.from(idwGrid(pts, box).values));
  job.cancel(); // after it finished: nothing to cancel, no throw
});

test("#3444 the Generate button uses the worker, shows the rows done and has a Cancel; the level set stays synchronous", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(g, /const job = idwGridAsync\(pts, \{ xmin, ymin, xmax, ymax, cellSize: idwCellSize, power: idwPower, maxDistance: blank \}/);
  assert.match(g, /raster = gridValuesToRasterInput\(res\.values, res\.gridW, res\.gridH, \{ xmin, ymax, cellSize: idwCellSize, name: gName, stretch: idwStretch \}\);/);
  assert.match(g, /\{idwMethod !== "spline" && <button type="button" onClick=\{\(\) => idwCancel\.current\?\.\(\)\}/);
  assert.doesNotMatch(g, /This grid has \{cells\} cells\. IDW runs in this window/);
  const w = readFileSync(new URL("../src/lib/idwGrid.worker.js", import.meta.url), "utf8");
  assert.match(w, /self\.postMessage\(r, \[r\.values\.buffer\]\)/);
});
