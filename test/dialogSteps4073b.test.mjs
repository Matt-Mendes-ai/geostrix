// TASKS.csv #4073 (side 2's list) — the dialogs moved onto the shared StepDialog (components/StepDialog.jsx): each renders as steps with the one gold
// primary, its explanations in the Help card, and the reachable set pinned: every setting and action the old dialog offered is still in its source.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(here, "..", p), "utf8").replace(/\r\n/g, "\n");
mkdirSync(path.join(here, "..", "node_modules", ".cache"), { recursive: true });
const dir = mkdtempSync(path.join(here, "..", "node_modules", ".cache", "gs-dialogs4073b-"));
const bundle = (entry, name) => { const out = path.join(dir, name); writeFileSync(out, buildSync({ entryPoints: [path.join(here, "..", entry)], bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", external: ["react", "react-dom", "react/jsx-runtime", "lucide-react", "papaparse"], logLevel: "silent" }).outputFiles[0].text); return pathToFileURL(out).href; };
// a dialog that reads the store, bundled WITH the store (two bundles would be two React contexts)
const withStore = (entry, name) => {
  const src = path.join(dir, name + ".entry.jsx"), abs = (p) => JSON.stringify(path.join(here, "..", p).replace(/\\/g, "/"));
  writeFileSync(src, `export { StoreProvider } from ${abs("src/lib/store.jsx")};\nexport { default as M } from ${abs(entry)};\n`);
  const out = path.join(dir, name);
  writeFileSync(out, buildSync({ entryPoints: [src], bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", external: ["react", "react-dom", "react/jsx-runtime", "lucide-react", "papaparse"], logLevel: "silent" }).outputFiles[0].text);
  return pathToFileURL(out).href;
};
process.on("exit", () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ } });
const React = (await import("react")).default, { renderToStaticMarkup } = await import("react-dom/server");
const h = React.createElement;
const count = (s, re) => (s.match(re) || []).length;
const onShell = (src, name) => {
  assert.ok(src.includes('from "./StepDialog.jsx"') && src.includes("<StepDialog "), `${name} is on the shared StepDialog`);
  assert.ok(!src.includes("useFocusTrap") && !src.includes("useEscapeKey") && !src.includes("gs-btn--primary"), `${name}: the shell's parts live in StepDialog`);
  assert.ok(/help=\{help\}/.test(src) && src.includes("<details open>"), `${name}: the explanations are in the Help card`);
};
const missingFrom = (src, list) => list.filter((k) => !src.includes(k));

// a closed box (outward faces) and a flat sheet, in world E, N, Z
const box = (x0, y0, z0, x1, y1, z1) => ({ positions: new Float32Array([x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]),
  indices: new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]) });

test("#4073 Solid tools: Tool, Setup, Result; the tool the data allows is chosen; one gold primary", async () => {
  const src = read("src/components/SolidToolsModal.jsx");
  onShell(src, "Solid tools");
  for (const k of ['key: "tool"', 'key: "setup"', 'key: "result"']) assert.ok(src.includes(k), k);
  const { default: M } = await import(bundle("src/components/SolidToolsModal.jsx", "solid.mjs"));
  const meshes = { a: box(0, 0, -100, 100, 100, 0), b: box(50, 50, -150, 150, 150, -50) };
  const props = (surfaces) => ({ solid: { id: "a", name: "Body A" }, surfaces, meshOf: (id) => meshes[id] || null, onAdd: () => {}, onClose: () => {} });
  const s = renderToStaticMarkup(h(M, props([{ id: "a", name: "Body A", closure: "closed" }, { id: "b", name: "Body B", closure: "closed" }])));
  assert.equal(count(s, /role="listitem"/g), 3);
  assert.equal(count(s, /gs-btn--primary/g), 1);
  assert.match(s, /aria-pressed="true"[^>]*>.{0,200}Clip by a surface/s, "a surface to clip by exists: Clip is chosen");
  assert.ok(s.includes('aria-label="Help"') && !s.includes("The surface inside the solid becomes the cap"), "the long explanation waits in the Help card");
  // the only other surface is the solid itself: nothing to clip by, so Combine is not offered either (no other closed solid)
  const alone = renderToStaticMarkup(h(M, props([{ id: "a", name: "Body A", closure: "closed" }])));
  assert.equal(count(alone, /disabled=""[^>]*>.{0,120}(Clip by a surface|Combine with another solid)/gs), 2, "neither tool can run without a second surface");
});

test("#4073 Solid tools: every setting and action of the old dialog is still reachable, and the result is numbers", () => {
  const src = read("src/components/SolidToolsModal.jsx");
  assert.deepEqual(missingFrom(src, ["setCutterId(", "setKeep(", "setOtherId(", "setOp(", "onClick: clip ? runClip : runBoolean", 'value="terrain"', 'value="positive"', 'value="negative"',
    'value="intersection"', 'value="union"', 'value="difference"', "clipSolidBySurface(me, cutterMesh, { keep })", "solidBoolean(me, om, op)", "onAdd({", "cutterMesh.sampled"]), []);
  assert.ok(src.includes("<StepNumbers rows={[") && src.includes('label: tr("Volume")') && src.includes('label: tr("Closed")') && src.includes('label: tr("Separate bodies")'), "the Result step: volume, closure, pieces");
  for (const k of ["nothing to cut.", "share no volume.", "nothing was cut, so nothing was added.", "a boolean needs two closed solids", "the cut is approximate there", "the solid was not cut there"]) assert.ok(src.includes(k), k);
});

test("#4073 Project CRS: Where, then Check; Decide later on an unset CRS; above the import dialogs; the spot pre-filled from the collars", async () => {
  const src = read("src/components/ProjectCrsModal.jsx");
  onShell(src, "Project CRS");
  for (const k of ['key: "where"', 'key: "check"', "zIndex={Z_ABOVE_IMPORT}", 'cancelLabel={project.crsSet ? null : tr("Decide later")}', "collarCentreLonLat(collars, firstChoice)"]) assert.ok(src.includes(k), k);
  const { StoreProvider, M } = await import(withStore("src/components/ProjectCrsModal.jsx", "crs.mjs"));
  const s = renderToStaticMarkup(h(StoreProvider, null, h(M, { onDone: () => {} })));
  assert.equal(count(s, /role="listitem"/g), 2);
  assert.equal(count(s, /gs-btn--primary/g), 1);
  assert.ok(s.includes(">Decide later<") && s.includes(">Choose a CRS<") && s.includes("z-index:64"), "unset: Decide later, nothing chosen, in front of the import (64)");
  assert.ok(!s.includes("can't tell UTM zones apart"), "the why is in the Help card");
});

test("#4073 Project CRS: every answer of the old dialog is still reachable", () => {
  const src = read("src/components/ProjectCrsModal.jsx");
  assert.deepEqual(missingFrom(src, ["familyZones.map((c)", "setLocalMode(true)", "setGridName(", "setGridRl(", "setGridNorth(", "setWhere(", "setMoreLocal(", "setSearchAll(", "<CrsPicker value={choice} onChange={setChoice}",
    "onClick: keepLocal", "onClick: use", "setEpsg(choice)", "setLocalGridDatum?.(d)", "<CrsWorldMap", "spread?.far > 0", "datumNote(choice)", "relabel &&", "kmFromStated > 50"]), []);
});

test("#4073 Surface query: Question, then Result; the closure as numbers; nothing swept until the Result step; Export CSV is the Result's primary", async () => {
  const src = read("src/components/SurfaceQueryModal.jsx");
  onShell(src, "Surface query");
  for (const k of ['key: "question"', 'key: "result"', "const showing = at === 1;", "if (!mesh || tab !== \"holes\" || !showing) return [];", "onClick: exportCsv"]) assert.ok(src.includes(k), k);
  const { StoreProvider, M } = await import(withStore("src/components/SurfaceQueryModal.jsx", "query.mjs"));
  const b = box(0, 0, -100, 100, 100, 0);
  const s = renderToStaticMarkup(h(StoreProvider, null, h(M, { surfaces: [{ id: "a", name: "Shell A", ...b }], traces: [], onClose: () => {} })));
  assert.equal(count(s, /role="listitem"/g), 2);
  assert.equal(count(s, /gs-btn--primary/g), 1);
  assert.ok(s.includes(">Sweep the holes<") && /Closed<\/span><span[^>]*>Yes</.test(s) && /Edges<\/span><span[^>]*>18</.test(s), "a closed box: Yes, 18 edges");
  const none = renderToStaticMarkup(h(StoreProvider, null, h(M, { surfaces: [], onClose: () => {} })));
  assert.ok(none.includes("No generated surfaces yet") && !none.includes('role="list"'), "no surface: one screen saying so");
});

test("#4073 Surface query: every setting of the old dialog is still reachable", () => {
  const src = read("src/components/SurfaceQueryModal.jsx");
  assert.deepEqual(missingFrom(src, ["setSurfaceId(", "setTab(k)", "setStep(Number(", "setPtX", "setPtY", "setPtZ", "setBmId(", "setBmCut(", "surfaceQueryRows(rows", "holeDistanceToMesh(mesh.q", "intervalsInsideMesh(mesh.q",
    "signedDistanceToMesh(mesh.q", "bmLookup.find(p.x, p.y, p.z)", "holesInBlockModel(bmHoles, bmCutoff)", "sampledMetres(", "(tangential)", "worldNearest"]), []);
});

test("#4073 Compare versions: Versions (A and B pre-filled with the lineage's last two runs), then Result; the geometry runs only on request", async () => {
  const src = read("src/components/SurfaceCompareModal.jsx");
  onShell(src, "Compare versions");
  for (const k of ['key: "versions"', 'key: "result"', "onClick: runCompare", "onClick: exportCsv", "if (r) setStep(1);"]) assert.ok(src.includes(k), k);
  const { default: M } = await import(bundle("src/components/SurfaceCompareModal.jsx", "compare.mjs"));
  const surfaces = [{ id: "v1", name: "Shell v1", params: { tool: "grade shell", cutoff: 0.5 } }, { id: "v2", name: "Shell v2", supersedes: "v1", params: { tool: "grade shell", cutoff: 0.3 } }];
  const s = renderToStaticMarkup(h(M, { surfaces, initialId: "v2", getMesh: () => null, onClose: () => {} }));
  assert.equal(count(s, /role="listitem"/g), 2);
  assert.equal(count(s, /gs-btn--primary/g), 1);
  assert.ok(s.includes(">Compare geometry<") && /<option value="v1" selected="">v1/.test(s) && /<option value="v2" selected="">v2/.test(s), "A = v1, B = v2");
  assert.ok(s.includes("cutoff") && s.includes("0.5") && s.includes("0.3"), "the setting that changed, before any geometry");
  const none = renderToStaticMarkup(h(M, { surfaces: [surfaces[0]], onClose: () => {} }));
  assert.ok(none.includes("No surface has more than one version yet") && !none.includes('role="list"'));
});

test("#4073 Compare versions: every control of the old dialog is still reachable", () => {
  const src = read("src/components/SurfaceCompareModal.jsx");
  assert.deepEqual(missingFrom(src, ["setLineageRootId(", "setAId(", "setBId(", "onOverlay?.(surfA.id, surfB.id)", "onClearOverlay?.()", "onAccept?.(surfA.id)", "onAccept?.(surfB.id)", "surfaceCompareRows(", "editDisclosure(", "diffParams(",
    "paramDiff.outcomes", "result.sampledOnly", "result.identical", "result.bothClosed", "Exploration target volume only"]), []);
});

test("#4073 Public geochemistry: Area (from the project's data), then Survey; Download or Continue to the import is the one primary; the privacy line stays in view", async () => {
  const src = read("src/components/PublicGeochemModal.jsx");
  onShell(src, "Public geochemistry");
  for (const k of ['key: "area"', 'key: "survey"', "setStep(1); // #4073", "onClick: importCdogs", "onClick: importNgsa", "onClick: download"]) assert.ok(src.includes(k), k);
  const { StoreProvider, M } = await import(withStore("src/components/PublicGeochemModal.jsx", "pg.mjs"));
  const s = renderToStaticMarkup(h(StoreProvider, null, h(M, { onLoaded: () => {}, onClose: () => {} })));
  assert.equal(count(s, /role="listitem"/g), 2);
  assert.equal(count(s, /gs-btn--primary/g), 1);
  assert.ok(s.includes("Only the area is sent, never your project&#x27;s data.") && s.includes(">Draw area…<"), "no located data: the area is drawn; what is sent is said");
});

test("#4073 Public geochemistry: every control of the old dialog is still reachable", () => {
  const src = read("src/components/PublicGeochemModal.jsx");
  assert.deepEqual(missingFrom(src, ["setQ(", "setOnlyHere(", "setSelId(", "setLayerIx(", "setDrawing(true)", "setCdogs({ ...cdogs, pick:", "setNgsa({ ...ngsa, pick:", "<BasemapView mode=\"draw\"", "entry.licenceUrl", "entry.attribution", "entry.caveat", "entry.page",
    "fetchServiceSamples(", "parseBcRgs(", "parseNgdbPackage(", "parseNure(", "ngsaChoices(", "cdogsCandidates("]), []);
});

test("#4073 Spectral index: fetch is Imagery, Scene, Index; a file is File, Index; Hyperspectral is one screen with its tab's run as the one primary", async () => {
  const src = read("src/components/SpectralIndexModal.jsx");
  onShell(src, "Spectral index");
  for (const k of ['key: "imagery"', 'key: "scene"', 'key: "index"', 'key: "file"', 'key: "hyper"', "onClick: search", "onClick: run", "if (list.length) { setSceneId(list[0].id); setStep(1); }", "bare onPrimary={setHyperPrimary}"]) assert.ok(src.includes(k), k);
  const hy = read("src/components/HyperspectralTab.jsx");
  assert.ok(hy.includes("{!bare && <div") && hy.includes("onPrimary?.({ label: primaryLabel, onClick: () => runRef.current(), disabled: !canRun })"), "bare: no footer of its own; its run handed up");
  const { StoreProvider, M } = await import(withStore("src/components/SpectralIndexModal.jsx", "si.mjs"));
  const s = renderToStaticMarkup(h(StoreProvider, null, h(M, { epsg: 32609, areaOptions: [{ id: "p", label: "The project area", bboxLonLat: [-130.2, 56.4, -130.0, 56.5] }], onImport: () => {}, onClose: () => {} })));
  assert.equal(count(s, /role="listitem"/g), 3);
  assert.equal(count(s, /gs-btn--primary/g), 1);
  assert.ok(s.includes("Find scenes") && /aria-pressed="true"[^>]*>Fetch imagery</.test(s), "fetch first, the project's area chosen");
});

test("#4073 Spectral index: every control of the old dialog is still reachable", () => {
  const src = read("src/components/SpectralIndexModal.jsx");
  assert.deepEqual(missingFrom(src, ["pickSource(e.target.value)", "setAreaId(", "setDrawing(true)", "setDates((d) => ({ ...d, from:", "setDates((d) => ({ ...d, to:", "setMaxCloud(", "setSceneId(", "setSmoothTir(", "onClick={showColour}",
    "pickFile(f)", "setDnEnc(", "pickSensor(e.target.value)", "setPresetId(v)", "setCustom(", "setMaskVeg(", "setVegMax(", "setSnowOn(", "setSnowMin(", "setMapping((m)", "<HyperspectralTab", "<BasemapView mode=\"draw\""]), []);
});

test("#4073 Fence diagram: Holes, then Panel (opened on it, the holes pre-selected); Export SVG the one primary; its own colours on a white sheet", async () => {
  const src = read("src/components/FenceDiagramModal.jsx");
  onShell(src, "Fence diagram");
  for (const k of ['key: "holes"', 'key: "panel"', "onClick: exportSvg", "initial.ids.length >= 2 ? 1 : 0", 'const sheet = { background: "#ffffff"']) assert.ok(src.includes(k), k);
  assert.ok(!/var\(--color-/.test(src.replace(/<details open>[\s\S]*?<\/details>/, "")), "theme.js's excluded file: no colour token outside the Help card (the shell's)");
  const { StoreProvider, M } = await import(withStore("src/components/FenceDiagramModal.jsx", "fence.mjs"));
  const traces = ["DH-23-001", "DH-23-002", "DH-23-003"].map((id, i) => ({ hole_id: id, md: [0, 100, 200], wx: [i * 50, i * 50 + 10, i * 50 + 20], wy: [0, 0, 0], wz: [100, 0, -100] }));
  const s = renderToStaticMarkup(h(StoreProvider, null, h(M, { traces, litho: [{ hole_id: "DH-23-001", from: 0, to: 50, value: "AND" }], onClose: () => {} })));
  assert.equal(count(s, /role="listitem"/g), 2);
  assert.equal(count(s, /gs-btn--primary/g), 1);
  assert.ok(s.includes("Export SVG") && s.includes("<svg") && /aria-current="step"[^>]*>.{0,400}Panel/s.test(s), "opens on the panel");
});

test("#4073 Fence diagram: every control of the old dialog is still reachable", () => {
  const src = read("src/components/FenceDiagramModal.jsx");
  assert.deepEqual(missingFrom(src, ["pickSection(", "setAzMode(", "setManualAz(", "setOffsetLimit(", "dropOffLine", "setSelected(new Set(allIds))", "setSelected(new Set())", "toggle(id)", "setShow(", "setTrackKey(", "setTrackLog(",
    "setVe(Number(", "setVe(suggestFenceVe(", "setColWidth(", "setPatternsOn(", "setShowBands(", "exportSvgMarkup(svgRef.current"]), []);
});

test("#4073 Stereonet: Picks, then Plot (opened on it); Export SVG the one primary, held back with the reason when nothing is plotted; its own colours", async () => {
  const src = read("src/components/StereonetModal.jsx");
  onShell(src, "Stereonet");
  for (const k of ['key: "picks"', 'key: "plot"', "onClick: exportSvg, disabled: nothing", 'const sheet = { background: "#ffffff"', "Add as structural trend"]) assert.ok(src.includes(k), k);
  const { default: M } = await import(bundle("src/components/StereonetModal.jsx", "stereo.mjs"));
  const picks = Array.from({ length: 8 }, (_, k) => ({ hole_id: "DH-23-001", depth: 10 * k, dip: 60 + k, azimuth: 120 + k, value: "Vein" }));
  const s = renderToStaticMarkup(h(M, { picks, onClose: () => {}, onUseAsTrend: () => {} }));
  assert.equal(count(s, /role="listitem"/g), 2);
  assert.equal(count(s, /gs-btn--primary/g), 1);
  assert.ok(/aria-current="step"[^>]*>.{0,400}Plot/s.test(s) && s.includes("<svg") && s.includes("Mean orientation (n=8)"), "opens on the net, with the statistics");
  const none = renderToStaticMarkup(h(M, { picks: [], onClose: () => {} }));
  assert.match(none, /<button[^>]*gs-btn--primary[^>]*disabled=""/, "nothing at all: Export held back");
});

test("#4073 Stereonet: every control of the old dialog is still reachable", () => {
  const src = read("src/components/StereonetModal.jsx");
  assert.deepEqual(missingFrom(src, ["setView(", "setSource(", "setProjection(", "setRoseMode(", "setRoseBin(", "setRoseMinDip(", "setQualityMax(", "setTypeFilter(", "setAreaFilter(", "setViewOnly(", "setBoundaryId(", "setDomainId(",
    "setShowPoles(", "setShowCircles(", "setShowMean(", "setZoomData(", "setShowContours(", "setTerzaghiOn(", "onUseAsTrend({", "exportSvgMarkup(svgEl"]), []);
});

test("#4073 StepDialog's optional props: zIndex, cancelLabel, overlayProps on the overlay, a primary's attrs on the gold button (and they cannot replace its class or action)", async () => {
  const { default: SD } = await import(bundle("src/components/StepDialog.jsx", "sd-props.mjs"));
  const one = (primary, extra = {}) => renderToStaticMarkup(h(SD, { title: "T", onClose: () => {}, at: 0, onAt: () => {}, steps: [{ key: "a", label: "A", render: () => h("p", null, "x"), primary }], ...extra }));
  const plain = one({ label: "Go" });
  assert.ok(plain.includes("z-index:60") && plain.includes(">Cancel<"), "without them: as before");
  const s = one({ label: "Go", attrs: { "data-start-next": "", className: "nope" } }, { zIndex: 70, cancelLabel: "Decide later", overlayProps: { "data-drop-guard": "" } });
  assert.ok(s.includes("z-index:70") && s.includes(">Decide later<"));
  assert.match(s, /<div style="[^"]*z-index:70[^"]*" data-drop-guard="">/);
  const btn = s.match(/<button[^>]*data-start-next=""[^>]*>/)?.[0] || "";
  assert.ok(btn.includes('class="gs-btn gs-btn--primary"') && !btn.includes("nope"), "the attrs are on the gold button; the shell's class wins");
});
