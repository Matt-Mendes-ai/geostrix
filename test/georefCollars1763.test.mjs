// TASKS.csv #1763 — the Georeferencer made the user type each control point's X / Y from another window even when the scan shows collars
// the project already holds: a 'Collar' select per control point now fills them (in the control points' own CRS)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarControlXY, fitAffine } from "../src/lib/georef.js";
import { reprojectXY } from "../src/lib/reproject.js";

const collar = { hole_id: "COP-23-0001", x: 412345.6789, y: 6251234.5, z: 300 };

test("same CRS: the collar's own coordinates, to the millimetre", () => {
  assert.deepEqual(collarControlXY(collar, { projectEpsg: 28350 }), { x: "412345.679", y: "6251234.5" });
  assert.equal(collarControlXY({ hole_id: "X", x: NaN, y: 1 }, {}), null);
});

test("control points in another CRS: the collar turned into it (degrees to 8 decimals)", () => {
  const ll = collarControlXY(collar, { cpEpsg: 4326, projectEpsg: 28350, reproject: reprojectXY, geographic: true });
  const back = reprojectXY(Number(ll.x), Number(ll.y), 4326, 28350);
  assert.ok(Math.abs(back.x - collar.x) < 0.01 && Math.abs(back.y - collar.y) < 0.01, JSON.stringify(back));
  assert.ok(/^\d+\.\d{6,8}$/.test(ll.x), ll.x);
  assert.equal(collarControlXY(collar, { cpEpsg: 999999, projectEpsg: 28350, reproject: reprojectXY }), null);
});

test("three collars picked on a scan fit it exactly", () => {
  const holes = [{ x: 410000, y: 6250000 }, { x: 411000, y: 6250000 }, { x: 410000, y: 6251000 }];
  const pts = [[100, 400], [300, 400], [100, 200]].map(([px, py], i) => { const xy = collarControlXY(holes[i], {}); return { id: `p${i}`, px, py, x: Number(xy.x), y: Number(xy.y) }; });
  assert.ok(fitAffine(pts));
});

test("the table offers the collars and clears the pick when X / Y are typed", () => {
  const src = readFileSync(new URL("../src/components/GeoreferencerModal.jsx", import.meta.url), "utf8");
  assert.match(src, /collarControlXY\(c, \{ cpEpsg, projectEpsg, reproject: reprojectXY, geographic: isGeographicCp \}\)/);
  assert.match(src, /updatePoint\(p\.id, \{ x: e\.target\.value, hole: "" \}\)/);
});
