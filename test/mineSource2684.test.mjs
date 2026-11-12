// TASKS.csv #2684 (#2275 / #2586's open part) — 'Local mine grid (no CRS)' as an explicit Source CRS answer (value "mine"), for the point
// survey, boundary / claim, raster / DEM / georeferencer and Surface Geology importers. SYNTHETIC grid: rotated 30 degrees, tied to MGA.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tieFromOrigin } from "../src/lib/localGridTie.js";
import { mineGridOf, mineSourceOf, mineSourceToProject, projectToMine, mineChoiceFromProject, isMineSource, MINE_SOURCE, mineRowsToProject, mineSourceNote } from "../src/lib/mineGrid.js";
import { mineImageToProject, mineGridToProject, mineBoxOf } from "../src/lib/rasterTie.js";
import { vectorToBoundaryPolylines, boundaryCrsTransform } from "../src/lib/boundaryImport.js";
import { buildLayer } from "../src/lib/mapLayerBuild.js";

const tie = tieFromOrigin({ lx: 10000, ly: 20000, wx: 413000, wy: 6251000, rotationDeg: 30, scale: 1, epsg: 28350 });
const project = { epsg: 28350, crsSet: true, mineGrid: { name: "SYN", tie } };
const mg = mineGridOf(project);
const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("what 'Local mine grid' means for each kind of project", () => {
  assert.equal(MINE_SOURCE, "mine");
  assert.ok(isMineSource("mine") && isMineSource(" Mine ") && !isMineSource("28350") && !isMineSource(""));
  assert.equal(mineSourceOf(project).kind, "tie");
  assert.equal(mineSourceOf(project).name, "SYN");
  assert.equal(mineSourceOf({ crsSet: false, localGrid: { name: "Pit grid" } }).kind, "local");
  assert.equal(mineSourceOf({ crsSet: false, localGrid: { name: "Pit grid" } }).name, "Pit grid");
  assert.equal(mineSourceOf({ epsg: 28350, crsSet: true }).kind, "none");
  assert.equal(mineSourceToProject({ epsg: 28350, crsSet: true }), null);
  assert.deepEqual(mineSourceToProject({ crsSet: false })(5, 6), [5, 6]); // a no-CRS project: its own numbers
  const T = mineSourceToProject(project), F = projectToMine(mg, 28350);
  assert.deepEqual(T(10000, 20000), [413000, 6251000]);
  const [x, y] = T(10100, 20000); // 100 m along the grid's x, turned 30 degrees counter-clockwise
  close(x, 413000 + 100 * Math.cos(Math.PI / 6)); close(y, 6251000 + 50);
  const [bx, by] = F(x, y); close(bx, 10100, 1e-6); close(by, 20000, 1e-6);
  assert.deepEqual(mineChoiceFromProject(mineSourceOf(project), 28350)(x, y).map((v) => Math.round(v * 1e6) / 1e6), [10100, 20000]);
});

