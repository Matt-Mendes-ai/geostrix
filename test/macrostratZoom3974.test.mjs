// TASKS.csv #3974 (Matt: "macrostrat is not available everywhere ... I tried a random place in Nigeria and didn't get any map") — where only a
// continental map exists, Macrostrat's carto tiles are blank at the deep zooms: the zoom steps down until the tiles hold units (floor 4,
// capped), no extra request when the first zoom works, one zoom for the drape, legend and polygons, and one line says what map was found.
// Synthetic tiles (readVectorTile output); no request is made here.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { macrostratZoomSteps, firstZoomWithUnits, tilesHoldUnits, macrostratScaleNote, macrostratLegend, macrostratLayersInArea, lonLatToTilePx, MACROSTRAT_FLOOR_ZOOM } from "../src/lib/macrostrat.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const AREA = [7.45, 9.05, 7.65, 9.25]; // a made-up 20 km box
// the tiles of a plan: blank (no layers) above `mapFrom`, a units polygon covering the tile at mapFrom and below
const tilesOf = (plan, mapFrom) => {
  const out = [];
  for (let y = plan.y0; y <= plan.y1; y++) for (let x = plan.x0; x <= plan.x1; x++) {
    const layers = plan.z > mapFrom ? [] : [{ name: "units", extent: 4096, features: [{ type: "polygon", properties: { name: "Test unit", legend_id: 1, source_id: 190 }, geometry: [[[0, 0], [4096, 0], [4096, 4096], [0, 4096], [0, 0]]] }] }];
    out.push({ z: plan.z, x, y, layers });
  }
  return out;
};

test("#3974 the zooms to try: the deepest that fits first, then one at a time down to the floor, the requests capped", () => {
  const steps = macrostratZoomSteps(AREA);
  assert.equal(steps[0].z, 12);
  assert.deepEqual(steps.map((s) => s.z), [12, 11, 10, 9, 8, 7, 6, 5, 4]);
  assert.equal(steps.at(-1).z, MACROSTRAT_FLOOR_ZOOM);
  assert.ok(steps.reduce((n, s) => n + s.count, 0) <= 60);
  const capped = macrostratZoomSteps(AREA, { maxRequests: 15 });
  assert.ok(capped.reduce((n, s) => n + s.count, 0) <= 15 || capped.length === 1, "capped (the first zoom is always tried)");
});

test("#3974 a zoom that works costs no extra request; blank deep zooms step down to the first with a map; all blank: null", async () => {
  const steps = macrostratZoomSteps(AREA);
  const run = async (mapFrom) => { const asked = []; const r = await firstZoomWithUnits(steps, async (p) => { asked.push(p.z); return { count: p.count, tiles: tilesOf(p, mapFrom) }; }, AREA); return { r, asked }; };
  const deep = await run(12);
  assert.deepEqual(deep.asked, [12], "no extra request"); assert.equal(deep.r.index, 0); assert.equal(deep.r.requests, steps[0].count);
  const africa = await run(8); // the Nigerian case: blank from zoom 9 up
  assert.deepEqual(africa.asked, [12, 11, 10, 9, 8]); assert.equal(africa.r.got.tiles[0].z, 8); assert.equal(africa.r.index, 4);
  assert.equal(africa.r.requests, steps.slice(0, 5).reduce((n, s) => n + s.count, 0));
  const none = await run(2);
  assert.equal(none.r, null, "nothing even at the floor"); assert.equal(none.asked.at(-1), 4);
  // an error (offline) stops the search: it is not a blank map
  await assert.rejects(firstZoomWithUnits(steps, async () => { throw new Error("offline"); }, AREA), /offline/);
});

test("#3974 the legend from the zoom that held the map (the first zoom blank)", async () => {
  const steps = macrostratZoomSteps(AREA);
  assert.equal(tilesHoldUnits(tilesOf(steps[0], 8), AREA), false);
  const r = await firstZoomWithUnits(steps, async (p) => ({ count: p.count, tiles: tilesOf(p, 8) }), AREA);
  const legend = macrostratLegend(macrostratLayersInArea(r.got.tiles, AREA));
  assert.deepEqual(legend.units.map((u) => u.name), ["Test unit"]);
  assert.ok(lonLatToTilePx(8, 0, 0, 1, 7.5, 9.1).every(Number.isFinite));
});

test("#3974 one line for the map found, from its scale or its scale class; none for a regional or detailed map", () => {
  assert.equal(macrostratScaleNote([{ scale: "small", sourceName: "Africa", sourceScale: "1:10000000" }]), "Only a 1:10,000,000 map covers this area (Africa): regional, not property-scale.");
  // as Macrostrat answered live for central Nigeria: the class in `scale`, the scale in the title
  assert.equal(macrostratScaleNote([{ scale: "small", sourceName: "Africa", sourceScale: "small", sourceTitle: "New edition of the 1:10,000,000 geological map of Africa" }]), "Only a 1:10,000,000 map covers this area (Africa): regional, not property-scale.");
  assert.equal(macrostratScaleNote([{ scale: "small", sourceName: "Africa" }]), "Only a continent- or country-scale map covers this area (Africa): regional, not property-scale.");
  assert.equal(macrostratScaleNote([{ scale: "tiny", sourceName: "Generalized Geology of the World" }]), "Only a world-scale map covers this area (Generalized Geology of the World): regional, not property-scale.");
  assert.equal(macrostratScaleNote([{ scale: "medium", sourceName: "A regional map" }]), null);
  assert.equal(macrostratScaleNote([{ scale: "small", sourceScale: "1:250000", sourceName: "x" }]), "Only a continent- or country-scale map covers this area (x): regional, not property-scale.", "a 1:250,000 scale is not called out as small");
  assert.equal(macrostratScaleNote([]), null);
});

test("#3974 wired: one tile fetch for every route (drape, legend, map layer, the trend helper's polygons); the note on the card, the layer and the hint", () => {
  const f = read("../src/lib/macrostratFetch.js"), m = read("../src/components/MacrostratModal.jsx"), h = read("../src/modules/viewer/TrendHelper.jsx");
  assert.match(f, /const found = await firstZoomWithUnits\(steps, \(plan\) => fetchZoom\(plan, onProgress\), bboxLonLat\);/);
  assert.equal((f.match(/await fetchMacrostratTiles\(bboxLonLat, onProgress\)/g) || []).length, 4, "drape, legend, polygons, map layer");
  assert.match(f, /scaleNote: found\.index > 0 \? await scaleNoteAt\(bboxLonLat\) : null/, "the point query only after a step down");
  assert.match(f, /\/geologic_units\/map\?lat=\$\{lat\.toFixed\(5\)\}&lng=\$\{lng\.toFixed\(5\)\}`/, "the point query passes no scale");
  assert.match(f, /Macrostrat has no map here, even at a continent's scale\. Try Maps > Web layers/);
  assert.equal((m.match(/\(r\.scaleNote \? " " \+ r\.scaleNote : ""\)/g) || []).length, 2);
  assert.match(m, /\.\.\.\(r\.scaleNote \? \{ scaleNote: r\.scaleNote \} : \{\}\)/, "in the drape's provenance");
  assert.match(h, /if \(card && got\.scaleNote\) card\.warnings = \[\.\.\.card\.warnings, got\.scaleNote\];/);
});
