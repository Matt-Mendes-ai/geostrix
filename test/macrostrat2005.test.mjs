// TASKS.csv #2005 — Macrostrat (Matt 2026-11-07: yes, with the hosts in the privacy pages first, the attribution shown, and the layer
// switchable off): the geology tiles for the project area as a raster drape, and the units at the centre with their original maps.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planMacrostratTiles, mercatorToLonLat, parseMacrostratUnits, parseMacrostratSources, MACROSTRAT_TILE_URL, MACROSTRAT_CREDIT, tilePixelMetres, outputLongPx } from "../src/lib/macrostrat.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the tile plan: the deepest zoom within the tile budget, covering the area", () => {
  const p = planMacrostratTiles([-131.5, 56.5, -130.9, 56.9]); // Galore Creek area, BC
  assert.ok(p.count <= 36 && p.z >= 8, JSON.stringify(p));
  const deeper = planMacrostratTiles([-131.5, 56.5, -130.9, 56.9], { maxZoom: p.z + 1 });
  assert.equal(deeper.z, p.z, "the next zoom is over the budget");
  const n = 2 ** p.z, x = (lon) => Math.floor(((lon + 180) / 360) * n);
  assert.equal(p.x0, x(-131.5)); assert.equal(p.x1, x(-130.9));
  assert.ok(p.y0 <= p.y1);
  assert.equal(MACROSTRAT_TILE_URL(8, 40, 76), "https://tiles.macrostrat.org/carto/8/40/76.png");
  // the output no finer than the tiles: a 3 km area from z12 512 px tiles at 54 N is ~11 m pixels, so ~270 px, not 1,024
  const m = tilePixelMetres(12, 54, 512);
  assert.ok(Math.abs(m - 11.23) < 0.01, String(m)); // 40,075 km x cos 54 / (4,096 x 512)
  assert.equal(outputLongPx(3000, m), Math.ceil(3000 / m)); assert.equal(outputLongPx(300, m), 256); assert.equal(outputLongPx(1e6, m), 1024);
});

test("Mercator mosaic -> longitude / latitude grid: nearest neighbour, the right pixels, transparent outside", () => {
  // one tile of 4 x 4 px at z 0 (the whole world): each pixel's colour its own index
  const T = 4, mosaic = new Uint8ClampedArray(T * T * 4);
  for (let k = 0; k < T * T; k++) { mosaic[k * 4] = k; mosaic[k * 4 + 3] = 255; }
  const out = mercatorToLonLat(mosaic, { z: 0, x0: 0, y0: 0, tileSize: T, mosaicW: T, mosaicH: T }, [-180, -60, 180, 60], 4, 2);
  // column i -> mercator px i (lon is linear); north row at lat 30 -> mercator y 0.41 of the world -> px 1; south row px 2
  assert.deepEqual([...Array(4)].map((_, i) => out[i * 4]), [4, 5, 6, 7]);
  assert.deepEqual([...Array(4)].map((_, i) => out[(4 + i) * 4]), [8, 9, 10, 11]);
  const outside = mercatorToLonLat(mosaic, { z: 1, x0: 0, y0: 0, tileSize: T, mosaicW: T, mosaicH: T }, [10, 10, 20, 20], 2, 2);
  assert.ok(outside.every((v) => v === 0), "east of the one tile: transparent");
});

test("the units, finest map first, with their sources' citations", () => {
  const units = parseMacrostratUnits({ success: { data: [
    { map_id: 1, source_id: 21, name: "", lith: "", descrip: "", scale: "medium" },
    { map_id: 2, source_id: 205, name: "Bowser Lake Group", strat_name: "Bowser Lake Group", lith: "sandstone, siltstone", t_int_name: "Late Jurassic", b_int_name: "Middle Jurassic", t_age: 143.1, b_age: 174.7, color: "#B3E5FF", scale: "medium" },
    { map_id: 3, source_id: 7, name: "Stikine terrane", lith: "volcanic", best_int_name: "Triassic", scale: "small" },
    { map_id: 4, source_id: 9, name: "Local map unit", lith: "granodiorite", scale: "large" },
    { map_id: 5, source_id: 205, name: "Bowser Lake Group", strat_name: "Bowser Lake Group", lith: "sandstone, siltstone", t_int_name: "Late Jurassic", b_int_name: "Middle Jurassic", scale: "medium" }, // a twin record without ages
  ] } });
  assert.deepEqual(units.map((u) => u.name), ["Local map unit", "Bowser Lake Group", "Stikine terrane"], "empty units out, large scale first");
  assert.equal(units[1].age, "Middle Jurassic – Late Jurassic"); assert.deepEqual(units[1].ma, [174.7, 143.1]); assert.equal(units[1].color, "#B3E5FF");
  assert.equal(units[2].age, "Triassic");
  assert.equal(units.filter((u) => u.name === "Bowser Lake Group").length, 1, "twin records kept once, the one with ages");
  const src = parseMacrostratSources({ success: { data: [{ source_id: 205, name: "British Columbia", url: "http://example.gov/bcgeomap", ref_title: "British Columbia digital geology", authors: "Cui, Y., Miller, D., Schiarizza, P., and Diakow, L.J.", ref_year: "2017", ref_source: "BCGS Open File 2017-8", isbn_doi: "" }] } });
  assert.equal(src[205], "Cui, Y., Miller, D., Schiarizza, P., and Diakow, L.J. (2017). British Columbia digital geology. BCGS Open File 2017-8. http://example.gov/bcgeomap");
  assert.ok(MACROSTRAT_CREDIT.includes("CC BY 4.0") && MACROSTRAT_CREDIT.includes("10.1029/2018GC007467") && MACROSTRAT_CREDIT.includes("10.1002/gdj3.189"));
});

