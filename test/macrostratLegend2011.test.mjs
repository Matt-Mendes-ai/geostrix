// TASKS.csv #2011 — the Macrostrat geology drape's legend: a vector-tile reader, the units in the tiles, and where the legend shows.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readVectorTile } from "../src/lib/mvt.js";
import { macrostratLegend } from "../src/lib/macrostrat.js";
import { rasterLegendGroups } from "../src/lib/legendGroups.js";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// a small protobuf writer, enough for one vector tile
const varint = (n) => { const out = []; while (n > 127) { out.push((n & 127) | 128); n = Math.floor(n / 128); } out.push(n); return out; };
const field = (f, wire, payload) => [...varint((f << 3) | wire), ...(wire === 2 ? varint(payload.length) : []), ...payload];
const str = (s) => [...new TextEncoder().encode(s)];
const value = (v) => (typeof v === "string" ? field(1, 2, str(v)) : Number.isInteger(v) ? field(5, 0, varint(v)) : field(3, 1, [...new Uint8Array(new Float64Array([v]).buffer)]));
const feature = (tags, type, geomLen, packed = true) => [...(packed ? field(2, 2, tags.flatMap(varint)) : tags.flatMap((t) => field(2, 0, varint(t)))), ...field(3, 0, varint(type)), ...field(4, 2, Array(geomLen).fill(0x1b))];
const layer = (name, keys, values, feats) => field(3, 2, [...field(15, 0, varint(2)), ...field(1, 2, str(name)), ...feats.flatMap((f) => field(2, 2, f)), ...keys.flatMap((k) => field(3, 2, str(k))), ...values.flatMap((v) => field(4, 2, value(v))), ...field(5, 0, varint(4096))]);

test("readVectorTile: layers, properties of every value type, packed and unpacked tags, and a feature after a long geometry", () => {
  const keys = ["name", "legend_id", "best_age_top", "color"], values = ["Quaternary alluvium", 76320, 2.588, "#F9F97F", "Tiedemann pluton"];
  const bytes = Uint8Array.from([
    ...layer("units", keys, values, [feature([0, 0, 1, 1, 2, 2, 3, 3], 3, 420), feature([0, 4, 1, 1], 3, 7, false)]), // 420 bytes: a two-byte length, where a skip once landed short
    ...layer("lines", ["type"], ["fault"], [feature([0, 0], 2, 5)]),
  ]);
  const layers = readVectorTile(bytes);
  assert.deepEqual(layers.map((l) => [l.name, l.extent, l.features.length]), [["units", 4096, 2], ["lines", 4096, 1]]);
  assert.deepEqual(layers[0].features[0], { id: null, type: "polygon", properties: { name: "Quaternary alluvium", legend_id: 76320, best_age_top: 2.588, color: "#F9F97F" } });
  assert.deepEqual(layers[0].features[1].properties, { name: "Tiedemann pluton", legend_id: 76320 });
  assert.deepEqual(layers[1].features[0], { id: null, type: "line", properties: { type: "fault" } });
});

const unit = (p) => ({ id: null, type: "polygon", properties: p });
const ref = { ref_authors: "Cui, Y., Miller, D.", ref_year: "2017", ref_title: "British Columbia digital geology", ref_source: "BCGS Open File 2017-8", ref_url: "http://example.invalid/map", source_id: 1092 };
const tileA = [{ name: "units", extent: 4096, features: [
  unit({ ...ref, legend_id: 84122, name: "intrusive rocks", age: "Late Cretaceous", lith: "quartz dioritic intrusive igneous rocks", color: "#7ee000", best_age_top: 66, best_age_bottom: 100.5 }),
  unit({ ...ref, legend_id: 76320, name: "Quaternary alluvium", age: "Quaternary", lith: "alluvium", color: "#F9F97F", best_age_top: 0, best_age_bottom: 2.588 }),
  unit({ ...ref, legend_id: 83955, name: "intrusive rocks", age: "Age Unknown", lith: "tonalite intrusive igneous rocks", color: "#777777", descrip: "Tonalite" }),
  unit({ ...ref, legend_id: 99, name: "no colour", age: "Paleocene", lith: "x", color: "", best_age_top: 56, best_age_bottom: 66 }),
  { id: null, type: "line", properties: { ...ref, legend_id: 5, name: "a line in the units layer" } },
] }, { name: "lines", extent: 4096, features: [{ id: null, type: "line", properties: { type: "fault" } }, { id: null, type: "line", properties: { type: "fault" } }, { id: null, type: "line", properties: { type: "" } }] }];
const tileB = [{ name: "units", extent: 4096, features: [unit({ ...ref, legend_id: 76320, name: "Quaternary alluvium", age: "Quaternary", lith: "alluvium", color: "#F9F97F", best_age_top: 0, best_age_bottom: 2.588 })] }];

test("macrostratLegend: one row per legend_id, youngest first, no age last, colours checked, lines and sources listed", () => {
  const l = macrostratLegend([tileA, tileB]);
  assert.deepEqual(l.units.map((u) => [u.name, u.polygons, u.color]), [["Quaternary alluvium", 2, "#f9f97f"], ["no colour", 1, null], ["intrusive rocks", 1, "#7ee000"], ["intrusive rocks", 1, "#777777"]]);
  assert.deepEqual(l.units[0].ma, [2.588, 0]);
  assert.equal(l.units[3].ma, null);
  assert.equal(l.units[3].descrip, "Tonalite");
  assert.deepEqual(l.lines, [{ type: "fault", count: 2 }, { type: "line", count: 1 }]);
  assert.deepEqual(l.sources, ["Cui, Y., Miller, D. (2017). British Columbia digital geology. BCGS Open File 2017-8. http://example.invalid/map"]);
  assert.deepEqual(macrostratLegend([]), { units: [], lines: [], sources: [] });
});

test("the Layout legend lists the drape's units as swatches; a hidden drape is left out", () => {
  const legend = macrostratLegend([tileA]);
  const r = { id: "m1", name: "Macrostrat geology (CC BY 4.0)", opacity: 0.7, legend };
  const g = rasterLegendGroups([r, { ...r, id: "m2", visible: false }]);
  assert.equal(g.length, 1);
  assert.equal(g[0].label, r.name);
  assert.deepEqual(g[0].items.map((it) => it[0]), ["Quaternary alluvium", "no colour (Paleocene)", "intrusive rocks (Late Cretaceous)", "intrusive rocks"]);
  assert.deepEqual(g[0].items[1].slice(1), ["#777777", { kind: "fill", opacity: 0.7 }]);
});

test("the legend shows under the raster row in Maps and in the 3D View, and the modal fetches it with the drape", () => {
  assert.match(read("src/modules/RasterModule.jsx"), /<RasterLegend raster=\{r\} updateRaster=\{updateRaster\} \/>/);
  assert.match(read("src/modules/ViewerModule.jsx"), /<RasterLegend raster=\{r\} updateRaster=\{updateRaster\} compact \/>/);
  const m = read("src/components/MacrostratModal.jsx");
  assert.match(m, /legend = await fetchMacrostratLegend\(\{ bboxLonLat/);
  assert.match(m, /\.\.\.\(legend \? \{ legend \} : \{\}\)/);
  assert.match(read("src/lib/mvt.js"), /const n = varint\(\); pos \+= n;/);
});
