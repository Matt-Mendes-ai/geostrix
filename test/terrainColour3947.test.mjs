// TASKS.csv #3947 (Matt's first-time test) — the terrain's default colour in the 3D View is the grey of the Maps hillshade, not the brown khaki
// #8a7f68; a colour the user picked and the drapes stay as they are; a saved project that holds the old default (the store wrote it into every
// terrain) turns grey too. Synthetic grids only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { terrainColour, TERRAIN_GREY, OLD_TERRAIN_DEFAULT } from "../src/lib/terrainColour.js";
import { hillshadeRGBA } from "../src/lib/hillshade.js";
import { colors } from "../src/lib/theme.js";
import { terrainMesh } from "../src/lib/kmzModels.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const hex = (g) => "#" + [g, g, g].map((v) => v.toString(16).padStart(2, "0")).join("");

test("the default is the Maps hillshade's grey for flat ground, and the app.css token", () => {
  const flat = { bbox: [500000, 6200000, 500400, 6200400], gridW: 5, gridH: 5, elevations: new Array(25).fill(812) };
  const px = hillshadeRGBA(flat); // the picture the Maps plan draws (MapsPlanView hillshadeCanvas)
  assert.equal(px[12 * 4], px[12 * 4 + 1]); assert.equal(px[12 * 4], px[12 * 4 + 2]); // grey
  assert.equal(hex(px[12 * 4]), TERRAIN_GREY);
  assert.equal(TERRAIN_GREY, colors.terrain);
  const css = read("../src/styles/app.css");
  assert.match(css, new RegExp(`--color-terrain: ${colors.terrain};`));
  assert.match(css, new RegExp(`--color-terrain-line: ${colors.terrainLine};`));
  // the section's ground line and the sidebar's icon use the darker grey: 4.5:1 on white
  const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  assert.ok(1.05 / (lum(colors.terrainLine) + 0.05) >= 4.5);
});

test("a colour the user picked is kept; none, or the old default the store wrote, is the grey", () => {
  assert.equal(terrainColour(null), TERRAIN_GREY);
  assert.equal(terrainColour({}), TERRAIN_GREY);
  assert.equal(terrainColour({ color: "" }), TERRAIN_GREY);
  assert.equal(terrainColour({ color: OLD_TERRAIN_DEFAULT }), TERRAIN_GREY); // a saved project from before
  assert.equal(terrainColour({ color: "#8A7F68" }), TERRAIN_GREY);
  assert.equal(terrainColour({ color: "#336699" }), "#336699");
  assert.equal(terrainColour({ color: TERRAIN_GREY }), TERRAIN_GREY);
  // the KMZ / geoh5 export's terrain follows the 3D View
  const el = new Array(20).fill(0).map((_, i) => 1000 + i);
  assert.equal(terrainMesh({ bbox: [0, 0, 400, 300], gridW: 5, gridH: 4, elevations: el }).color, TERRAIN_GREY);
  assert.equal(terrainMesh({ bbox: [0, 0, 400, 300], gridW: 5, gridH: 4, elevations: el, color: OLD_TERRAIN_DEFAULT }).color, TERRAIN_GREY);
  assert.equal(terrainMesh({ bbox: [0, 0, 400, 300], gridW: 5, gridH: 4, elevations: el, color: "#aa5500" }).color, "#aa5500");
});

test("wired: the 3D meshes, the colour picker, the sidebar icon, the section ground; a new terrain is added with no colour", () => {
  const sb = read("../src/lib/viewer/sceneBuilders.js"), lt = read("../src/lib/viewer/lodTerrain.js");
  assert.equal((sb.match(/color: terrainColour\(terrain\), side: THREE\.FrontSide/g) || []).length, 2);
  assert.match(lt, /color: terrainColour\(terrain\), side: THREE\.FrontSide/);
  assert.match(read("../src/modules/GeophysicsModule.jsx"), /<input type="color" value=\{terrainColour\(terrain\)\} onChange=\{\(e\) => updateTerrain\(\{ color: e\.target\.value \}\)\}/);
  assert.match(read("../src/modules/viewer/TerrainCard.jsx"), /color: terrainColour\(terrain\) === TERRAIN_GREY \? "var\(--color-terrain-line\)" : terrainColour\(terrain\)/);
  const sw = read("../src/components/SectionWindow.jsx");
  assert.doesNotMatch(sw, /fillOpacity="0\.55"/); // #3949: the ground is a line only (no fill); its line keeps #3947's colour
  assert.match(sw, /stroke=\{colors\.terrainLine\} strokeWidth="1\.6"/);
  const st = read("../src/lib/store.jsx");
  assert.match(st, /setTerrain\(\{ visible: true, opacity: 1, \.\.\.t, id \}\);/);
  // the drapes keep their own pictures and materials (the 3D View draws them as before)
  assert.match(sb, /opacity: r\.opacity \?\? 0\.85, side: THREE\.FrontSide/);
  // the brown is gone from the code, but for the one constant that recognizes it in a saved project
  const src = fileURLToPath(new URL("../src/", import.meta.url)), hits = [];
  (function walk(d) { for (const e of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(jsx?|css)$/.test(e.name) && /8a7f68/i.test(readFileSync(p, "utf8"))) hits.push(path.basename(p)); } })(src);
  assert.deepEqual(hits, ["terrainColour.js"]);
});
