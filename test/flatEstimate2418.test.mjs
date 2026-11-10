// TASKS.csv #2418 (review #2325, WA uranium) — a flat, thin body: a cell height of its own and a flat search in the estimation dialog,
// and the data's case for them offered (never applied by itself)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { flatSearchTrend, flatSearchProposal } from "../src/lib/estimationShape.js";
import { trendBasis, trendSearchScales } from "../src/lib/trend.js";

test("a flat search is a horizontal ellipsoid: radius across, the vertical reach up and down", () => {
  const t = flatSearchTrend(200, 4);
  const b = trendBasis(t), s = trendSearchScales(t);
  assert.ok(Math.abs(b.minor.z) > 0.999); // the short axis is vertical
  assert.ok(Math.abs(b.major.z) < 1e-9 && Math.abs(b.semiMajor.z) < 1e-9);
  assert.deepEqual(s, { major: 1, semiMajor: 1, minor: 50 });
  assert.equal(flatSearchTrend(50, 50), null); // not flatter than a sphere
  assert.equal(flatSearchTrend(0, 4), null);
});

const vertical = (n, depth = 60) => Array.from({ length: n }, (_, i) => [{ x: i * 100, y: 0, z: 300 }, { x: i * 100 + 0.5, y: 0, z: 300 - depth }]);
test("vertical holes sampled over a short span, far apart: a flat search is proposed from the data", () => {
  const p = flatSearchProposal({ traces: vertical(20), spans: Array(20).fill(27), spacingM: 76, compositeM: 2 }); // WA uranium's figures
  assert.ok(p);
  assert.equal(p.radius, 190); assert.equal(p.reachV, 3); assert.equal(p.cell, 19); assert.equal(p.cellHeight, 2);
});
test("no proposal for inclined holes, a long sampled span, or drilling about as deep as it is wide", () => {
  const inclined = Array.from({ length: 20 }, (_, i) => [{ x: i * 100, y: 0, z: 300 }, { x: i * 100 + 40, y: 0, z: 240 }]);
  assert.equal(flatSearchProposal({ traces: inclined, spans: Array(20).fill(20), spacingM: 100, compositeM: 2 }), null);
  assert.equal(flatSearchProposal({ traces: vertical(20), spans: Array(20).fill(60), spacingM: 100, compositeM: 2 }), null);
  assert.equal(flatSearchProposal({ traces: vertical(5, 600), spans: Array(5).fill(20), spacingM: 100, compositeM: 2 }), null); // 600 m deep over 400 m
});

test("the dialog: a cell height, a vertical reach, and the proposal behind a button", () => {
  const m = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(m, /const cell3 = lattice \? \{ dx: lattice\.dx, dy: lattice\.dy, dz: lattice\.dz \} : \{ dx: cellSize, dy: cellSize, dz: cellDz \};/);
  assert.match(m, /const flatTrend = !modelTrend \? flatSearchTrend\(searchRadius, flatReach, tr\("flat search"\)\) : null;/);
  assert.match(m, /const trend = modelTrend \|\| flatTrend;/);
  assert.match(m, /aria-label=\{tr\("Cell height \(m\)"\)\}/);
  assert.match(m, /\{flatProposal && !proposalApplied && \(/);
});

test("the block reach of a flat search is the flat ellipsoid, not the sphere of its radius", async () => {
  const { blockReach, verticalReach } = await import("../src/lib/blockReach.js");
  const bounds = { xmin: 0, xmax: 400, ymin: 0, ymax: 400, zmin: 0, zmax: 400 }, pts = [{ x: 205, y: 205, z: 205 }]; // on a cell centre
  const sphere = blockReach(pts, bounds, 10, 100), flat = blockReach(pts, bounds, 10, 100, { rz: 5 });
  assert.ok(flat.reach < sphere.reach / 10, `${flat.reach} vs ${sphere.reach}`);
  assert.ok(flat.reach >= 300); // one level of a 100 m disc of 10 m cells (~314 cells)
  const t = flatSearchTrend(195, 3);
  assert.equal(verticalReach(195, { basis: trendBasis(t), scales: trendSearchScales(t) }), 3);
  assert.equal(verticalReach(195, null), null);
  const tilted = { name: "x", dip: 45, dipAzimuth: 90, pitch: 90, ratios: { max: 3, int: 2, min: 1 } };
  assert.equal(verticalReach(195, { basis: trendBasis(tilted), scales: trendSearchScales(tilted) }), null); // any other shape: the sphere
});
