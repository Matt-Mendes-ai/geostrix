// TASKS.csv #2012 — the Macrostrat units as a geology map layer (polygons with a unit field) so Surface Geology > Model it can use them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readVectorTile } from "../src/lib/mvt.js";
import { tileToLonLat, lonLatToTilePx, clipRing, ringArea2, macrostratUnitFeatures } from "../src/lib/macrostrat.js";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// a protobuf writer for one tile, with real geometry commands
const varint = (n) => { const out = []; while (n > 127) { out.push((n & 127) | 128); n = Math.floor(n / 128); } out.push(n); return out; };
const field = (f, wire, payload) => [...varint((f << 3) | wire), ...(wire === 2 ? varint(payload.length) : []), ...payload];
const str = (s) => [...new TextEncoder().encode(s)];
const value = (v) => (typeof v === "string" ? field(1, 2, str(v)) : field(5, 0, varint(v)));
const zz = (v) => (v < 0 ? -2 * v - 1 : 2 * v);
// rings in tile units -> MoveTo / LineTo / ClosePath commands from a running cursor
const geom = (rings) => { const c = []; let x = 0, y = 0; for (const r of rings) { c.push((1 << 3) | 1, zz(r[0][0] - x), zz(r[0][1] - y)); x = r[0][0]; y = r[0][1]; c.push(((r.length - 1) << 3) | 2); for (const [px, py] of r.slice(1)) { c.push(zz(px - x), zz(py - y)); x = px; y = py; } c.push(7); } return c; };
const feature = (tags, type, rings) => [...field(2, 2, tags.flatMap(varint)), ...field(3, 0, varint(type)), ...field(4, 2, geom(rings).flatMap(varint))];
const layer = (name, keys, values, feats) => field(3, 2, [...field(15, 0, varint(2)), ...field(1, 2, str(name)), ...feats.flatMap((f) => field(2, 2, f)), ...keys.flatMap((k) => field(3, 2, str(k))), ...values.flatMap((v) => field(4, 2, value(v))), ...field(5, 0, varint(4096))]);

test("geometry: rings decoded from cursor deltas, closed, winding kept; a hole follows its exterior", () => {
  const outer = [[100, 100], [900, 100], [900, 900], [100, 900]], hole = [[300, 300], [300, 600], [600, 600], [600, 300]]; // outer clockwise on a y-down tile: positive area
  const bytes = Uint8Array.from(layer("units", ["name"], ["A"], [feature([0, 0], 3, [outer, hole])]));
  const f = readVectorTile(bytes)[0].features[0];
  assert.equal(f.type, "polygon");
  assert.deepEqual(f.geometry, [[...outer, outer[0]], [...hole, hole[0]]]);
  assert.ok(ringArea2(outer) > 0 && ringArea2(hole) < 0);
});

test("tile units <-> longitude / latitude round-trip; a box clip keeps the inside and cuts the crossing edges", () => {
  const [lon, lat] = tileToLonLat(11, 314, 660, 4096, 2048, 2048);
  assert.ok(Math.abs(lon + 124.717) < 0.01 && Math.abs(lat - 53.697) < 0.01, `${lon} ${lat}`); // the centre of Copley's tile (Copley itself is 0.3 of a tile from its top)
  const [px, py] = lonLatToTilePx(11, 314, 660, 4096, lon, lat);
  assert.ok(Math.abs(px - 2048) < 1e-6 && Math.abs(py - 2048) < 1e-6);
  const sq = clipRing([[-100, -100], [500, -100], [500, 500], [-100, 500]], [0, 0, 4096, 4096]);
  assert.deepEqual(sq, [[0, 0], [500, 0], [500, 500], [0, 500]]);
  assert.deepEqual(clipRing([[-100, -100], [-50, -100], [-50, -50]], [0, 0, 4096, 4096]), []);
});

const props = (p) => ({ legend_id: 1, name: "Alluvium", age: "Quaternary", lith: "alluvium", color: "#F9F97F", ref_title: "BC digital geology", ...p });
const feat = (p, rings) => ({ id: null, type: "polygon", properties: props(p), geometry: rings.map((r) => [...r, r[0]]) });
const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; // clockwise on a y-down tile
const wholeTile = (z, x, y) => { const a = tileToLonLat(z, x, y, 4096, 0, 4096), b = tileToLonLat(z, x, y, 4096, 4096, 0); return [a[0], a[1], b[0], b[1]]; };

