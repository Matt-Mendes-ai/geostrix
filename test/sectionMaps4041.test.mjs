// TASKS.csv #4041 (Matt, v0.2.9, Macpass: Macrostrat geology and other imported rasters / vectors on the cross-section and on its overview) —
// the map layers along a section line: polygon units as spans, line crossings as ticks, a picture sampled as a strip (named by a legend), the
// section's own choice of layers else the ones visible in Maps, the key's rows, the overview's pictures and the credits. Made-up units only.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { lineOf, polygonSpans, lineTicks, stripSpans, chosenMapIds, shownMapLayers, mapKeyRows, overviewWithMaps, shortCredit, creditsOf, bandLayers, featureLook, STRIP_MAX } from "../src/lib/sectionMaps.js";
import { overviewSvg } from "../src/lib/sectionOverview.js";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const sec = { ax: 0, ay: 0, bx: 1000, by: 0 };
const sq = (x0, x1) => [[x0, -50], [x1, -50], [x1, 50], [x0, 50], [x0, -50]];
const geology = { name: "Geology", geomType: "polygon", styleField: "unit", categories: [{ value: "VOL", color: "#aa0000" }, { value: "SED", color: "#00aa00" }, { value: "TUF", color: "#0000aa", visible: false }],
  features: [{ parts: [sq(100, 400)], attributes: { unit: "VOL" } }, { parts: [sq(400, 700)], attributes: { unit: "SED" } }, { parts: [sq(650, 900)], attributes: { unit: "SED" } }, { parts: [sq(200, 300)], attributes: { unit: "SED" } }, { parts: [sq(920, 990)], attributes: { unit: "TUF" } }] };

test("#4041 polygon units along the line: crossings, the last drawn on top, neighbours of one unit merged, hidden categories left out", () => {
  assert.deepEqual(polygonSpans(geology, sec, [0, 1000]).map((s) => [s.from, s.to, s.label, s.colour]), [[100, 200, "VOL", "#aa0000"], [200, 300, "SED", "#00aa00"], [300, 400, "VOL", "#aa0000"], [400, 900, "SED", "#00aa00"]]);
  assert.deepEqual(polygonSpans(geology, sec, [-200, 250]).map((s) => [s.from, s.to]), [[100, 200], [200, 250]], "past A: the range given (the ground's reach)");
  // a hole in a polygon (even-odd, as Maps fills it)
  const holed = { geomType: "polygon", color: "#123456", name: "One colour", features: [{ parts: [sq(0, 600), sq(200, 300)], attributes: {} }] };
  assert.deepEqual(polygonSpans(holed, sec, [0, 1000]).map((s) => [s.from, s.to, s.label]), [[0, 200, "One colour"], [300, 600, "One colour"]], "no style field: the layer's colour and name");
  assert.deepEqual(polygonSpans(geology, { ax: 0, ay: 500, bx: 1000, by: 500 }, [0, 1000]), [], "a line that misses every polygon");
  assert.equal(featureLook(geology, { attributes: { unit: "TUF" } }), null);
  assert.equal(lineOf({ ax: 1, ay: 1, bx: 1, by: 1 }), null, "a line of no length");
});

test("#4041 line crossings as ticks, with a dip when the feature has one", () => {
  const faults = { name: "Faults", geomType: "polyline", styleField: "name", categories: [{ value: "F-1", color: "#c0392b" }], features: [{ parts: [[[250, -100], [250, 100]]], attributes: { name: "F-1", dip: "65" } }, { parts: [[[800, -100], [820, 100], [700, 300]]], attributes: { name: "F-2", Dip: "" } }] };
  assert.deepEqual(lineTicks(faults, sec, [0, 1000]).map((t) => [t.at, t.label, t.colour, t.dip]), [[250, "F-1", "#c0392b", 65], [810, "F-2", "#e2a63c", null]]);
  assert.deepEqual(lineTicks(geology, sec, [0, 1000]), [], "polygons give no ticks");
});

