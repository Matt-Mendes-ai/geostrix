// TASKS.csv #1626 — slope / aspect / curvature keep their values as a grid; derivatives remember their terrain.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("the builder returns a node-registered value grid for slope, aspect and curvature, none for a hillshade", () => {
  const s = fs.readFileSync("src/lib/hillshade.js", "utf8");
  assert.match(s, /if \(kind === "slope" \|\| kind === "aspect" \|\| kind === "curvature"\) \{/);
  assert.match(s, /grid = \{ nx: gridW, ny: gridH, x0: xmin, yTop: ymax, dx: cx, dy: cy, values: bytesToB64\(new Uint8Array\(vals\.buffer\)\), valid \};/);
});

test("the raster stores its terrain; the card says when that terrain was replaced, and offers no magnetic filters", () => {
  const g = fs.readFileSync("src/modules/GeophysicsModule.jsx", "utf8");
  assert.match(g, /terrainDerivative: \{ kind: derivKind, terrainId: terrain\.id \?\? null, terrainName: terrain\.name \|\| "", unit \}/);
  const r = fs.readFileSync("src/modules/RasterModule.jsx", "utf8");
  assert.match(r, /r\.terrainDerivative && r\.terrainDerivative\.terrainId != null && terrain\?\.id !== r\.terrainDerivative\.terrainId/);
  assert.match(r, /!r\.terrainDerivative \/\* #1626/);
});
