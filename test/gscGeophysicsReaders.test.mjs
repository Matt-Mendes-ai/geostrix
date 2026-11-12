// GSC geophysics review (2026-11-12) — two reader faults found on the Geological Survey of Canada's public grids and gravity stations:
// (1) a point-data download (a Geosoft export) names its columns on a PLAIN comma line after "/" lines that only describe the file, and
//     parseXYZ took the last "/" line as the header; (2) a Geosoft / GXF grid's NODE extent was handed to the drape as its pixel-area
//     extent, so the picture sat up to half a cell inside the grid. The rows below are made up; only the layout is the survey's.
import test from "node:test";
import assert from "node:assert/strict";
import { parseXYZ, guessXyzChannels } from "../src/lib/geosoft.js";
import { streamXyzRows } from "../src/lib/streamTable.js";
import { nodeGridAreaBbox, makeValueGrid } from "../src/lib/raster.js";

const HEADER = "X,Y,PROJECT,STATION,YEAR,DDMMYYYY,HHMM,CAV,ELEVATION,EAV,DEPTH,DAV,DEPTHTYPE,ADJG,GAV,TCOR,TAV,FREEAIR,FAV,BOUGUER,BAV,STATUS";
const GSC = [
  "/ Dataset:E:\\data\\storage\\0\\0\\0\\0\\0003\\Example.hxyz",
  "/",
  "/ Projection:\"WGS 84\"",
  "/      Datum:\"WGS 84\",6378137,0.08181919084,0",
  "/     Method:",
  "/       Unit:dega,1",
  "/      Local:\"WGS 84\",0,0,0,0,0,0,0",
  "/",
  HEADER,
  "-79.400000,48.100000,2008205.00,1.00,2008.00,17022008.00,1839.00,0.50,315.32,0.50,0.00,0.00,1.00,980773.17,0.05,0.05,0.01,-30.28,0.16,-65.53,0.17,1.00,",
  "-79.410000,48.110000,2008205.00,2.00,2008.00,17022008.00,1854.00,0.50,311.56,0.50,0.00,0.00,1.00,980773.67,0.05,0.14,0.02,-30.20,0.16,-64.93,0.17,1.00,",
  "-79.420000,48.120000,2008205.00,3.00,2008.00,17022008.00,1953.00,0.50,276.19,0.50,0.00,0.00,1.00,980779.26,0.05,0.16,0.02,-35.30,0.16,-66.05,0.17,1.00,",
].join("\r\n");

test("a plain comma header after descriptive \"/\" lines is the header; the trailing comma adds no column and drops none", () => {
  const r = parseXYZ(GSC);
  assert.deepEqual(r.columns, HEADER.split(","));
  assert.equal(r.rows.length, 3); // the header line is not a row
  assert.equal(r.rows[0].X, -79.4);
  assert.equal(r.rows[0].Y, 48.1);
  assert.equal(r.rows[2].BOUGUER, -66.05);
  assert.equal(r.rows[1].STATUS, 1); // the last named column keeps its value
  assert.equal(r.rows[0].ELEVATION, 315.32);
  const g = guessXyzChannels(r.columns, r.rows);
  assert.equal(g.z, "ELEVATION");
  assert.equal(g.value, "BOUGUER");
});

test("the streamed reader skips the same plain header line", async () => {
  const whole = parseXYZ(GSC);
  const s = await streamXyzRows(new Blob([GSC]), { columns: whole.columns, chunkBytes: 53 });
  assert.equal(s.seen, 3);
  assert.deepEqual(s.rows, whole.rows);
});

test("\"/\"-headed files are read as before, and a plain line that is not a row of names changes nothing", () => {
  const r = parseXYZ("/ XYZ EXPORT\n/ X Y TMI\nLine 1\n100 200 55000.1\n101 201 *\n");
  assert.deepEqual(r.columns, ["X", "Y", "TMI"]);
  assert.deepEqual(r.rows.map((x) => x.TMI), [55000.1, null]);
  // a GEM-style dump: the last "/" line with the row's token count is still the header
  const g = parseXYZ("/Gem Systems GSM-19\n/X Y elev rawmag\n500000 6000000 900 55123.4\n");
  assert.deepEqual(g.columns, ["X", "Y", "elev", "rawmag"]);
  assert.equal(g.rows.length, 1);
  // a plain row of names with the WRONG count does not displace a matching "/" header
  const m = parseXYZ("/ X Y TMI\nsurvey block alpha east\n100 200 55000.1\n");
  assert.deepEqual(m.columns, ["X", "Y", "TMI"]);
  assert.equal(m.rows.length, 1);
});

test("a plain header with no \"/\" line at all is accepted when the first row matches it", () => {
  const r = parseXYZ("X,Y,BOUGUER\n-79.4,48.1,-65.5\n-79.5,48.2,-64.9\n");
  assert.deepEqual(r.columns, ["X", "Y", "BOUGUER"]);
  assert.equal(r.rows.length, 2);
});