test("#4041 a picture sampled along the line: its colours, a legend's names, gaps where it is transparent or keyed out, at most STRIP_MAX samples", () => {
  const w = 10, h = 2, data = new Uint8ClampedArray(w * h * 4);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) { const q = (r * w + c) * 4; data[q] = c < 5 ? 255 : 0; data[q + 2] = c < 5 ? 0 : 255; data[q + 3] = c === 9 ? 0 : 255; }
  const px = { width: w, height: h, data };
  assert.deepEqual(stripSpans(px, [0, -50, 1000, 50], sec, [0, 1000], { legend: [{ name: "Red unit", color: "#ff0000" }] }).map((s) => [s.from, s.to, s.label, s.colour]), [[0, 500, "Red unit", "#ff0000"], [500, 900, "", "#0000ff"]]);
  assert.deepEqual(stripSpans(px, [0, -50, 1000, 50], sec, [0, 1000], { keyColour: "#0000ff" }).map((s) => [s.from, s.to]), [[0, 500]], "the picture's transparent colour");
  const big = { width: 4096, height: 1, data: new Uint8ClampedArray(4096 * 4).fill(255) };
  const one = stripSpans(big, [0, -1, 1000, 1], sec, [0, 1000]);
  assert.equal(one.length, 1, "one colour all along: one span"); assert.equal(STRIP_MAX, 400, "a 4,096 px picture is sampled 400 times, not 4,096");
});

test("#4041 which layers show, the key, the overview's pictures and the credits", () => {
  const maps = { layers: [
    { id: "raster:r1", name: "Picture", kind: "raster", visible: false, spans: [{ label: "West", colour: "#ff0000" }], png: "data:r" },
    { id: "map:g", name: "Geology", kind: "polygon", visible: true, spans: [{ label: "VOL", colour: "#aa0000" }, { label: "VOL", colour: "#aa0000" }, { label: "SED", colour: "#00aa00" }], png: "data:g", opacity: 0.6, credit: "Geology: Macrostrat (macrostrat.org), CC BY 4.0. Peters, S.E. et al. (2018)." },
    { id: "map:f", name: "Faults", kind: "polyline", visible: true, ticks: [{ label: "F-1", colour: "#c0392b" }], png: "data:f" } ] };
  assert.deepEqual(chosenMapIds(null, maps), ["map:g", "map:f"], "default: as in Maps");
  assert.deepEqual(chosenMapIds({ maps: ["raster:r1", "gone"] }, maps), ["raster:r1"], "the section's own choice, ids still there");
  assert.deepEqual(chosenMapIds({ maps: [] }, maps), [], "none chosen stays none");
  assert.deepEqual(mapKeyRows(maps, ["map:g", "map:f"]), [["Geology: VOL", "#aa0000"], ["Geology: SED", "#00aa00"], ["Faults: F-1", "#c0392b"]]);
  assert.equal(shortCredit(maps.layers[1].credit), "Geology: Macrostrat (macrostrat.org), CC BY 4.0");
  assert.deepEqual(creditsOf(shownMapLayers(maps, ["map:g"])), ["Geology: Macrostrat (macrostrat.org), CC BY 4.0"]);
  const model = { origin: [0, 0], size: [100, 100], holes: [], boundaries: [], series: [], stepM: null, shade: null };
  const ov = overviewWithMaps(model, maps, ["map:g", "map:f"]);
  assert.deepEqual(ov.maps, [{ href: "data:g", opacity: 0.6 }, { href: "data:f", opacity: 0.8 }]);
  assert.equal(overviewWithMaps(model, maps, []), model, "nothing shown: the model as it was");
  const svg = overviewSvg(ov, { ax: 10, ay: 10, bx: 90, by: 90, corridor: 5 }, 200, 200);
  assert.equal((svg.match(/<image href="data:[gf]"/g) || []).length, 2); assert.match(svg, /Geology: Macrostrat \(macrostrat\.org\), CC BY 4\.0<\/text>/);
  const { bands, ticks } = bandLayers(shownMapLayers(maps, ["raster:r1", "map:g", "map:f"]));
  assert.deepEqual(bands.map((l) => l.id), ["map:g", "raster:r1"], "Maps' top layer nearest the ground");
  assert.deepEqual(ticks.map((l) => l.id), ["map:f"]);
});

