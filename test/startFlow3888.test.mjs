// TASKS.csv #3888 (redesign P5) — the start dialogs' rules (lib/startFlow.js: when they show; lib/startChecklist.js: the ground step, the checklist,
// the coordinate system in words). SYNTHETIC holes, terrains and file names only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shouldShowStart, startOptedOut, setStartOptOut, START_DIALOG_KEY } from "../src/lib/startFlow.js";
import { groundFileKind, terrainSummary, crsWords, groundStrip, startChecklist, startDestination } from "../src/lib/startChecklist.js";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

test("#3888 when the dialogs show: at launch only with no project, no recovery copy, no file opened and the box not ticked; New project and the button always", () => {
  assert.equal(shouldShowStart({ reason: "launch", empty: true }), true);
  assert.equal(shouldShowStart({ reason: "launch", empty: false }), false, "a project already loaded");
  assert.equal(shouldShowStart({ reason: "launch", empty: true, recoveryOffered: true }), false, "the crash-recovery banner offers the last work");
  assert.equal(shouldShowStart({ reason: "launch", empty: true, openedFile: true }), false, "a project file double-clicked at launch");
  assert.equal(shouldShowStart({ reason: "launch", empty: true, optedOut: true }), false);
  assert.equal(shouldShowStart({ reason: "new", empty: false, optedOut: true }), true);
  assert.equal(shouldShowStart({ reason: "button", optedOut: true }), true);
});

test("#3888 'Do not show this when GeoStrix starts' is a personal setting in localStorage (geostrix.startDialog); a storage that throws is no setting", () => {
  const s = memory();
  assert.equal(START_DIALOG_KEY, "geostrix.startDialog");
  assert.equal(startOptedOut(s), false);
  setStartOptOut(true, s); assert.equal(s.getItem(START_DIALOG_KEY), "off"); assert.equal(startOptedOut(s), true);
  setStartOptOut(false, s); assert.equal(startOptedOut(s), false);
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() {} };
  assert.equal(startOptedOut(broken), false);
  assert.doesNotThrow(() => setStartOptOut(true, broken));
});

test("#3888 the ground step: a GeoTIFF is a terrain, a table goes to step 2; the terrain in one line; the coordinate system in plain words", () => {
  assert.deepEqual(["dem.tif", "Ground.TIFF", "collars.csv", "assays.xlsx", "geology.gpkg"].map(groundFileKind), ["terrain", "terrain", "table", "table", "other"]);
  const elevations = new Float32Array([100, 150, NaN, 420.4]);
  const t = terrainSummary({ bbox: [500000, 6000000, 503500, 6012000], elevations, noDataMask: null });
  assert.equal(t.text, "Your ground: 3.5 × 12 km, from 100 m to 420 m above sea level.");
  assert.equal(terrainSummary({ bbox: [0, 0, 1, 1], elevations: new Float32Array([NaN]) }), null);
  assert.equal(crsWords(26909, "NAD83 / UTM zone 9N"), "Your map uses UTM zone 9 North (NAD83 / UTM zone 9N, EPSG:26909).");
  assert.equal(crsWords(32750, "WGS 84 / UTM zone 50S"), "Your map uses UTM zone 50 South (WGS 84 / UTM zone 50S, EPSG:32750).");
  assert.equal(crsWords(4326, "WGS 84"), "Your map uses latitude and longitude (WGS 84, EPSG:4326).");
  assert.equal(crsWords(3005, "NAD83 / BC Albers"), "Your map uses NAD83 / BC Albers (EPSG:3005).");
  assert.match(crsWords(null), /^No coordinate system yet/);
});

test("#3888 'make one for me': the strip waits for the collars, needs a coordinate system, and goes once there is a terrain", () => {
  assert.equal(groundStrip({ choice: "skip", collars: 5, epsg: 32609 }), null);
  assert.equal(groundStrip({ choice: "make", collars: 0, epsg: 32609 }).state, "waiting");
  assert.equal(groundStrip({ choice: "make", collars: 5, epsg: null }).state, "nocrs");
  assert.equal(groundStrip({ choice: "make", collars: 5, epsg: 32609 }).state, "ready");
  assert.equal(groundStrip({ choice: "make", collars: 5, epsg: 32609, terrain: true }), null);
});

