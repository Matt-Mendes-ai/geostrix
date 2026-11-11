// TASKS.csv #1837 — with no terrain and no holes the score sheet lies just above the block models, and the notice says its elevation
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { scoreRasterPlacement } from "../src/lib/evidenceSources.js";

test("no terrain, no holes: just above the highest block model; with nothing at all, flat as before", () => {
  const models = [{ cells: [{ x: 0, y: 0, z: 1700, dz: 40 }, { x: 0, y: 0, z: 900, dz: 40 }] }, { cells: [{ x: 0, y: 0, z: 1500, dz: 20 }] }];
  assert.deepEqual(scoreRasterPlacement(null, [], [], new Map(), models), { drapeMode: "flat", kind: "above", elevation: 1730 });
  assert.deepEqual(scoreRasterPlacement(null, [], [], new Map(), []), { drapeMode: "flat", kind: "flat" });
  assert.equal(scoreRasterPlacement({ elevations: [] }, [], [], new Map(), models).kind, "terrain"); // a terrain still wins
});

test("the pane passes the models and names the elevation", () => {
  const p = fs.readFileSync("src/components/EvidenceOverlayPane.jsx", "utf8");
  assert.match(p, /scoreRasterPlacement\(terrain, drilledCollars\(collars\)\.collars, survey, traces, voxelModels\)/);
  assert.match(p, /place\.kind === "above" \? tr\("Added \\"\{name\}\\" to the map, flat at elevation \{z\} m, just above the block models/);
});
