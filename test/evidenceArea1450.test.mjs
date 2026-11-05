// TASKS.csv #1450 (review #1352, Silvertip) — the evidence grid over a chosen area at a chosen cell size
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evidenceExtent, evidenceGrid } from "../src/lib/evidence.js";

const parts = { all: [0, 0, 31000, 56000], samples: [10000, 20000, 13500, 24700], drilling: [11000, 21000, 12000, 22500] };

test("#1450 the area picks its box (padded); a typed box; an empty or inverted box gives null", () => {
  assert.deepEqual(evidenceExtent("samples", parts), [10000, 20000, 13500, 24700]);
  assert.deepEqual(evidenceExtent("drilling", parts, null, 50), [10950, 20950, 12050, 22550]);
  assert.deepEqual(evidenceExtent("box", parts, [1, 2, 3, 4]), [1, 2, 3, 4]);
  assert.equal(evidenceExtent("box", parts, [5, 2, 3, 4]), null);
  assert.equal(evidenceExtent("box", parts, [NaN, 2, 3, 4]), null);
  assert.equal(evidenceExtent("samples", { all: parts.all, samples: null }), null);
});

test("#1450 a typed 25 m cell over the soil grid gives 140 x 188 cells instead of 112 m over 31 x 56 km", () => {
  const auto = evidenceGrid({ extent: evidenceExtent("all", parts) });
  assert.equal(Math.round(auto.dx), 112);
  const soil = evidenceGrid({ extent: evidenceExtent("samples", parts), cellSize: 25 });
  assert.deepEqual([soil.nx, soil.ny, soil.dx], [140, 188, 25]);
});

test("#1450 the pane offers the area and the cell, saves them in the recipe and builds the grid from them", () => {
  const p = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");
  assert.ok(p.includes('aria-label={tr("Grid area")}') && p.includes('aria-label={tr("Grid cell size (m)")}'));
  assert.ok(p.includes("evidenceGrid({ extent: ext, cellSize: cellTyped })"));
  assert.ok(p.includes("grid: { area: gridArea, cell: cellTyped"));
});

// TASKS.csv #1834 (review #1646, Kodiak) — the grid can be clipped to the block models' footprint (the IP block, not the whole soil program)
test("#1834 a 'model' area is the block models' box, offered when there is one", async () => {
  const { readFileSync } = await import("node:fs");
  const parts = { all: [0, 0, 19000, 31000], samples: [0, 0, 19000, 31000], drilling: null, model: [684000, 5510000, 686000, 5512200] };
  assert.deepEqual(evidenceExtent("model", parts), [684000, 5510000, 686000, 5512200]);
  assert.equal(evidenceExtent("model", { ...parts, model: null }), null);
  const g = evidenceGrid({ extent: evidenceExtent("model", parts), cellSize: 30 });
  assert.deepEqual([g.nx, g.ny], [67, 74]);
  const src = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");
  assert.ok(src.includes(`{extents.model && <option value="model">{tr("the block models' footprint")}</option>}`));
});
