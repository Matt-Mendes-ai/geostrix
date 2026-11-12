// TASKS.csv #2812 (split from #2684) — Maps > A file: 'From' may be the project's mine grid (or a tied local grid): a GeoTIFF or a zipped
// shapefile whose numbers are on that grid is taken to 'To' through the grid's tie. SYNTHETIC grid rotated 30 degrees, tied to MGA zone 50.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tieFromOrigin } from "../src/lib/localGridTie.js";
import { mineGridOf, gridToCrsChoice, mineSourceToProject } from "../src/lib/mineGrid.js";
import { reprojectGeoTiff, readGeoTiffInfo, reprojectShapefileZip, reportShapefileText, reportGeoTiffText } from "../src/lib/fileReproject.js";
import { writeGeoTiff } from "../src/lib/geotiffWrite.js";
import { buildShapefileZip, parseShapefileZip } from "../src/lib/shapefile.js";

const tie = tieFromOrigin({ lx: 10000, ly: 20000, wx: 413000, wy: 6251000, rotationDeg: 30, scale: 1, epsg: 28350 });
const project = { epsg: 28350, crsSet: true, mineGrid: { name: "SYN", tie } };
const mine = { mg: mineGridOf(project), name: "SYN" };

test("the 'From' choice: a CRS project's mine grid, or a tied local grid; nothing for a plain CRS project", () => {
  assert.equal(gridToCrsChoice(project).kind, "tie");
  const local = gridToCrsChoice({ crsSet: false, localGrid: { name: "Pit" } }, tie);
  assert.equal(local.kind, "tie");
  assert.equal(local.mg.tie, tie);
  assert.equal(gridToCrsChoice({ crsSet: false, localGrid: { name: "Pit" } }, null), null); // untied: nowhere to take it
  assert.equal(gridToCrsChoice({ epsg: 28350, crsSet: true }), null);
});

test("a float GeoTIFF on the mine grid, written in MGA zone 50: the turned box, nearest values, MGA tag", async () => {
  const w = 20, h = 20, vals = new Float32Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) vals[r * w + c] = c < 10 ? 1 : 2; // west half 1, east half 2
  // pixel-is-area, 20 m pixels over mine 10000..10400 x 20000..20400, tagged (wrongly) 28350
  const src = new Uint8Array(writeGeoTiff(vals, { width: w, height: h, ModelPixelScale: [20, 20, 0], ModelTiepoint: [0, 0, 0, 10000, 20400, 0], GTModelTypeGeoKey: 1, GTRasterTypeGeoKey: 1, ProjectedCSTypeGeoKey: 28350, GDAL_NODATA: "-9999" }));
  const { bytes, report } = await reprojectGeoTiff(src, null, 28350, { mine });
  assert.equal(report.resampling, "nearest");
  assert.match(report.fromName, /SYN/);
  const out = await readGeoTiffInfo(bytes);
  assert.equal(out.epsg, 28350);
  const [x0, y0, x1, y1] = out.image.getBoundingBox();
  assert.ok(x0 > 412700 && x0 < 412850 && x1 > 413300 && x1 < 413400, `${x0} ${x1}`); // the rotated square's box
  assert.ok(y0 > 6250950 && y0 < 6251050 && y1 > 6251500 && y1 < 6251600, `${y0} ${y1}`);
  const ras = (await out.image.readRasters())[0], ow = out.width, oh = out.height;
  const T = mineSourceToProject(project), at = (mx, my) => { const [x, y] = T(mx, my); const c = Math.floor(((x - x0) / (x1 - x0)) * ow), r = Math.floor(((y1 - y) / (y1 - y0)) * oh); return ras[r * ow + c]; };
  assert.equal(at(10100, 20200), 1); // west half
  assert.equal(at(10300, 20200), 2); // east half
  assert.equal(ras[0], -9999); // the box's corner outside the turned square: nodata
  assert.match(reportGeoTiffText(report, 28350), /from the mine grid "SYN"/);
});

test("a zipped shapefile on the mine grid: its points taken to MGA through the tie, a new .prj", async () => {
  const zip = buildShapefileZip({ geomType: "point", baseName: "pits", features: [{ geometry: [[10000, 20000]], attributes: { id: 1 } }, { geometry: [[10100, 20000]], attributes: { id: 2 } }] });
  const { bytes, report } = await reprojectShapefileZip(zip, null, 28350, { mine });
  const back = await parseShapefileZip(bytes);
  const pts = back.features.map((f) => f.geometry[0].slice(0, 2).map((v) => Math.round(v * 100) / 100)); // x, y (the reader adds z 0)
  assert.deepEqual(pts[0], [413000, 6251000]);
  assert.deepEqual(pts[1], [413086.6, 6251050]);
  assert.equal(back.epsg ?? 28350, 28350);
  assert.match(reportShapefileText(report, 28350), /vertices from the mine grid "SYN"/);
});

test("Maps > A file offers the mine grid under From and passes it to both writers", () => {
  const c = readFileSync(new URL("../src/modules/CartographyModule.jsx", import.meta.url), "utf8");
  assert.equal((c.match(/onChange=\{\(c\) => setFileFrom\(c === "" \? null : isMineSource\(c\) \? MINE_SOURCE : Number\(c\)\)\} mineGrid=\{fileGrid/g) || []).length, 2);
  assert.match(c, /const fileGrid = gridToCrsChoice\(project, tieOf\(project\)\);/);
  assert.match(c, /reprojectShapefileZip\(file\.bytes, fileMine \? null : fileFrom \|\| null, fileTo, \{ mine: fileMine \}\)/);
  assert.match(c, /reprojectGeoTiff\(file\.bytes, fileMine \? null : fileFrom \|\| null, fileTo, \{ mine: fileMine \}\)/);
});