mkdirSync(new URL("../node_modules/.cache", import.meta.url), { recursive: true });
const here = path.dirname(fileURLToPath(import.meta.url)), dir = mkdtempSync(path.join(here, "..", "node_modules", ".cache", "gs-maps4041-"));
process.on("exit", () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ } });
const bundled = (rel) => { const out = path.join(dir, "c.mjs"); writeFileSync(out, buildSync({ entryPoints: [path.join(here, "..", rel)], bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", external: ["react", "react-dom", "react/jsx-runtime"], logLevel: "silent" }).outputFiles[0].text); return pathToFileURL(out).href; };

test("#4041 the bands follow the ground; units named where wide enough; ticks with their dip; the credit; nothing without spans", async () => {
  const { default: SectionMapBands } = await import(bundled("src/components/SectionMapBands.jsx"));
  const layers = [{ id: "map:g", name: "Geology", kind: "polygon", spans: [{ from: 0, to: 600, label: "VOL", colour: "#aa0000" }, { from: 600, to: 610, label: "LONGNAME", colour: "#00aa00" }], credit: "Map: test. More." },
    { id: "map:f", name: "Faults", kind: "polyline", ticks: [{ at: 300, label: "F-1", colour: "#c0392b", dip: 65 }] }];
  const props = { layers, profile: [{ d: 0, z: 100 }, { d: 1000, z: 200 }], sx: (d) => d / 2, sz: (z) => 500 - z, fs: (n) => n, top: 20, bottom: 480, left: 40, clipId: "c" };
  const html = renderToStaticMarkup(React.createElement(SectionMapBands, props));
  assert.match(html, /data-map-band="map:g"/); assert.match(html, />VOL</); assert.doesNotMatch(html, />LONGNAME</, "5 px is too narrow for its name");
  assert.match(html, /<polygon points="0\.0,402\.0 300\.0,342\.0 300\.0,352\.0 0\.0,412\.0"/, "the band 2 px under the ground, 10 px thick, along its slope");
  assert.match(html, /data-map-tick="map:f"/); assert.match(html, />F-1 65°</); assert.match(html, />Map: test</);
  assert.match(html, /clip-path="url\(#c\)"/);
  assert.equal(renderToStaticMarkup(React.createElement(SectionMapBands, { ...props, layers: [{ id: "x", kind: "polygon", spans: [] }] })), "");
  const flat = renderToStaticMarkup(React.createElement(SectionMapBands, { ...props, profile: null }));
  assert.match(flat, /<polygon points="0\.0,22\.0 300\.0,22\.0/, "no terrain: along the top of the plot");
});

test("#4041 wiring: built with each section, drawn in the figure, keyed, chosen in the Labels menu and saved with the section, on the overview", () => {
  const vm = read("../src/modules/ViewerModule.jsx"), sw = read("../src/components/SectionWindow.jsx"), b = read("../src/lib/sectionMapsBuild.js");
  assert.match(vm, /payload\.maps = await \(await import\("\.\.\/lib\/sectionMapsBuild\.js"\)\)\.buildSectionMaps\(\{ section: sent\.section, profile: sent\.elevationProfile, overview: payload\.overview, mapLayers, rasters \}\);/);
  assert.match(vm, /geophysPtsMax \/\* #1807 \*\/, mapLayers, rasters \/\* #4041 \*\/\]\);/, "a layer added later reaches the section");
  assert.match(sw, /\{data\.maps && <SectionMapBands layers=\{shownMapLayers\(data\.maps, chosenMapIds\(labels, data\.maps\)\)\} profile=\{elevationProfile\}/);
  assert.match(sw, /\.\.\.mapKeyRows\(data\.maps, chosenMapIds\(labels, data\.maps\)\) \/\* #4041 \*\//);
  assert.match(sw, /<SectionOverview model=\{ovModel\} /);
  assert.match(sw, /onChange=\{\(e\) => changeLabels\(\{ maps: e\.target\.checked \? \[\.\.\.mapIds, l\.id\] : mapIds\.filter\(\(x\) => x !== l\.id\) \}\)\}/, "saved with the section's labels");
  assert.match(b, /export const PICK_PX = 1024, OVERVIEW_PX = 256;/, "light: a picture read at no more than 1,024 px a side");
  assert.match(b, /ctx\.imageSmoothingEnabled = false; ctx\.drawImage\(img, 0, 0, w, h\);/, "nearest neighbour: a geological map keeps its exact colours");
  assert.ok(Buffer.byteLength(read("../src/modules/ViewerModule.jsx")) <= 735000);
});
