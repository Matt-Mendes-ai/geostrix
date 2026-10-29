// TASKS.csv #1093 — a DC/IP line's block model exports its true rotated cells, not the overlapping axis-aligned boxes
import { test } from "node:test";
import assert from "node:assert/strict";
import { lineGeometry, sectionCells } from "../src/lib/dcip.js";
import { sectionTrueSize, sectionHeaderLine, blockModelRows, blockModelCsvTextSync, blockModelParamLines } from "../src/lib/blockModelExport.js";
import { blockModelToVtk } from "../src/lib/vtkExport.js";

// Woodjam's 6200E direction: azimuth 330.1 deg (dE -3317, dN 5766), 25 m cells, the section 25 m wide
const geom = lineGeometry([0, 0], [-3317, 5766]);
const result = { cells: { s: [12.5, 37.5, 62.5], z: [-12.5, -12.5, -37.5], ds: [25, 25, 25], dz: [25, 25, 25], resistivity: [100, 200, 300], support: [1, 1, 0.5] } };
const cells = sectionCells(result, geom, "resistivity", 25);
const model = { name: "DC line 6200E", source: "simpeg", cells, section: { line: "6200E", azimuthDeg: geom.azimuth, u: geom.u, widthM: 25 } };

test("the box around each rotated cell is 1.37 cells wide and 1.87x its volume; the true size is recovered from it", () => {
  assert.ok(Math.abs(geom.azimuth - 330.1) < 0.1, `${geom.azimuth}`);
  const c = cells[0];
  assert.ok(Math.abs(c.dx / 25 - 1.37) < 0.01 && Math.abs(c.dy / 25 - 1.37) < 0.01);
  assert.ok(Math.abs((c.dx * c.dy * c.dz) / (25 * 25 * 25) - 1.87) < 0.01);
  const t = sectionTrueSize(model, c);
  assert.ok(Math.abs(t.ds - 25) < 1e-9 && t.T === 25 && Math.abs(t.volume - 15625) < 1e-6);
  assert.equal(sectionTrueSize({ ...model, section: null }, c), null);
});

test("CSV: VOLUME_M3 is the true cell volume (both writers), and the header explains the boxes", () => {
  assert.equal(blockModelRows(model)[0].VOLUME_M3, 15625);
  assert.match(blockModelCsvTextSync(model).split("\r\n")[1], /,15625$/);
  assert.match(blockModelCsvTextSync(model).split("\r\n")[0], /VOLUME_M3/);
  assert.ok(blockModelParamLines(model).includes(sectionHeaderLine(model)));
  assert.match(sectionHeaderLine(model), /azimuth 330\.\d+ deg \(grid\).*overlap/);
});

test("VTK: one hexahedron (type 12) per cell, ds along the line and the width across it", () => {
  const { bytes, kind } = blockModelToVtk(model, "EPSG:26910");
  assert.equal(kind, "section");
  const txt = new TextDecoder("latin1").decode(bytes);
  assert.match(txt, /DATASET UNSTRUCTURED_GRID\nPOINTS 24 double\n/);
  // the corner coordinates: big-endian float64 after the POINTS line
  const off = txt.indexOf("POINTS 24 double\n") + "POINTS 24 double\n".length;
  const dv = new DataView(bytes.buffer, bytes.byteOffset + off, 24 * 8);
  const P = (k) => [dv.getFloat64(k * 24, false), dv.getFloat64(k * 24 + 8, false), dv.getFloat64(k * 24 + 16, false)];
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  assert.ok(Math.abs(d(P(0), P(1)) - 25) < 1e-6, "edge 0-1 = ds along the line");
  assert.ok(Math.abs(d(P(1), P(2)) - 25) < 1e-6, "edge 1-2 = the width across");
  assert.ok(Math.abs(d(P(0), P(4)) - 25) < 1e-6, "edge 0-4 = dz");
  const along = [P(1)[0] - P(0)[0], P(1)[1] - P(0)[1]];
  assert.ok(Math.abs(along[0] / 25 - geom.u[0]) < 1e-9 && Math.abs(along[1] / 25 - geom.u[1]) < 1e-9, "edge 0-1 runs along the line");
  const types = txt.indexOf("CELL_TYPES 3\n") + "CELL_TYPES 3\n".length;
  assert.equal(new DataView(bytes.buffer, bytes.byteOffset + types, 4).getInt32(0, false), 12);
});
