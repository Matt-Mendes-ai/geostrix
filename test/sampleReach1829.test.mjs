// TASKS.csv #1829 / #1561 (reviews #1646 Kodiak, #1497 Lawyers) — a sample's evidence reaches about two of its own station spacings
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reachFromNeighbours, reachFromSpacing } from "../src/lib/evidenceSources.js";

// seven separate 48 m soil grids spread over 19 x 31 km, as Kodiak's 2023 program
const grids = [[0, 0], [9000, 4000], [18000, 1000], [2000, 15000], [12000, 22000], [5000, 30000], [17000, 29000]];
const soils = grids.flatMap(([gx, gy]) => Array.from({ length: 400 }, (_, i) => ({ x: 680000 + gx + (i % 20) * 48, y: 5500000 + gy + Math.floor(i / 20) * 48 })));

test("Kodiak-like soil grids: about 100 m, where the bounding box said several hundred", () => {
  const r = reachFromNeighbours(soils);
  assert.ok(r >= 90 && r <= 100, `reach ${r}`);
  assert.ok(reachFromSpacing(soils) >= 500, "the old bounding-box spacing overstates it");
});

test("outcrop clusters get the 50 m floor; a single regular grid keeps its spacing; duplicates are not neighbours", () => {
  const rocks = Array.from({ length: 60 }, (_, i) => ({ x: 690000 + Math.floor(i / 6) * 3000 + (i % 6) * 8, y: 5510000 + Math.floor(i / 6) * 2000 }));
  assert.equal(reachFromNeighbours(rocks), 50);
  const grid = Array.from({ length: 400 }, (_, i) => ({ x: (i % 20) * 100, y: Math.floor(i / 20) * 100 }));
  assert.equal(reachFromNeighbours(grid), 200);
  assert.equal(reachFromNeighbours([...grid, ...grid]), 200);
  assert.equal(reachFromNeighbours([{ x: 0, y: 0 }]), 500);
});

test("the overlay sizes sample reach from neighbours", () => {
  const p = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");
  assert.ok(p.includes("const reachOfMedium = (medium) => reachFromNeighbours("));
});