test("point rows on the mine grid are brought into the project CRS, and said", () => {
  const r = mineRowsToProject([{ x: 10000, y: 20000, value: 3 }, { x: NaN, y: 1, value: 4 }], project);
  assert.deepEqual(r.rows[0], { x: 413000, y: 6251000, value: 3 });
  assert.ok(Number.isNaN(r.rows[1].x)); // left for the importer's own 'no coordinates' count
  assert.match(r.note, /^ Read on the project's mine grid \(SYN\) \(the Source CRS you set\) and brought into EPSG:28350 through its tie\.$/);
  const none = mineRowsToProject([{ x: 1, y: 2 }], { epsg: 28350, crsSet: true });
  assert.deepEqual(none.rows, [{ x: 1, y: 2 }]);
  assert.match(none.note, /no mine grid to read it on/);
  assert.match(mineSourceNote({ kind: "local", name: "" }), /project's local grid .*kept as they are/);
});

test("a picture on the mine grid is resampled into the project CRS (the inverse of #2587's resample)", () => {
  // 4 x 4 px over mine 10000..10400 x 20000..20400: the west half red, the east half blue
  const w = 4, h = 4, data = new Uint8ClampedArray(w * h * 4);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) { const i = (r * w + c) * 4; data[i] = c < 2 ? 255 : 0; data[i + 2] = c < 2 ? 0 : 255; data[i + 3] = 255; }
  const out = mineImageToProject({ xmin: 10000, ymin: 20000, xmax: 10400, ymax: 20400, width: w, height: h, data }, mg, 28350);
  // the rotated square's box in MGA: corners (0,0), (400,0), (400,400), (0,400) turned 30 degrees about the origin
  const c30 = Math.cos(Math.PI / 6), s30 = Math.sin(Math.PI / 6);
  close(out.bbox[0], 413000 - 400 * s30, 1e-3); close(out.bbox[2], 413000 + 400 * c30, 1e-3);
  close(out.bbox[1], 6251000, 1e-3); close(out.bbox[3], 6251000 + 400 * (s30 + c30), 1e-3);
  const T = mineSourceToProject(project);
  const at = (mx, my) => {
    const [x, y] = T(mx, my);
    const col = Math.floor(((x - out.bbox[0]) / (out.bbox[2] - out.bbox[0])) * out.width), row = Math.floor(((out.bbox[3] - y) / (out.bbox[3] - out.bbox[1])) * out.height);
    const i = (row * out.width + col) * 4;
    return [out.data[i], out.data[i + 2], out.data[i + 3]];
  };
  assert.deepEqual(at(10050, 20350), [255, 0, 255]); // in the west half: red
  assert.deepEqual(at(10350, 20050), [0, 255, 255]); // in the east half: blue (red 0, blue 255, opaque)
  assert.equal(out.data[3], 0); // the box's north-west corner lies outside the turned square: transparent
});

test("a value grid on the mine grid keeps its readings, each the nearest node, in the project CRS; a clip box limits it", () => {
  const g = { nx: 5, ny: 5, x0: 10000, yTop: 20400, dx: 100, dy: 100, values: Float32Array.from({ length: 25 }, (_, k) => k) };
  const og = mineGridToProject(g, mg, 28350);
  assert.ok(og.valid > 10);
  const F = projectToMine(mg, 28350);
  let checked = 0;
  for (let j = 0; j < og.ny; j++) for (let i = 0; i < og.nx; i++) {
    const v = og.values[j * og.nx + i];
    if (!Number.isFinite(v)) continue;
    const [mx, my] = F(og.x0 + i * og.dx, og.yTop - j * og.dy);
    const ii = Math.round((mx - g.x0) / g.dx), jj = Math.round((g.yTop - my) / g.dy);
    assert.equal(v, jj * 5 + ii); checked++;
  }
  assert.equal(checked, og.valid);
  const clip = [413000, 6251000, 413200, 6251200];
  const oc = mineGridToProject(g, mg, 28350, 512, clip);
  assert.ok(oc.x0 >= clip[0] - 1e-6 && oc.x0 + oc.dx * (oc.nx - 1) <= clip[2] + 1e-6 && oc.yTop <= clip[3] + 1e-6);
  const b = mineBoxOf(mg, 28350, clip); // the clip box taken onto the grid covers its four corners
  for (const [x, y] of [[413000, 6251000], [413200, 6251000], [413200, 6251200], [413000, 6251200]]) { const [mx, my] = F(x, y); assert.ok(mx >= b[0] - 1e-6 && mx <= b[2] + 1e-6 && my >= b[1] - 1e-6 && my <= b[3] + 1e-6); }
});

test("boundaries and claims: 'Local mine grid' wins over the file's own CRS; a code chosen by hand too; a .dxf / .ply is placed", async () => {
  const parsed = { geomType: "polygon", epsg: 28350, features: [{ geometry: [[10000, 20000], [10100, 20000], [10100, 20100], [10000, 20000]] }] };
  const r = await vectorToBoundaryPolylines(parsed, 28350, { source: "mine", mineSource: mineSourceOf(project) });
  assert.deepEqual(r.polylines[0][0], { x: 413000, y: 6251000 });
  assert.equal(r.mineGrid, true);
  assert.match(r.note, /read on the project's mine grid \(SYN\) \(the Source CRS you set\) and brought into EPSG:28350 through its tie; its own .*EPSG:28350\) was set aside/);
  const kept = await vectorToBoundaryPolylines({ ...parsed, epsg: null }, null, { source: "mine", mineSource: mineSourceOf({ crsSet: false, localGrid: { name: "Pit" } }) });
  assert.deepEqual(kept.polylines[0][0], { x: 10000, y: 20000 });
  assert.match(kept.note, /local grid "Pit"/);
  const byHand = await vectorToBoundaryPolylines({ ...parsed, epsg: null }, 28350, { source: "28350" });
  assert.match(byHand.note, /the project's coordinate system/); // not 'it states no CRS'
  const dxf = await boundaryCrsTransform({ src: null, dst: 28350, source: "mine", mineSource: mineSourceOf(project) });
  assert.deepEqual(dxf.T(10000, 20000), [413000, 6251000]);
  const none = await boundaryCrsTransform({ src: null, dst: 28350, source: "mine", mineSource: mineSourceOf({ epsg: 28350, crsSet: true }) });
  assert.equal(none.T, null);
  assert.match(none.note, /no mine grid to read it on/);
  const plain = await boundaryCrsTransform({ src: null, dst: 28350, box: [413000, 6251000, 413100, 6251100] }); // nothing chosen: as before
  assert.match(plain.note, /it states no CRS/);
});

test("Surface Geology map layers: read on the mine grid, the note kept in English with the layer", () => {
  const parsed = { geomType: "line", epsg: 28350, features: [{ geometry: [[10000, 20000], [10100, 20000]], attributes: {} }] };
  const L = buildLayer(parsed, { sourceName: "faults", projectEpsg: 28350, sourceOverride: "mine", mineSource: mineSourceOf(project) });
  assert.equal(L.sourceEpsg, null);
  assert.match(L.crsNote, /^read on the project's mine grid \(SYN\) \(the Source CRS set\), into EPSG:28350 through its tie$/);
  const L2 = buildLayer(parsed, { sourceName: "faults", projectEpsg: 28350, sourceOverride: "" });
  assert.equal(L2.sourceEpsg, 28350); // unchanged without the choice
});

test("the picker offers the answer only where it is passed, and every importer of side session 2 passes it", () => {
  const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
  const field = read("components/SourceCrsField.jsx");
  assert.match(field, /export default function SourceCrsField\(\{[^}]*mineGrid = null \}\)/);
  assert.match(field, /\{mineGrid && \(/);
  assert.match(field, /onChange\(MINE_SOURCE\)/);
  assert.match(field, /disabled=\{mineGrid\.kind === "none"\}/);
  const geo = read("modules/GeophysicsModule.jsx");
  assert.equal((geo.match(/mineGrid=\{mineSourceOf\(project\)/g) || []).length, 4); // points, the DEM, Boundaries, Claims
  assert.match(geo, /const mineSrc = isMineSource\(geophysSourceEpsg\); \/\/ #2684/);
  assert.match(geo, /mineSource: mineSourceOf\(project\) \/\* #2684 \*\/, chooseProjectEpsg/); // the DEM
  assert.equal((geo.match(/source: boundarySource, mineSource: mineSourceOf\(project\)/g) || []).length, 3); // shapefile, GeoPackage and the .dxf / .ply transform
  assert.equal((geo.match(/await plainSourceTransform\(\)/g) || []).length, 3); // .dxf and .ply boundaries, .dxf / .ply claims
  const ras = read("modules/RasterModule.jsx");
  assert.match(ras, /mineGrid=\{mineSourceOf\(project\)/);
  assert.match(ras, /mineSource: mineSourceOf\(project\) \}\)/);
  assert.match(ras, /sourceEpsg=\{isMineSource\(sourceEpsg\) \? "" : sourceEpsg/);
  assert.match(read("components/GeoreferencerModal.jsx"), /mineGrid=\{mineChoice/);
  const smp = read("components/SurfaceMappingPanel.jsx");
  assert.equal((smp.match(/mineGrid=\{mineSourceOf\(project\)/g) || []).length, 2); // map layers, structures
  assert.match(smp, /let northNote = north\.ref === "grid" && !mineTurned \? tr\(/); // not 'taken as grid north (the project grid)' after the mine grid's turn
  assert.match(read("components/SurfaceImportModal.jsx"), /mineGrid=\{mineGrid\}/);
  assert.match(read("modules/GeochemModule.jsx"), /mineGrid=\{mineSourceOf\(project\)/);
  const raster = read("lib/raster.js");
  assert.match(raster, /mineImageToProject\(\{ xmin: parsed\.bbox\[0\]/);
  assert.match(raster, /mineGridToProject\(src, mineTie, targetEpsg, gridMax, clip\)/);
  assert.doesNotMatch(read("components/ImportMappingModal.jsx"), /mineGrid=/); // the 3D View's: side session 6's follow-up
});
