// TASKS.csv #1830 (review #1646, Kodiak) — sending the score to the map keeps the evidence grid (and so the result) as it was
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evidenceGrid, isOverlayOutput } from "../src/lib/evidence.js";

test("a box that is a whole number of cells gives the same grid back (no rounding column)", () => {
  const g = evidenceGrid({ extent: [608488.5127197438, 5474286.82186614, 635506.0173428382, 5496687.281454838] }) // 500 x 415; was 500 x 416 again;
  const box = [g.x0 - g.dx / 2, g.yTop + g.dy / 2 - g.ny * g.dy, g.x0 - g.dx / 2 + g.nx * g.dx, g.yTop + g.dy / 2];
  const h = evidenceGrid({ extent: box });
  assert.equal(h.nx, g.nx); assert.equal(h.ny, g.ny); assert.equal(h.dx, g.dx);
});

test("the overlay's own rasters are recognized and kept out of sources and extent", () => {
  assert.equal(isOverlayOutput({ params: { tool: "fuzzy overlay" } }), true);
  assert.equal(isOverlayOutput({ params: { tool: "weights of evidence (posterior probability)" } }), true);
  assert.equal(isOverlayOutput({ params: { tool: "kriging" } }), false);
  assert.equal(isOverlayOutput({ name: "magnetics.tif" }), false);
  const p = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");
  assert.ok(p.includes("rasters.filter((r) => r.grid && !isOverlayOutput(r))"));
});
