// TASKS.csv #3762 (Scottie Gold review) — four DXF isosurfaces dropped on the 3D View were drawn but had no row, no legend entry, one shared grey, and
// Fit framed them 2 km from the holes. Rows in the 3D View sidebar, a legend group, a tone each. Synthetic surfaces.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { importedSurfaceLegendGroups } from "../src/lib/legendGroups.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const surfaces = [
  { id: "a", name: "Cond_0.1_Sm (imported)", type: "imported", visible: true },
  { id: "b", name: "Cond_0.5_Sm (imported)", type: "imported", visible: true },
  { id: "c", name: "Cond_1.0_Sm (imported)", type: "imported", visible: false },
  { id: "d", name: "Shell A", type: "implicit", visible: true },
];
test("the legend lists the shown imported surfaces in the colour each is drawn in, without the '(imported)' suffix", () => {
  const [g] = importedSurfaceLegendGroups(surfaces, (id) => ({ a: "#8fa3b8", b: "#a89bbd" })[id]);
  assert.equal(g.key, "imported_surfaces");
  assert.deepEqual(g.items.map((i) => [i[0], i[1]]), [["Cond_0.1_Sm", "#8fa3b8"], ["Cond_0.5_Sm", "#a89bbd"]], "hidden ones and generated ones are not in it");
  assert.equal(g.items[0][2].kind, "fill");
  assert.deepEqual(importedSurfaceLegendGroups([surfaces[3]], () => null), []);
  assert.deepEqual(importedSurfaceLegendGroups(null), []);
  assert.equal(importedSurfaceLegendGroups([surfaces[0]], null)[0].items[0][1], "#8fa3b8", "no mesh colour: the imported family's first tone");
});
test("wiring: the rows sit under 'Boundaries and models', the legend takes them, and a drop's files take successive tones", () => {
  const v = (read("../src/modules/ViewerModule.jsx") + read("../src/modules/viewer/importSolid.js") /* #3996 */);
  assert.match(v, /implicitSurfaces\.some\(isImportedSurface\)\) && \(/);
  assert.match(v, /const ImportedSurfaceRows = React\.lazy\(\(\) => import\("\.\/viewer\/ImportedSurfaceRows\.jsx"\)\)/, "loaded when a surface has been imported, not at startup");
  assert.match(v, /<ImportedSurfaceRows surfaces=\{implicitSurfaces\} meshesRef=\{implicitMeshesRef\} labels=\{surfaceLabels\} toggle=\{toggleImplicitSurface\} zoom=\{zoomToImplicitSurface\} remove=\{removeImplicitSurface\} confirmRemove=\{confirmRemoveSurface\} \/>/);
  assert.match(v, /\.\.\.importedSurfaceLegendGroups\(implicitSurfaces, \(id\) => surfaceHex\(implicitMeshesRef\.current\[id\]\)\)/);
  assert.match(v, /IMPORTED_SOLID_COLORS\[\(k \+ importedBefore\) % IMPORTED_SOLID_COLORS\.length\]/);
  assert.match(v, /importedBefore = Object\.keys\(implicitMeshesRef\.current\)\.filter\(\(i\) => i\.includes\("_imported"\)\)\.length/);
  const r = read("../src/modules/viewer/ImportedSurfaceRows.jsx");
  assert.match(r, /s\?\.type === "imported"/);
  assert.match(r, /toggle\(s\.id\)/); assert.match(r, /zoom\(s\.id\)/); assert.match(r, /remove\(s\.id\)/);
  for (const l of ["es", "pt", "fr", "ar"]) { const j = JSON.parse(read(`../src/locales/${l}.json`)); assert.ok(j["imported surface"] && j["Imported surfaces"], l); }
});
test("the second file of a drop is not the first file's tone", () => {
  const COLORS = [0x8fa3b8, 0xa89bbd, 0x8fb8aa, 0xbfae92, 0x93b3c4, 0xb89aa4]; // ViewerModule's IMPORTED_SOLID_COLORS
  assert.match((read("../src/modules/ViewerModule.jsx") + read("../src/modules/viewer/importSolid.js") /* #3996 */), /const IMPORTED_SOLID_COLORS = \[0x8fa3b8, 0xa89bbd, 0x8fb8aa, 0xbfae92, 0x93b3c4, 0xb89aa4\];/);
  const tones = [0, 1, 2, 3].map((before) => COLORS[(0 + before) % COLORS.length]); // four single-part files: k = 0, importedBefore = 0..3
  assert.equal(new Set(tones).size, 4);
});
