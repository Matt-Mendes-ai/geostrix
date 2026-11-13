// TASKS.csv #1855 — a plain TIFF placed by its world file (.tfw); the Georeferencer decodes TIFF; the refusal says where to go
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseWorldFile, worldFileBbox } from "../src/lib/raster.js";

test("#1855 world file: the pixel-area extent, Kodiak's Chg_100 numbers", () => {
  // a 693 x 793 map at 3 m pixels whose top-left pixel centre is (683306.5, 5512393.5)
  const w = parseWorldFile("3.0\n0.0\n0.0\n-3.0\n683306.5\n5512393.5\n", "Chg_100.tfw");
  const b = worldFileBbox(w, 693, 793);
  assert.deepEqual(b.map((v) => +v.toFixed(3)), [683305, 5510016, 685384, 5512395]);
  assert.throws(() => worldFileBbox(parseWorldFile("3\n0.5\n0.2\n-3\n0\n0", "r.tfw"), 10, 10), /rotates the image/);
  assert.throws(() => parseWorldFile("3\n0\n0\n-3\n", "short.tfw"), /six numbers/);
  assert.throws(() => parseWorldFile("a\nb\nc\nd\ne\nf", "x.tfw"), /six numbers/);
});

test("#1855 the import pairs a world file with its image; the Georeferencer takes TIFF", () => {
  const rm = readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8");
  assert.match(rm, /accept="\.tif,\.tiff,\.gxf,\.grd,\.tfw,\.tifw,\.tiffw,\.wld,\.xml,\.prj"/); // \.xml: #2830 (a Geosoft grid's CRS); \.prj: #2857
  assert.match(rm, /set\.images\.forEach\(\(\{ file, world, xml, prj \}\) => importRaster\(file, world, xml, prj\)\)/); // the pairing is lib/rasterSideFiles.js since #2857 (sideXmlFor: #2830)
  const g = readFileSync(new URL("../src/components/GeoreferencerModal.jsx", import.meta.url), "utf8");
  assert.match(g, /accept="\.png,\.jpg,\.jpeg,\.tif,\.tiff"/);
  assert.match(g, /decodeTiffImage/);
  assert.doesNotMatch(g, /browsers can't decode plain TIFF/);
  const r = readFileSync(new URL("../src/lib/raster.js", import.meta.url), "utf8");
  assert.match(r, /Select its world file \(\.tfw \/ \.tifw \/ \.wld, same name\) together with it, or place it with Maps > Georeference/);
});
