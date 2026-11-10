// TASKS.csv #2541 (review #2486, WA lithium) — the domain-restricted search: blocks whose nearest composite has no code are counted (not
// dropped in silence), or estimated as a domain of their own
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estimateBlockModel } from "../src/lib/estimation.js";

// two vertical holes 40 m apart: the west one coded P, the east one with no code
const pts = [];
for (let i = 0; i < 20; i++) {
  pts.push({ x: 0, y: 0, z: -i * 2, value: 2, hole_id: "W", length: 2, domain: "P" });
  pts.push({ x: 40, y: 0, z: -i * 2, value: 1, hole_id: "E", length: 2, domain: null });
}
const base = { bounds: { xmin: -10, xmax: 50, ymin: -10, ymax: 10, zmin: -40, zmax: 0 }, cellSize: 10, method: "idw2", searchRadius: 60, minSamples: 1, maxSamples: 8, restrictToDomain: true };

test("left out, the no-code blocks are counted", () => {
  const r = estimateBlockModel(pts, base);
  assert.ok(r.noCodeBlocks > 0, String(r.noCodeBlocks));
  assert.ok(r.blocksSkipped >= r.noCodeBlocks);
  assert.ok(r.cells.every((c) => c.value === 2)); // only the P domain was estimated
});

test("with noCodeAsDomain they are estimated from the composites with no code, never mixed with P", () => {
  const r = estimateBlockModel(pts, { ...base, noCodeAsDomain: true });
  assert.equal(r.noCodeBlocks, 0);
  const east = r.cells.filter((c) => c.x > 20), west = r.cells.filter((c) => c.x < 20);
  assert.ok(east.length > 0 && east.every((c) => c.value === 1));
  assert.ok(west.every((c) => c.value === 2));
});

test("the dialog offers it and the result says how many", () => {
  const m = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(m, /aria-label=\{tr\("Estimate the samples with no code as a domain of their own"\)\}/);
  assert.match(m, /\{result\.noCodeBlocks > 0 && <div role="note"/);
  assert.match(m, /noCodeAsDomain: restrictToDomain && !!domainKey && noCodeAsDomain/);
});
