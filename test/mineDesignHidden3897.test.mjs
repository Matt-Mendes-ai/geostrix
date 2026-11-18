// TASKS.csv #3897 (Matt, 2026-11-17: hide Mine Design, keep the code) — ONE switch, electron/features.json, read by the main process
// (the native menu) and by the app (src/lib/features.js, through vite.config.js's define). Switched off: the tab, its menu item and
// Ctrl+number, its Help pages and area, and the link into it from the stope rows. Kept: every pane, lib and test of the module, the
// saved keys (generatedSurfaces of type pit_shell / pit_design / stope / dump, designStrings, designLines, project.currency), so an old
// project opens, keeps that data and saves it back. A link or request naming the tab opens the 3D View. All data here is synthetic.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MINE_DESIGN_ENABLED, HIDDEN_TABS } from "../src/lib/features.js";
import { HELP_AREAS, PANE_HELP } from "../src/lib/help.js";
import { PAGES, pageById } from "../src/help/content.js";
import { fieldsFromPayload, payloadFromFields, projectJson, UNDO_KEYS } from "../src/lib/projectFields.js";
import { buildProjectKml } from "../src/lib/projectKmz.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p) => readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const FEATURES = JSON.parse(rd("electron/features.json"));
const MINE_IDS = ["pit-shell", "pit-design", "nested-pits", "stope-outlines", "drifts-ramps", "dump-stockpile", "design-strings"];

