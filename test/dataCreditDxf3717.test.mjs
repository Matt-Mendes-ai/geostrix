// TASKS.csv #3717 (Fireweed rehearsal, round 3: Macpass) — the data owner's credit travelled in the Shapefile zips, the GeoPackage, the tables and the KMZ, not in the DXF or the OMF, the two files most
// likely to be opened in Leapfrog or Micromine. A second 999 comment in every DXF, the GOCAD header, a mesh's provenance and the OMF project description now carry it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDXF, dxfNotes } from "../src/lib/dxf.js";
import { vectorDxfText } from "../src/lib/viewer/vectorDxf.js";
import { vectorGocadText } from "../src/lib/viewer/vectorGocad.js";
import { provenanceLines } from "../src/lib/meshExport.js";

const CREDIT = "Drilling data courtesy of Fireweed Metals Corp., Macpass Project, Yukon (fireweedmetals.com). Used with permission.";
const features = [{ attributes: { hole_id: "NB23-001" }, geometry: [[1, 2, 3], [1, 2, 0]] }];
const comments = (text) => text.split(/\r?\n/).flatMap((l, i, a) => (l.trim() === "999" ? [a[i + 1]] : []));

test("#3717 a design DXF's 999 comments: the grid note and, when the project has a credit, the credit on its own line", () => {
  assert.equal(dxfNotes({ epsg: 26909 }, "Mine Design lines").length, 1);
  const n = dxfNotes({ epsg: 26909, dataCredit: CREDIT }, "Mine Design lines");
  assert.equal(n.length, 2); assert.match(n[1], /^Data credit: Drilling data courtesy of Fireweed Metals Corp\./);
  const c = comments(buildDXF({ features, geomType: "line", comment: n }));
  assert.equal(c.length, 2); assert.match(c[0], /^GeoStrix Mine Design lines \| coordinates: project grid/); assert.match(c[1], /^Data credit: /);
  assert.equal(comments(buildDXF({ features, geomType: "line", comment: "one line" })).length, 1); // a string still works
});

test("#3717 the drillhole traces' DXF and the GOCAD header carry the credit; without one, nothing changes", () => {
  const withC = vectorDxfText({ features, geomType: "line" }, { kind: "traces", key: null, label: "Traces", crs: "EPSG:26909", credit: CREDIT }).text;
  const c = comments(withC);
  assert.equal(c.length, 2); assert.match(c[0], /^GeoStrix Traces \| Project CRS: EPSG:26909$/); assert.match(c[1], /^Data credit: Drilling data courtesy of Fireweed/);
  const without = vectorDxfText({ features, geomType: "line" }, { kind: "traces", key: null, label: "Traces", crs: "EPSG:26909" }).text;
  assert.equal(comments(without).length, 1);
  const g = vectorGocadText({ features, geomType: "line" }, { label: "Traces", epsg: 26909, crs: "EPSG:26909", credit: CREDIT }).text;
  assert.match(g, /Data credit: Drilling data courtesy of Fireweed Metals Corp\./);
  assert.doesNotMatch(vectorGocadText({ features, geomType: "line" }, { label: "Traces", epsg: 26909, crs: "EPSG:26909" }).text, /Data credit/);
});

test("#3717 a surface mesh's provenance (OBJ, DXF, TSurf, glTF) names the credit; the pieces are wired", () => {
  assert.ok(provenanceLines("Shell", null, { dataCredit: CREDIT, epsg: 26909 }).some((l) => /^Data credit: Drilling data courtesy/.test(l)));
  assert.ok(!provenanceLines("Shell", null, { epsg: 26909 }).some((l) => /Data credit/.test(l)));
  const v = (readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8") + readFileSync(new URL("../src/modules/viewer/importSolid.js", import.meta.url), "utf8") + readFileSync(new URL("../src/modules/viewer/exportSurface.js", import.meta.url), "utf8")) /* #3996: moved out of ViewerModule */.replace(/\r\n/g, "\n");
  assert.match(v, /crs: crsCell\(project\), credit: project\?\.dataCredit \/\* #3717 \*\/ \}\);/g);
  assert.equal((v.match(/credit: project\?\.dataCredit \/\* #3717 \*\//g) || []).length, 2); // the vector DXF and the vector GOCAD
  assert.match(v, /dataCredit: project\?\.dataCredit \/\* #3717 \*\/, densityTPerM3/); // the mesh export's provenance
  for (const f of ["DesignLinesPane", "DesignStringsPane", "PitDesignPane"]) assert.match(readFileSync(new URL(`../src/components/${f}.jsx`, import.meta.url), "utf8"), /comment: dxfNotes\(project,/);
});