test("macrostratUnitFeatures: polygons clipped to their tile and the area, holes kept as parts, unit names made unique", () => {
  const tile = { z: 11, x: 314, y: 660, layers: [{ name: "units", extent: 4096, features: [
    feat({}, [sq(-200, -200, 2000, 2000)]),                                                          // a buffer past the tile edge: clipped to it
    feat({ legend_id: 2, name: "Granite", lith: "granite", age: "Jurassic", color: "" }, [sq(2100, 2100, 3000, 3000), [[2300, 2300], [2300, 2700], [2700, 2700], [2700, 2300]]]), // with a hole
    feat({ legend_id: 3, name: "Granite", lith: "granite", age: "Cretaceous" }, [sq(3100, 3100, 3300, 3300)]),
    feat({ legend_id: 4, name: "Granite", lith: "diorite", age: "" }, [sq(3400, 3400, 3500, 3500)]),
    feat({ legend_id: 5, name: "Far away" }, [sq(-900, -900, -500, -500)]),                           // wholly outside the tile: dropped
    { id: null, type: "line", properties: props({ legend_id: 9, name: "a line" }), geometry: [[[0, 0], [10, 10]]] },
  ] }] };
  const r = macrostratUnitFeatures([tile], wholeTile(11, 314, 660));
  assert.deepEqual(r.features.map((f) => [f.attributes.unit, f.parts.length]), [["Alluvium", 1], ["Granite (granite, Jurassic)", 2], ["Granite (granite, Cretaceous)", 1], ["Granite (diorite)", 1]]);
  const first = r.features[0].parts[0];
  const [lonMin, latMin, lonMax, latMax] = wholeTile(11, 314, 660);
  for (const [lon, lat] of first) assert.ok(lon >= lonMin - 1e-6 && lon <= lonMax + 1e-6 && lat >= latMin - 1e-6 && lat <= latMax + 1e-6, `${lon} ${lat}`);
  assert.equal(first.length, 5); // the clipped square, closed
  assert.deepEqual(r.features[0].attributes, { unit: "Alluvium", age: "Quaternary", lith: "alluvium", descrip: "", legend_id: 1, map: "BC digital geology" });
  // none of these carries an age model, so the legend sorts them by name (same names in tile order)
  assert.deepEqual(r.units.map((u) => [u.unit, u.color]), [["Alluvium", "#f9f97f"], ["Far away", "#f9f97f"], ["Granite (granite, Jurassic)", null], ["Granite (granite, Cretaceous)", "#f9f97f"], ["Granite (diorite)", "#f9f97f"]]);
  // a box over the north-west quarter only (tile y runs down, so the big square sits in the north-west): it shrinks to the box
  const midLon = (lonMin + lonMax) / 2, midLat = (latMin + latMax) / 2;
  const corner = macrostratUnitFeatures([tile], [lonMin, midLat, midLon, latMax]);
  assert.equal(corner.features.length, 1);
  assert.ok(corner.features[0].parts[0].every(([lon, lat]) => lon <= midLon + 1e-6 && lat >= midLat - 1e-6));
  assert.equal(macrostratUnitFeatures([tile], [lonMin, latMin, midLon, midLat]).features.length, 0); // the south-west quarter holds nothing
});

test("the dialog adds the map layer through the store, and Maps passes addMapLayer", () => {
  const m = read("src/components/MacrostratModal.jsx");
  assert.match(m, /addMapLayer\(r\.layer\)/);
  assert.match(m, /Add the units as a map layer \(for Model it\)/);
  assert.match(read("src/modules/GeophysicsModule.jsx"), /<MacrostratModal [^\n]*addMapLayer=\{addMapLayer\}/);
  const f = read("src/lib/macrostratFetch.js");
  assert.match(f, /styleField: "unit", categories/);
  assert.match(f, /buildLayer\(\{ name, geomType: "polygon", epsg: 4326, features \}/);
});