test("one switch, off: electron/features.json is read by the main process and copied into the app by vite.config.js", () => {
  assert.equal(FEATURES.mineDesign, false);
  assert.equal(MINE_DESIGN_ENABLED, false); // plain Node has no define: off, the shipped default
  assert.deepEqual(HIDDEN_TABS, ["minedesign"]);
  const vite = rd("vite.config.js");
  assert.match(vite, /readFileSync\(fileURLToPath\(new URL\("\.\/electron\/features\.json", import\.meta\.url\)\), "utf8"\)/);
  assert.match(vite, /define: \{ __GEOSTRIX_FEATURES__: JSON\.stringify\(\{ mineDesign: FEATURES\.mineDesign === true \}\) \}/);
  assert.match(rd("src/lib/features.js"), /export const MINE_DESIGN_ENABLED = FEATURES\.mineDesign === true;/);
  const main = rd("electron/main.js");
  assert.match(main, /const FEATURES = require\("\.\/features\.json"\);/);
  assert.match(main, /\["Mine Design", "minedesign"\] \/\* TASKS\.csv #1341 \*\/\]\n\s+\.filter\(\(\[, id\]\) => id !== "minedesign" \|\| FEATURES\.mineDesign === true\)/);
});

test("no tab, and a link or request naming it opens the 3D View; the shortcuts list skips its number as the menu does", () => {
  const app = rd("src/App.jsx");
  assert.match(app, /\]\.filter\(\(m\) => !HIDDEN_TABS\.includes\(m\.id\)\); \/\/ TASKS\.csv #3897/);
  assert.match(app, /\.\.\.Object\.fromEntries\(HIDDEN_TABS\.map\(\(id\) => \[id, "viewer"\]\)\) \}/);
  // every way in goes through TAB_ALIAS: the store's goToModule (requestedModule) and the menu's module-<id>
  assert.match(app, /setActive\(TAB_ALIAS\[requestedModule\] \|\| requestedModule\)/);
  assert.match(app, /setActive\(TAB_ALIAS\[m\] \|\| m\)/);
  assert.doesNotMatch(app, /setActive\("minedesign"\)/);
  const TAB_ALIAS = { ...Object.fromEntries(HIDDEN_TABS.map((id) => [id, "viewer"])) };
  assert.equal(TAB_ALIAS.minedesign, "viewer");
  const sc = rd("src/components/ShortcutsModal.jsx");
  assert.match(sc, /\.filter\(\(\[, id\]\) => !HIDDEN_TABS\.includes\(id\)\)\.map\(\(\[label\], i\) => \[`Ctrl\/Cmd\+\$\{i \+ 1\}`, label\]\)/);
  const stope = rd("src/modules/viewer/StopeRunRows.jsx");
  assert.match(stope, /\{MINE_DESIGN_ENABLED && <button type="button" onClick=\{onOpen\}/);
});

test("Help lists, searches and links no Mine Design page; the switched-off panes' own pages still exist", () => {
  assert.ok(!HELP_AREAS.includes("Mine Design"));
  assert.deepEqual(PAGES.filter((p) => p.area === "Mine Design").map((p) => p.id), []);
  assert.deepEqual(PAGES.filter((p) => (p.related || []).some((r) => MINE_IDS.includes(r))).map((p) => p.id), []);
  for (const id of MINE_IDS) assert.ok(pageById(id), id);
  assert.equal(PANE_HELP["Pit shell"], "pit-shell");
  const text = (p) => JSON.stringify([p.summary, p.notFor, p.fields, p.warnings, p.howto]);
  assert.deepEqual(PAGES.filter((p) => /Mine Design|Pit shell|Stope outlines/.test(text(p))).map((p) => p.id), []);
});

// a synthetic old project holding everything Mine Design saves
const tri = { positions: [0, 0, 0, 10, 0, 0, 0, 10, -5], indices: [0, 1, 2] };
const OLD = {
  version: 30,
  project: { name: "Synthetic pit", epsg: 32609, crsSet: true, currency: "CAD" },
  collars: [{ hole_id: "SYN-1", x: 500000, y: 6000000, z: 1000, depth: 100 }],
  designLines: [{ id: "dl1", name: "Ramp A", start: { x: 500010, y: 6000010, z: 990 }, azimuth: 45, segments: [{ type: "straight", length: 50, grade: -12 }, { type: "curve", radius: 20, turn: "left", angle: 90, grade: -12 }] }],
  designStrings: [{ id: "ds1", name: "Footprint", color: "#ff0000", closed: true, visible: true, vertices: [[500000, 6000000, 1000], [500050, 6000000, 1000], [500050, 6000050, 1000]] }],
  generatedSurfaces: [
    { id: "g1", name: "Pit shell: synthetic", type: "pit_shell", tag: "pit", visible: true, closure: null, ...tri, params: { price: 2000, slope: 45 } },
    { id: "g2", name: "Pit design: synthetic", type: "pit_design", visible: true, closure: null, ...tri },
    { id: "g3", name: "Stope 900 m #1", type: "stope", tag: "stope", visible: false, closure: "closed", ...tri, params: { cutoff: 2 } },
    { id: "g4", name: "Dump: synthetic", type: "dump", tag: "dump", visible: true, closure: "closed", volumeM3: 1234, ...tri },
  ],
};
const MINE_KEYS = ["designLines", "designStrings", "generatedSurfaces"];
const plain = (v) => JSON.parse(JSON.stringify(v, (k, x) => (ArrayBuffer.isView(x) ? Array.from(x) : x)));

test("an old project with pits, stopes, dumps, strings, lines and a currency opens with no error and saves them back unchanged", () => {
  const dropped = [];
  const live = fieldsFromPayload(JSON.parse(JSON.stringify(OLD)), "Synthetic pit", dropped);
  assert.deepEqual(dropped, []);
  assert.equal(live.project.currency, "CAD");
  assert.equal(live.generatedSurfaces.length, 4);
  assert.deepEqual(live.generatedSurfaces.map((s) => s.type), ["pit_shell", "pit_design", "stope", "dump"]);
  // saved, and opened again: the same data (the autosave and Save write projectJson)
  const again = fieldsFromPayload(JSON.parse(projectJson(live)), "Synthetic pit");
  assert.equal(again.project.currency, "CAD");
  for (const k of MINE_KEYS) assert.deepEqual(plain(again[k]), plain(live[k]), k);
  for (const k of MINE_KEYS) assert.deepEqual(plain(payloadFromFields(again)[k]), plain(payloadFromFields(live)[k]), `${k} saved form`);
  assert.equal(plain(again.generatedSurfaces[3]).volumeM3, 1234);
  // Undo still tracks the design linework
  assert.ok(UNDO_KEYS.includes("designStrings") && UNDO_KEYS.includes("designLines"));
});

test("the KMZ export still writes an old project's design lines and strings", () => {
  const live = fieldsFromPayload(JSON.parse(JSON.stringify(OLD)), "Synthetic pit");
  const ctx = { projectName: "P", epsg: 32609, collars: [], survey: [], desurveyMethod: "minimum_curvature", layers: {}, customLayers: [], assays: [], assayElements: [], surfaceSamples: [], surfaceStructures: [], mapLayers: [], boundaries: [], plannedHoles: [], sections: [], rasters: [], layerGroups: [], designLines: live.designLines, designStrings: live.designStrings };
  const { kml } = buildProjectKml(ctx, { toLonLat: (x, y) => [-130 + (x - 500000) / 1e5, 54 + (y - 6000000) / 1e5], legendPng: () => null, rasterImage: () => null });
  assert.match(kml, /Ramp A/);
  assert.match(kml, /Footprint/);
});