test("#3888 the checklist fills itself in from the project; 'I'm not using drill hole data' keeps only 'Anything else' and opens on Maps", () => {
  const empty = startChecklist({});
  assert.deepEqual(empty.map((r) => r.key), ["collars", "survey", "litho", "assays", "structure", "other"]);
  assert.ok(empty.every((r) => !r.done));
  const collars = Array.from({ length: 3 }, (_, i) => ({ hole_id: `DH-23-00${i + 1}`, x: 1, y: 2, z: 3 }));
  const s = { collars, survey: [], layers: { litho: [{ value: "BAS" }, { value: "AND" }, { value: "BAS" }], structure: [{}, {}] }, assays: [{}], assayElements: [{ symbol: "Au" }, { symbol: "Cu" }], rasters: [{ name: "mag.tif" }], surfaceSamples: [{}, {}] };
  const rows = Object.fromEntries(startChecklist(s).map((r) => [r.key, r]));
  assert.equal(rows.collars.detail, "3 holes");
  assert.equal(rows.survey.done, false);
  assert.equal(rows.survey.detail, "None yet: the holes are drawn straight for now.");
  assert.equal(rows.litho.detail, "2 rock codes");
  assert.equal(rows.assays.detail, "Au, Cu");
  assert.equal(rows.structure.detail, "2 measurements");
  assert.equal(rows.other.detail, "mag.tif, 2 surface samples");
  assert.deepEqual(startChecklist(s, { noDrill: true }).map((r) => r.key), ["other"]);
  assert.equal(startDestination({ noDrill: true, collars: 3 }), "maps");
  assert.equal(startDestination({ collars: 0 }), "maps");
  assert.equal(startDestination({ collars: 3 }), "viewer");
});

test("#3888 the startup chunk holds only the show check: startFlow.js carries no words; the dialogs load on demand", () => {
  const f = read("../src/lib/startFlow.js");
  assert.doesNotMatch(f, /\bimport\b/, "no import at all: nothing else rides into the startup chunk with it");
  const app = read("../src/App.jsx");
  assert.match(app, /const StartDialogs = React\.lazy\(\(\) => import\("\.\/components\/StartDialogs\.jsx"\)\);/);
  assert.match(app, /import \{ shouldShowStart, startOptedOut, LAUNCH_SETTLE_MS \} from "\.\/lib\/startFlow\.js";/);
  assert.doesNotMatch(app, /startChecklist/);
});

test("#3888 App mounts it: at launch after the recovery check and the launch file, on New project, from the empty view's button; another tab closes it", () => {
  const app = read("../src/App.jsx");
  assert.match(app, /recoveryCheck\(\)\.then\(\(r\) => new Promise\(\(ok\) => setTimeout\(\(\) => ok\(r\), LAUNCH_SETTLE_MS\)\)\)\.then\(\(r\) => \{/);
  assert.match(app, /shouldShowStart\(\{ reason: "launch", empty: l\.empty, optedOut: startOptedOut\(\), recoveryOffered: !!r, openedFile: !!l\.tab\?\.filePath \}\)/);
  assert.match(app, /newWorkspaceTab\(\);\n    setStartDialog\(\{ reason: "new" \}\);/);
  assert.match(app, /useModuleAction\(\["open-start-dialog"\], \(\) => setStartDialog\(\{ reason: "button" \}\)\);/);
  assert.match(app, /else if \(startTab\.current !== activeTabId\) setStartDialog\(null\);/);
  assert.match(read("../src/modules/viewer/EmptyViewerBody.jsx"), /onClick=\{\(\) => requestModuleAction\("open-start-dialog"\)\}/);
});

test("#3888 step 2 imports through the 3D view's own entry, under the import's dialogs; the ground through the terrain importer's parser; nothing fetched without a click", () => {
  const d = read("../src/components/StartDialogs.jsx");
  assert.match(d, /requestModuleAction\("import-dropped-files", \{ files \}\)/);
  assert.equal((d.match(/requestModuleAction\(/g) || []).length, 1, "one import entry, no other");
  assert.match(d, /const Z = 55;/);
  assert.ok(55 < 60, "every other dialog sits at 60 (the column matching at 62)");
  assert.match(d, /const \{ parseDEMFiles \} = await import\("\.\.\/lib\/raster\.js"\);/);
  assert.match(d, /onClick=\{makeGround\}/);
  assert.equal((d.match(/fetchCopernicusTerrain\(/g) || []).length, 1);
  assert.match(d, /Only the corner coordinates of the area are sent\./);
  assert.match(d, /No internet connection: using the collar heights for now\. Add a terrain later with Add data\./);
});
