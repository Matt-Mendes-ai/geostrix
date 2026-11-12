// TASKS.csv #2590 / #2125 — a raster or georeferenced picture far from the drilling was 'placed 5 m above the highest collar under it' with
// no collar under it, pushed the next raster up although they did not overlap, and was offered as a fetch area with no word
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { farFromCollars, farNote, farLabel, collarsBox } from "../src/lib/landingCheck.js";
import { rasterDrapeElevation, drapeElevationNote } from "../src/lib/drapeElevation.js";

// the WA review's collars (MGA 50, 410,000-416,000 E) and its mine-grid picture (7,004-12,006 E / 8,495-13,002 N read as MGA)
const collars = [];
for (let i = 0; i < 5; i++) collars.push({ hole_id: `C${i}`, x: 410000 + i * 1500, y: 6249000 + i * 800, z: 320 + i * 2 });
const mineGridPicture = [7004, 8495, 12006, 13002];
const onCollars = [409500, 6248500, 416500, 6253000];

test("far: a footprint that does not reach the collars and lies farther than their extent; near or overlapping is not", () => {
  const f = farFromCollars(mineGridPicture, collars);
  assert.ok(f && f.distM > 6.2e6 && f.distM < 6.3e6, JSON.stringify(f));
  assert.equal(f.dir, 4); // south (403 km west, 6,240 km south)
  assert.equal(farFromCollars(onCollars, collars), null);
  assert.equal(farFromCollars([416100, 6249000, 417000, 6250000], collars), null); // just beside: a neighbouring grid
  // 409 km west (the Woodjam wrong-zone GeoTIFF)
  assert.equal(farFromCollars([1000, 6249000, 2000, 6250000], collars).dir, 6);
  assert.equal(farFromCollars(mineGridPicture, []), null); // nothing to measure against
  assert.deepEqual(collarsBox(collars), [410000, 6249000, 416000, 6252200]);
  assert.match(farNote(f), /^It lies about 6,2\d\d km south of the drillholes: check its CRS, or its control points/);
  assert.equal(farLabel("Boundary: pit", f), `Boundary: pit (far from the drillholes: about ${Math.round(f.distM / 1000).toLocaleString()} km)`);
  assert.equal(farLabel("Raster: plan", null), "Raster: plan");
});

test("no collar under it: 'above the highest collar in the project', and how far; under it: as before", () => {
  const d = rasterDrapeElevation({ collars, bbox: mineGridPicture, fileName: "plan.png" });
  assert.equal(d.z, 333);
  assert.equal(d.noneUnder, true);
  const note = drapeElevationNote(d);
  assert.match(note, /^Placed flat at 333 m, 5 m above the highest collar in the project \(no collar is under it\); change Elev\. on its card\. It lies about 6,2\d\d km south of/);
  const u = rasterDrapeElevation({ collars, bbox: onCollars });
  assert.equal(u.noneUnder, undefined);
  assert.equal(u.far, undefined);
  assert.match(drapeElevationNote(u), /^Placed flat at 333 m, 5 m above the highest collar under it: from the side no hole top is hidden, but seen from above it covers/ /* reworded: #2468 */);
});

test("stacking counts only rasters whose footprint overlaps", () => {
  const far = { bbox: mineGridPicture, elevation: 333 };
  const d = rasterDrapeElevation({ collars, bbox: onCollars, rasters: [far] });
  assert.equal(d.z, 333);
  assert.equal(d.stacked, undefined);
  const near = { bbox: [410000, 6249000, 411000, 6250000], elevation: 333 };
  assert.equal(rasterDrapeElevation({ collars, bbox: onCollars, rasters: [far, near] }).z, 338);
  assert.equal(rasterDrapeElevation({ collars, bbox: onCollars, rasters: [{ elevation: 333 }] }).z, 338); // no box: counted, as before
});

test("the georeferencer asks, and the fetch-area lists mark far layers", () => {
  const r = readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8");
  assert.match(r, /if \(drape\.far && !window\.confirm\(tr\("These control points place the picture about \{km\} km from the \{n\} collars/);
  for (const f of ["../src/modules/RasterModule.jsx", "../src/modules/GeophysicsModule.jsx"]) {
    assert.match(readFileSync(new URL(f, import.meta.url), "utf8"), /label: farLabel\(j\.label, farFromCollars\(\[j\.xmin, j\.ymin, j\.xmax, j\.ymax\], collars\)\)/);
  }
});
