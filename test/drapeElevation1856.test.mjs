// TASKS.csv #1856 / #1823 (review #1646, Kodiak) — the flat elevation of a new raster or map layer with no terrain: collars, else the
// top of the block models under it, else the surface samples, else 0, and the import notice says which
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultDrapeElevation, modelsTopElevation, drapeElevationNote } from "../src/lib/drapeElevation.js";

// a 10 x 10 model of 50 m columns, 20 m layers from 1,400 m; ground rises east (top cell centre 1,490 at x 0 to 1,580 at x 450);
// cells above the ground hold -1 (air, a model saved before air masking)
function model() {
  const cells = [];
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) for (let k = 0; k < 12; k++) {
    const z = 1400 + 20 * k + 10, ground = 1490 + 10 * i;
    cells.push({ x: 25 + 50 * i, y: 25 + 50 * j, z, dx: 50, dy: 50, dz: 20, value: z <= ground ? 5 : -1 });
  }
  return { name: "ip", cells };
}

test("#1856 no collars: the top of the model's ground (air left out), within the layer's box when it is given", () => {
  const m = model();
  assert.deepEqual(modelsTopElevation([m]), { z: 1580, name: "ip" }, "the highest ground cell's top face: 1,570 + 10");
  assert.equal(modelsTopElevation([m], [0, 0, 120, 500]).z, 1520, "the west part only (x <= 120: columns 0-2, top 1,510 + 10)");
  assert.equal(modelsTopElevation([m], [5000, 5000, 6000, 6000]), null);
  assert.deepEqual(defaultDrapeElevation({ voxelModels: [m], surfaceSamples: [{ z: 1354 }] }), { z: 1580, source: "model", model: "ip" });
});

test("#1856 the order: collars, the model, the samples, 0", () => {
  const m = model();
  assert.deepEqual(defaultDrapeElevation({ collars: [{ z: 100 }, { z: 300 }, { z: 200 }], voxelModels: [m] }), { z: 200, source: "collars" });
  assert.deepEqual(defaultDrapeElevation({ voxelModels: [m], surfaceSamples: [{ z: 1354 }], bbox: [5000, 5000, 6000, 6000] }), { z: 1354, source: "samples" }, "no model cell under the box");
  assert.deepEqual(defaultDrapeElevation({}), { z: 0, source: "none" });
  assert.match(drapeElevationNote({ z: 1590, source: "model", model: "ip" }), /^Placed flat at 1,590 m, the top of the block model "ip" there/);
  assert.match(drapeElevationNote({ z: 0, source: "none" }), /nothing in the project gives a ground level/);
});

test("#1856 / #1823 wiring: the Raster and Geophysics imports and new map layers use it", () => {
  const r = readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8");
  assert.ok(r.includes("const drape = rasterDrapeElevation({ collars, voxelModels, surfaceSamples, bbox: raster.bbox, rasters, fileName: file.name, stations: layers?.geophys_pts });")); // #1505; stations: #2868
  assert.ok(r.includes("text: `${msg} ${drapeElevationNote(drape)}`"));
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.ok(g.includes("const drape = rasterDrapeElevation({ collars, voxelModels, surfaceSamples, bbox: raster.bbox, rasters, fileName: file.name, stations: layers?.geophys_pts /* #2868 */ }); // #1856; #1505"));
  const s = readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8");
  assert.ok(s.includes("const ground = Math.round(defaultDrapeElevation({ ...groundRef.current, bbox: layer.bbox || null }).z);"));
  assert.ok(s.indexOf("groundRef.current = { collars, surfaceSamples, voxelModels };") > s.indexOf("const [voxelModels, setVoxelModels] = useState([]);"), "after voxelModels is declared");
});
