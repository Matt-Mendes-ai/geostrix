// TASKS.csv #4087 — the Maps-area panels not yet on steps (#4070's audit gap): the raster panel (RasterModule) on StepPane, the Survey planner on StepDialog,
// Planned-hole targeting's explanations behind More. Each keeps its reachable set: every setting and action the old panel offered is still in its source.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(here, "..", p), "utf8").replace(/\r\n/g, "\n");
const missingFrom = (src, list) => list.filter((k) => !src.includes(k));
mkdirSync(path.join(here, "..", "node_modules", ".cache"), { recursive: true });
const dir = mkdtempSync(path.join(here, "..", "node_modules", ".cache", "gs-maps4087-"));
process.on("exit", () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ } });
// a panel that reads the store, bundled WITH the store (two bundles would be two React contexts)
const withStore = (entry, name) => {
  const src = path.join(dir, name + ".entry.jsx"), abs = (p) => JSON.stringify(path.join(here, "..", p).replace(/\\/g, "/"));
  writeFileSync(src, `export { StoreProvider } from ${abs("src/lib/store.jsx")};\nexport { default as M } from ${abs(entry)};\n`);
  const out = path.join(dir, name);
  writeFileSync(out, buildSync({ entryPoints: [src], bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", external: ["react", "react-dom", "react/jsx-runtime", "lucide-react", "papaparse"], logLevel: "silent", loader: { ".js": "jsx", ".png": "dataurl", ".svg": "dataurl" } }).outputFiles[0].text);
  return pathToFileURL(out).href;
};
const React = (await import("react")).default, { renderToStaticMarkup } = await import("react-dom/server");
const h = React.createElement;

test("#4087 the raster panel: Import, Rasters, Filter and the Result a run opens; one gold primary; every control kept", () => {
  const src = read("src/modules/RasterModule.jsx");
  assert.ok(src.includes('<StepPane id="rasters" label={tr("GeoTIFF / GXF")} helpPage="geotiff-gxf"'), "on StepPane, its Help behind the step bar's ?");
  for (const k of ['key: "import"', 'key: "rasters"', 'key: "filter"']) assert.ok(src.includes(k), k);
  assert.ok(src.includes("result={{ key: ranAt,"), "a run that lands opens the Result step");
  assert.equal((src.match(/gs-btn--primary/g) || []).length, 1, "the Import step's gold button; Compute is the pane's action");
  assert.ok(/action=\{fr \? \{ label: filtering \? tr\("Filtering…"\)/.test(src), "Compute is StepPane's action, on the Filter step");
  assert.ok(src.includes('onClick={() => { setFilterFor(r.id); requestStep("rasters", "filter"); }}'), "a card's filter icon opens the Filter step on that grid");
  assert.ok(!src.includes("<InfoButton"), "the panel's info pop-up went to its Help page");
  assert.deepEqual(missingFrom(src, [
    "<SourceCrsField", "Keep full detail (up to 4096 px)", "Import a grid…", // Import
    "<Eye size", "<SlidersHorizontal", "<Download", "<ScatterChart", "<Crosshair", "<ChevronUp", "<ChevronDown", "<Trash2", "showSceneColour(r)", // a card's actions
    "Drape on terrain{v}", 'tr("Elev.")', 'tr("Opacity")', 'summary={tr("Fine-tune…")}', "On the ground between the collars", "<RasterColourControls", "<GridContourControls",
    "Transparent colour", "<RasterScene", "<RasterLegend", "<RasterPictureLegend", "<ZonalStatsBox", "<LodCacheLine", // a card's settings
    'value="rtp"', 'value="rtpa"', 'value="rte"', 'value="vd1"', 'value="tilt"', 'value="as"', 'value="upward"', 'value="tiltdepth"', 'value="worms"', 'value="euler"', 'value="spectrum"',
    "Fill from IGRF-14", "Survey date (for IGRF)", "Amplitude-correction inclination", 'aria-label={tr("Structural index")}', "Euler window size", "integrate it first (pseudo-gravity)",
    "Unit of the gravity derivative", "Upward continuation height", "It is a magnetic or gravity field", // the filters' values
    "Radiometric ternary image (K-eTh-eU)…", "Build the ternary image", "<SpectrumPanel", // ternary, spectrum
    "<BasemapView", "<SpectralIndexModal", "<GeoreferencerModal", // the ribbon's dialogs
  ]), []);
  // each filter's explanation sits behind its More (a closed fold: not seen first)
  const fold = src.slice(src.indexOf("#4087 — what the filter does and assumes"), src.indexOf("</MoreFold>", src.indexOf("#4087 — what the filter does and assumes")));
  assert.ok(fold.includes("Spector & Grant 1970") && fold.includes("Reid et al. 1990") && fold.includes("Hornby et al. 1999"));
});

test("#4087 the raster panel renders with the store: the Import step with its gold button", async () => {
  const { StoreProvider, M } = await import(withStore("src/modules/RasterModule.jsx", "raster.mjs"));
  const html = renderToStaticMarkup(h(StoreProvider, null, h(M, { embedded: true })));
  assert.match(html, /data-step-pane="rasters"/);
  assert.match(html, /class="gs-btn gs-btn--primary gs-btn--block"[^>]*>Import a grid…</);
  assert.match(html, /No rasters imported yet\./, "the Rasters step (mounted, hidden) says so");
  assert.match(html, /No grid to filter yet\./);
});

test("#4087 the Survey planner: Area, Grid / Streams, Numbering, Plan; Show on the map is the gold primary; every setting and file kept", async () => {
  const src = read("src/components/SurveyPlannerPanel.jsx");
  assert.ok(src.includes('from "./StepDialog.jsx"') && src.includes("<StepDialog "), "on the shared StepDialog");
  assert.ok(!src.includes("useFocusTrap") && !src.includes("useEscapeKey") && !src.includes("gs-btn--primary"), "the shell's parts live in StepDialog");
  assert.ok(src.includes("help={help}") && src.includes("<details open>"), "the explanations are in the Help card");
  for (const k of ['key: "area"', 'key: "spacing"', 'key: "numbers"', 'key: "plan"']) assert.ok(src.includes(k), k);
  assert.ok(src.includes('primary: { label: tr("Show on the map"), onClick: draw, disabled: !plan?.sites.length }'));
  assert.deepEqual(missingFrom(src, [
    '"Soil grid"', '"Stream sites"', "pickArea(", "West (E)", "South (N)", "East (E)", "North (N)", // Area
    "Line azimuth (°)", "Line spacing (m)", "Station spacing (m)", "Survey date (declination)", "Stagger alternate lines", "Serpentine numbering",
    "Strahler orders", "Catchment from (km²)", "to (km²)", // Grid / Streams
    "Sample number prefix", "First number", 'tr("Digits")', "Samples a day (crew)", "QC inserts", "+ add an insert", "Remove this insert", // Numbering
    'save("gpx"', 'save("kml"', 'save("csv"', 'save("html"', "Field sheet (print)", 'openHelp("survey-planner")', // Plan, Help
  ]), []);
  const { StoreProvider, M } = await import(withStore("src/components/SurveyPlannerPanel.jsx", "planner.mjs"));
  const html = renderToStaticMarkup(h(StoreProvider, null, h(M, { onClose: () => {} })));
  assert.match(html, /aria-label="Survey planner" data-step-dialog="[^"]*" data-step="area"/);
  assert.match(html, /Soil grid/); assert.match(html, /Stream sites/);
  assert.match(html, /Next: grid/);
});

test("#4087 Trends: its intro (the Trend helper already says it) and the per-model 'Used by' table behind folds, every model still listed", () => {
  const src = read("src/components/TrendsPanel.jsx");
  assert.ok(/<MoreFold style=\{\{ \.\.\.small, marginBottom: 8 \}\}>\{tr\("A trend is the direction the geology is most continuous in/.test(src), "the intro in the fold");
  assert.ok(src.includes('<MoreFold summary={tr("Used by")}'), "the table behind 'Used by'");
  for (const k of ["implicit", "structural", "alteration", "gradeShell", "estimation", "geoml", "explicit"]) assert.ok(src.includes(`["${k}",`), k);
  assert.ok(read("src/modules/viewer/TrendHelper.jsx").includes("withHelperTrend(s, t, follow)"), "the helper sets which models follow");
});

test("#4087 the Maps plan view's status line is short", () => {
  const src = read("src/components/MapsPlanView.jsx");
  assert.ok(src.includes('tr("Wheel: zoom · drag: pan · double-click: fit")') && !src.includes("drape and 3D in StrixViewer"));
});

test("#4087 Planned-hole targeting: the three explanations behind More", () => {
  const src = read("src/components/PlannedHoleTargeting.jsx");
  const folds = [...src.matchAll(/<MoreFold[^>]*>([\s\S]*?)<\/MoreFold>/g)].map((m) => m[1]);
  assert.equal(folds.length, 2);
  assert.ok(folds[0].includes("The 3D point this hole should reach") && folds[0].includes("Lift: the hole flattens with depth"));
  assert.ok(folds[1].includes("Once this hole has been drilled"));
});
