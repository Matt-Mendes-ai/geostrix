// TASKS.csv #2315 — the Macrostrat legend lists only the units with polygons inside the area fetched, not every unit of the tiles.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { macrostratLegend, macrostratLayersInArea, macrostratUnitFeatures, lonLatToTilePx } from "../src/lib/macrostrat.js";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// one zoom-12 tile (about 10 km) and a 1 km area in it; tile units are 0..4096 with y down
const z = 12, x = 1095, y = 1386, ext = 4096;
const lon = (px) => ((x + px / ext) / 2 ** z) * 360 - 180;
const lat = (py) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + py / ext)) / 2 ** z))) * 180) / Math.PI;
const area = [lon(1800), lat(2200), lon(2200), lat(1800)]; // [lonMin, latMin, lonMax, latMax]
const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]; // clockwise on screen = positive (outer)
const unit = (id, name, rings) => ({ id: null, type: "polygon", properties: { legend_id: id, name, age: "Jurassic", lith: "x", color: "#aa66cc" }, geometry: rings });
const tile = { z, x, y, layers: [{ name: "units", extent: ext, features: [
  unit(1, "Hazelton Group (purple, under the whole area)", [sq(0, 0, 4096, 4096)]),
  unit(2, "Coast Plutonic Complex (far west of the area)", [sq(0, 0, 900, 4096)]),
  unit(3, "Stuhini Group (touches the area edge only)", [sq(2200, 0, 3000, 1000)]),
  unit(4, "Bowser Lake (a small body inside)", [sq(1900, 1900, 1950, 1950)]),
  unit(5, "Ring unit (the area sits in its hole)", [sq(1000, 1000, 3000, 3000), sq(1500, 1500, 2500, 2500).reverse()]),
] }, { name: "lines", extent: ext, features: [
  { id: null, type: "line", properties: { type: "fault" }, geometry: [[[100, 100], [300, 300]]] },
  { id: null, type: "line", properties: { type: "contact" }, geometry: [[[1700, 2000], [2100, 2000]]] },
] }] };

test("#2315 the corner math: the area is the 400 x 400 tile-unit square in the middle", () => {
  const a = lonLatToTilePx(z, x, y, ext, area[0], area[3]), b = lonLatToTilePx(z, x, y, ext, area[2], area[1]);
  assert.deepEqual([...a, ...b].map((v) => Math.round(v)), [1800, 1800, 2200, 2200]);
});

test("#2315 only the units with area inside the box are listed (an edge touch or a hole around the area is not a unit on the map)", () => {
  const all = macrostratLegend([tile.layers]);
  assert.equal(all.units.length, 5);
  const inArea = macrostratLegend(macrostratLayersInArea([tile], area));
  assert.deepEqual(inArea.units.map((u) => u.name).sort(), ["Bowser Lake (a small body inside)", "Hazelton Group (purple, under the whole area)"]);
  assert.deepEqual(inArea.lines, [{ type: "contact", count: 1 }]);
  assert.equal(macrostratLegend(macrostratLayersInArea([tile], null)).units.length, 5); // no area: the tiles as before
});

test("#2315 the map layer's units and the drape's legend agree", () => {
  const { features } = macrostratUnitFeatures([tile], area);
  const legend = macrostratLegend(macrostratLayersInArea([tile], area));
  assert.deepEqual([...new Set(features.map((f) => f.attributes.unit))].sort(), legend.units.map((u) => u.name).sort());
});

test("#2315 wiring: the legend fetch cuts to the area and marks it; an old legend offers to fetch it again", () => {
  const f = read("src/lib/macrostratFetch.js");
  assert.match(f, /macrostratLegend\(macrostratLayersInArea\(tiles, bboxLonLat\)\), inArea: true/);
  const r = read("src/components/RasterLegend.jsx");
  assert.match(r, /const stale = isMacrostrat\(r\) && !legend\.inArea && !!r\.provenance\?\.areaLonLat;/);
  assert.match(r, /Fetch it again for the area only/);
});

test("#2315 the map layer has one category per unit name (no repeats when two legend entries share a name, lithology and age)", () => {
  const f = read("src/lib/macrostratFetch.js");
  assert.match(f, /units\.filter\(\(u\) => counts\[u\.unit\] && !seenUnit\.has\(u\.unit\) && seenUnit\.add\(u\.unit\)\)/);
  // the case seen live: two Nicola Group entries with the same name, lithology and age get the same unit name
  const twin = (id) => ({ id: null, type: "polygon", properties: { legend_id: id, name: "Nicola Group", age: "Upper Triassic", lith: "basaltic volcanic rocks", color: "#aa66cc" }, geometry: [sq(1850, 1850, 2150, 2150)] });
  const t2 = { z, x, y, layers: [{ name: "units", extent: ext, features: [twin(11), twin(12), unit(13, "Nicola Group", [sq(1800, 1800, 1900, 1900)])] }] };
  const names = macrostratUnitFeatures([t2], area).units.map((u) => u.unit);
  assert.equal(names.filter((n) => n === "Nicola Group (basaltic volcanic rocks, Upper Triassic)").length, 2); // the source of the repeat the filter removes
});