test("a node grid's drape extent reaches half a cell beyond its end nodes, and each pixel is centred on its node", () => {
  // 844 x 664 nodes at 100 m from (678625, 5215575): the nodes end at 762925, 5281875
  const b = nodeGridAreaBbox(678625, 5215575, 100, 100, 844, 664);
  assert.deepEqual(b, [678575, 5215525, 762975, 5281925]);
  assert.equal(b[2] - b[0], 84400); // 844 pixels of 100 m (it was 84,300: 843 cells, 99.88 m a pixel)
  const pixelW = (b[2] - b[0]) / 844;
  for (const i of [0, 1, 421, 843]) assert.ok(Math.abs(b[0] + (i + 0.5) * pixelW - (678625 + i * 100)) < 1e-6);
  // the kept values are node-based and agree with it: node (0, 0) of the value grid is the north-west node
  const g = makeValueGrid(new Float64Array(6).fill(1), 3, 2, 1000, 2100, 100, 100, (v) => !Number.isFinite(v));
  const a = nodeGridAreaBbox(1000, 2000, 100, 100, 3, 2);
  assert.deepEqual(a, [950, 1950, 1250, 2150]);
  assert.equal(g.x0, a[0] + 50);
  assert.equal(g.yTop, a[3] - 50);
});

// (3) a GeoTIFF whose tie point is not at raster (0, 0): Geosoft's map export ties (0.5, 0.5); geotiff.js reads the world X, Y only
import { writeArrayBuffer, fromArrayBuffer } from "geotiff";
import { rasterAreaBbox, demNodeBbox, tiffBoundingBox } from "../src/lib/raster.js";
const tiff = async (w, h, scale, tie, extra = {}) => (await fromArrayBuffer(await writeArrayBuffer(new Float32Array(w * h).fill(1), { width: w, height: h, ModelPixelScale: [scale, scale, 0], ModelTiepoint: tie, ProjectedCSTypeGeoKey: 26914, ...extra }))).getImage();

test("a tie point at raster (0.5, 0.5) is the centre of the first pixel: the box moves half a pixel west and north", async () => {
  // the Flin Flon pictures' own numbers: 375 m pixels, raster (0.5, 0.5) at E 225757.3914 N 6142295.4914 (a 4 x 3 stand-in for 793 x 432)
  const img = await tiff(4, 3, 375, [0.5, 0.5, 0, 225757.3914, 6142295.4914, 0]);
  const b = rasterAreaBbox(img);
  const want = [225757.3914 - 187.5, 6142295.4914 + 187.5 - 3 * 375, 225757.3914 - 187.5 + 4 * 375, 6142295.4914 + 187.5];
  b.forEach((v, k) => assert.ok(Math.abs(v - want[k]) < 1e-6, `bbox[${k}] ${v} vs ${want[k]}`));
  // the first pixel's centre is the tie point's world position
  assert.ok(Math.abs(b[0] + 187.5 - 225757.3914) < 1e-6 && Math.abs(b[3] - 187.5 - 6142295.4914) < 1e-6);
  const n = demNodeBbox(img);
  assert.ok(Math.abs(n[0] - 225757.3914) < 1e-6 && Math.abs(n[3] - 6142295.4914) < 1e-6);
});

test("a tie point at raster (0, 0) places a file exactly as before; one at the lower-left corner no longer drops it a whole image", async () => {
  const top = await tiff(4, 3, 25, [0, 0, 0, 500000, 6000000, 0]);
  assert.deepEqual(tiffBoundingBox(top), top.getBoundingBox());
  assert.deepEqual(rasterAreaBbox(top), [500000, 5999925, 500100, 6000000]);
  const low = await tiff(4, 3, 25, [0, 3, 0, 500000, 5999925, 0]); // the same picture tied at its south-west corner
  assert.deepEqual(rasterAreaBbox(low), [500000, 5999925, 500100, 6000000]);
  assert.deepEqual(low.getBoundingBox(), [500000, 5999850, 500100, 5999925]); // what geotiff.js alone answers: 75 m too low
});

// (4) the same station file as a .csv goes through lib/tabular.js: notes above the header AND a trailing comma on every data row
import { skipPreamble, parseTableText } from "../src/lib/tabular.js";

test("a table whose data rows end with the delimiter keeps its header under a block of notes, and its first row", () => {
  const s = skipPreamble(GSC.replace(/\r\n/g, "\n"));
  assert.equal(s.skipped, 8);
  assert.equal(s.text.split("\n")[0], HEADER);
  const t = parseTableText(GSC);
  assert.deepEqual(t.headers, HEADER.split(","));
  assert.equal(t.rows.length, 3); // it was 2: the first station had become the column names
  assert.equal(t.rows[0].X, -79.4);
  assert.equal(t.rows[0].BOUGUER, -65.53);
  assert.equal(t.rows[2].STATUS, 1);
});

test("the preamble rule is otherwise as it was: equal widths pass, a wider row that does not end with the delimiter does not", () => {
  const notes = "Client: Example\nDatum: NAD83\nLine,Station,Easting,Northing\n1,10,500000,6000000\n1,20,500010,6000000\n";
  assert.equal(skipPreamble(notes).skipped, 2);
  // rows one field WIDER with a real last value are not this header's rows: nothing is skipped, as before
  const odd = "Client: Example\nA,B,C\n1,2,3,4\n5,6,7,8\n9,10,11,12\n13,14,15,16\n";
  const r = skipPreamble(odd);
  assert.equal(r.text.split("\n")[0], "1,2,3,4"); // the old rule's answer (the first row that the next rows match), unchanged
});