test("the hosts: only these two, through the main process, named in every privacy page", () => {
  const m = read("electron/main.js");
  assert.ok(m.includes('const MACROSTRAT_HOSTS = new Set(["macrostrat.org", "tiles.macrostrat.org"]);'));
  assert.ok(m.includes('ipcMain.handle("macrostrat-fetch"') && m.includes("allowHost: (h) => h.protocol === \"https:\" && MACROSTRAT_HOSTS.has(h.hostname)"));
  assert.ok(read("electron/preload.js").includes('macrostratFetch: (req) => ipcRenderer.invoke("macrostrat-fetch", req)'));
  for (const f of ["PRIVACY.md", "website/privacy.html", "website/es/privacy.html", "website/pt-br/privacy.html", "website/fr/privacy.html", "website/ar/privacy.html"]) {
    const t = read(f); assert.ok(t.includes("tiles.macrostrat.org") && t.includes("macrostrat.org"), f);
  }
  const g = read("src/modules/GeophysicsModule.jsx");
  assert.ok(g.includes('tr("Macrostrat geology…")') && g.includes("<MacrostratModal onClose="));
  const modal = read("src/components/MacrostratModal.jsx");
  assert.ok(modal.includes('name: "Macrostrat geology (CC BY 4.0)"') && modal.includes("credit: MACROSTRAT_CREDIT"));
});

test("colour lookups: lithology codes and age-named units, the most specific name winning, the rest untouched", async () => {
  const { parseLithologies, macrostratLithColours, parseIntervals, timeScaleColours } = await import("../src/lib/macrostratColours.js");
  const liths = parseLithologies({ success: { data: [{ name: "sandstone", color: "#ffff00" }, { name: "sand", color: "#ffcc00" }, { name: "limestone", color: "#0000ff" }, { name: "andesite", color: "#aa0000" }, { name: "quartz monzonite", color: "#ff99cc" }, { name: "monzonite", color: "#ff0099" }, { name: "tuff", color: "#cccc99" }, { name: "breccia", color: "#996633" }, { name: "no colour", color: "" }] } });
  assert.equal(liths.length, 8);
  const hits = macrostratLithColours([
    { value: "LMST", name: "LMST", description: "" }, // abbreviation
    { value: "AND", name: "AND", description: "" },
    { value: "TFF", name: "TFF", description: "tuff breccia" }, // Copley: the code before the longer description word
    { value: "QM", name: "Copley Lake phase", description: "quartz monzonite, pink, equigranular" }, // the description, the longer name wins
    { value: "S2", name: "S2 — fine sandstone", description: "" }, // the label
    { value: "OB", name: "Overburden", description: "sand and gravel" }, // a description word only: matches sand (left to the user to undo)
    { value: "X9", name: "X9", description: "and then some" }, // 'and' inside a description is not andesite
  ], liths);
  const m = Object.fromEntries(hits.map((h) => [h.value, [h.lith, h.by]]));
  assert.deepEqual(m.LMST, ["limestone", "code"]); assert.deepEqual(m.AND, ["andesite", "code"]);
  assert.deepEqual(m.QM, ["quartz monzonite", "description"]); assert.deepEqual(m.S2, ["sandstone", "name"]);
  assert.equal(m.X9, undefined);
  assert.deepEqual(m.TFF, ["tuff", "code"], "the code before the longer description word (Copley: TFF came out as breccia)");
  const ints = parseIntervals({ success: { data: [{ name: "Jurassic", color: "#34B2C9", b_age: 201.3, t_age: 145 }, { name: "Late Jurassic", color: "#B3E3EE", b_age: 163.5, t_age: 145 }, { name: "Eocene", color: "#FDB46C", b_age: 56, t_age: 33.9 }] } });
  const ts = timeScaleColours([{ value: "Late Jurassic granite" }, { value: "Jurassic sediments" }, { value: "Unit 7", label: "Eocene volcanics" }, { value: "Quaternary till" }], ints);
  assert.deepEqual(ts.map((t) => [t.value, t.interval]), [["Late Jurassic granite", "Late Jurassic"], ["Jurassic sediments", "Jurassic"], ["Unit 7", "Eocene"]]);
  assert.ok(read("src/components/LayerInspector.jsx").includes('layerKey === "litho" && <button onClick={macrostratColours}'));
  assert.ok(read("src/components/SurfaceMappingPanel.jsx").includes('tr("Time-scale colours (online)")')); // "(online)": TASKS.csv #2415
});
