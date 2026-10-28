// TASKS.csv #448 — the project file's fields come from ONE table (src/lib/projectFields.js) that generates save,
// load, New, autosave, undo and the unsaved-change watcher. These tests run that table for real (save -> JSON ->
// load, older files, New) and check that store.jsx wires every field in it, so a field can no longer be saved but
// not loaded, or kept by New, or silently never mark the project unsaved (#343, #462).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FIELDS, FIELD_KEYS, UNDO_KEYS, DIRTY_KEYS, PROJECT_VERSION, EMPTY_LAYERS, emptyFields, fieldsFromPayload, payloadFromFields, extraDirtyValues } from "../src/lib/projectFields.js";

const src = readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8");

// Deliberate "saved but changing it is not an edit" fields, each with its reason (keep this short and honest).
const VIEW_ONLY = {
  project: "name follows the file name; its EPSG / desurvey method ARE watched (extraDirtyValues)",
  viewerUiState: "camera / panel state: saved for convenience, changing the view is not an unsaved edit",
  geophysPtsStops: "legend styling of the point cloud (display preference)", geophysPtsColorMode: "display preference",
  geophysPtsMin: "display preference", geophysPtsMax: "display preference",
  activeLayoutPageId: "which layout page is showing (navigation, not an edit)",
};

test("#448 every field has a known tracking mode; the view-only ones are the documented exceptions", () => {
  assert.equal(new Set(FIELD_KEYS).size, FIELD_KEYS.length, "duplicate key");
  for (const f of FIELDS) assert.ok(["undo", "dirty", "view"].includes(f.track), `${f.key}: track ${f.track}`);
  assert.deepEqual(FIELDS.filter((f) => f.track === "view").map((f) => f.key).sort(), Object.keys(VIEW_ONLY).sort());
  assert.ok(FIELD_KEYS.length >= 39, `only ${FIELD_KEYS.length} fields`);
});

test("#448 store.jsx wires exactly the table's fields to their own state", () => {
  const i = src.indexOf("const fieldState = {");
  assert.ok(i >= 0, "fieldState not found in store.jsx");
  const block = src.slice(i, src.indexOf("};", i));
  const pairs = [...block.matchAll(/(\w+): \[(\w+), (\w+)\]/g)].map((m) => m.slice(1));
  assert.deepEqual(pairs.map((p) => p[0]).sort(), [...FIELD_KEYS].sort());
  for (const [k, value, setter] of pairs) {
    assert.equal(value, k, `${k} is paired with ${value}`);
    assert.equal(setter, `set${k[0].toUpperCase()}${k.slice(1)}`, `${k} is paired with ${setter}`);
    assert.match(src, new RegExp(`const \\[${k}, ${setter}\\] = useState\\(`), `${k}: no useState`);
  }
  // the generated paths really are used (not a table beside the old hand-written lists)
  for (const use of ["payloadFromFields(liveRef.current)", "setFields(fieldsFromPayload(data, fallbackName))", "setFields(emptyFields())", "extraDirtyValues(live)", "UNDO_KEYS.map((k) => live[k])", "autosaveRef.current = { ...live, hasWork }"]) assert.ok(src.includes(use), use);
});

// A project with a non-empty value in every field.
function sampleLive() {
  const live = emptyFields();
  for (const f of FIELDS) {
    const e = live[f.key];
    if (Array.isArray(e)) live[f.key] = f.key === "layoutPages" ? e : [{ id: `${f.key}_1`, name: f.key }];
    else if (e === null) live[f.key] = { marker: f.key };
    else if (typeof e === "string") live[f.key] = "classified";
    else if (f.key === "layers") live[f.key] = { ...EMPTY_LAYERS, litho: [{ hole_id: "H1", from: 0, to: 2, value: "AND" }] };
    else if (f.key !== "project") live[f.key] = { a: 1 };
  }
  live.project = { name: "Demo", epsg: 32609, desurveyMethod: "tangent", crsSet: true }; // crsSet: #615
  live.geophysPtsMin = 0; // falsy but real: must survive (?? not ||)
  live.geophysPtsMax = 12.5;
  live.voxelModels = [{ id: "v1", source: "simpeg", cells: [{ x: 500000, y: 6200000, z: 1000, dx: 25, dy: 25, dz: 12.5, value: 0.5, support: 1 }] }];
  live.layoutPages = [{ id: "p1", name: "Page 1", elements: [] }, { id: "p2", name: "Page 2", elements: [] }];
  live.activeLayoutPageId = "p2";
  live.alterationBoxes = { boxes: { basalt: { ai: [20, 55], ccpi: [55, 85] } }, map: { BSL: "basalt" }, source: "logged" }; // #503
  live.structuralTrends = { trends: [{ id: "t1", name: "Main foliation", dip: 52, dipAzimuth: 202, pitch: 90, ratios: { max: 3, int: 2, min: 1 } }], use: { implicit: "t1", estimation: "t1" } }; // #650
  live.modellingCodes = { codes: [{ name: "AND1", role: "stratigraphic", order: 1 }], assign: { "H1|0.000|2.000": "AND1" }, ties: [{ a: "H1|0.000|2.000", b: "H2|5.000|9.000" }] }; // #599
  return live;
}

test("#448 save -> JSON -> load gives back every field", () => {
  const live = sampleLive();
  const file = JSON.parse(JSON.stringify(payloadFromFields(live)));
  assert.equal(file.version, PROJECT_VERSION);
  for (const k of FIELD_KEYS) assert.ok(k in file, `${k}: not written`);
  assert.ok(file.voxelModels[0].compactCells, "SimPEG model written compact (#321)");
  const back = fieldsFromPayload(file, "Demo");
  assert.deepEqual(back, live);
});

test("#448 New resets every field; an older file gets each field's empty value", () => {
  const fresh = emptyFields();
  const live = sampleLive();
  for (const k of FIELD_KEYS) assert.notDeepEqual(fresh[k], live[k], `${k}: New keeps the old project's value`);
  assert.equal(fresh.layoutPages.length, 1);
  assert.equal(fresh.activeLayoutPageId, fresh.layoutPages[0].id);
  assert.notEqual(emptyFields().layoutPages[0].id, fresh.layoutPages[0].id, "a fresh page id each time");

  const old = fieldsFromPayload({ version: 1, collars: [{ hole_id: "H1" }], layoutElements: [{ id: "t", type: "title" }] });
  assert.deepEqual(old.collars, [{ hole_id: "H1" }]);
  assert.deepEqual(old.layers, EMPTY_LAYERS);
  assert.equal(old.terrain, null);
  assert.deepEqual(old.geophysSurveys, {});
  assert.equal(old.geophysPtsColorMode, "continuous");
  assert.equal(old.project.name, "Untitled project");
  assert.equal(old.layoutPages.length, 1, "pre-#69 flat layout wrapped as one page");
  assert.deepEqual(old.layoutPages[0].elements, [{ id: "t", type: "title" }]);
  assert.equal(old.activeLayoutPageId, old.layoutPages[0].id);
  // a saved active page that no longer exists falls back to the first
  assert.equal(fieldsFromPayload({ layoutPages: [{ id: "a", elements: [] }], activeLayoutPageId: "gone" }).activeLayoutPageId, "a");
});

test("#448 the file name wins over the name stored in the file (#199)", () => {
  assert.equal(fieldsFromPayload({ project: { name: "stale", epsg: 3156 } }, "Real name").project.name, "Real name");
  assert.equal(fieldsFromPayload({ project: { name: "stored", epsg: 3156 } }).project.name, "stored");
});

test("#448 every non-view field marks the project unsaved when it changes", () => {
  const live = sampleLive();
  const base = extraDirtyValues(live);
  assert.equal(base.length, DIRTY_KEYS.length + 2);
  for (const k of DIRTY_KEYS) {
    const next = extraDirtyValues({ ...live, [k]: Array.isArray(live[k]) ? [...live[k]] : { ...live[k] } });
    assert.ok(next.some((v, i) => v !== base[i]), `${k}: change not seen`);
  }
  assert.ok(extraDirtyValues({ ...live, project: { ...live.project, epsg: 3157 } }).some((v, i) => v !== base[i]), "EPSG change");
  assert.ok(extraDirtyValues({ ...live, project: { ...live.project, name: "renamed" } }).every((v, i) => v === base[i]), "a rename alone is not an edit");
  // undo-tracked + dirty-tracked + view-only = every field, no overlap
  assert.equal(UNDO_KEYS.length + DIRTY_KEYS.length + Object.keys(VIEW_ONLY).length, FIELD_KEYS.length);
});

test("#513 projectHasContent: false for a new project, true when ANY project field holds data", async () => {
  const { projectHasContent, emptyFields, FIELDS } = await import("../src/lib/projectFields.js");
  assert.equal(projectHasContent(emptyFields()), false);
  // the fields the old hand-kept list missed, one at a time
  for (const [k, v] of [["voxelModels", [{ id: "m" }]], ["survey", [{ hole_id: "H" }]], ["rasters", [{ id: "r" }]], ["terrain", { name: "dem" }],
    ["dcipLines", [{ id: "l" }]], ["generatedSurfaces", [{ id: "s" }]], ["boundaries", [{ id: "b" }]], ["crmCertificates", { OREAS: { Au: { mean: 1 } } }]]) {
    assert.equal(projectHasContent({ ...emptyFields(), [k]: v }), true, k);
  }
  assert.equal(projectHasContent({ ...emptyFields(), layers: { ...emptyFields().layers, litho: [{ hole_id: "H" }] } }), true);
  // every content field counts (a field added to FIELDS later is covered without touching this rule)
  for (const f of FIELDS) {
    if (f.track === "view" || f.key === "layoutPages") continue;
    const e = f.empty();
    const filled = Array.isArray(e) ? [{}] : e && typeof e === "object" ? { x: [1] } : { x: 1 };
    assert.equal(projectHasContent({ ...emptyFields(), [f.key]: filled }), true, f.key);
  }
  // view state alone (camera, a database profile) is not work
  assert.equal(projectHasContent({ ...emptyFields(), viewerUiState: { cam: 1 }, dbConnections: [{ host: "h" }] }), false);
});

test("#514 the file format is pinned to PROJECT_VERSION: change FIELDS -> bump the version", async () => {
  const { formatFingerprint } = await import("../src/lib/projectFields.js");
  // If this fails you changed what a project file contains (a field added / removed / re-encoded). Bump
  // PROJECT_VERSION in projectFields.js (so #342 warns an OLDER GeoStrix that opens the new file), then add
  // the new version and fingerprint here. Never edit an existing entry.
  const PINNED = {
    7: "project+load,collars,survey,layers+save+load,assays,assayElements,customLayers,viewerUiState,themes,rasters,boundaries,mapLayers,surfaceStructures,fieldStructuralRefs,lithoGroups,geophysSurveys,crmCertificates,dcipLines,omfObjects,terrain,geophysPtsStops,geophysPtsColorMode,geophysPtsMin+load,geophysPtsMax+load,voxelModels+save+load,layerGroups,layoutPages+load,activeLayoutPageId,dbConnections,excludedIntercepts,softIntercepts,interceptSets,sections,sectionGroups,layoutTemplates,plannedHoles,surfaceSamples,surfaceElements,generatedSurfaces+save+load,modelDomains",
    8: "project+load,collars,survey,layers+save+load,assays,assayElements,customLayers,viewerUiState,themes,rasters,boundaries,mapLayers,surfaceStructures,fieldStructuralRefs,lithoGroups,geophysSurveys,crmCertificates,dcipLines,modellingCodes+load,omfObjects,terrain,geophysPtsStops,geophysPtsColorMode,geophysPtsMin+load,geophysPtsMax+load,voxelModels+save+load,layerGroups,layoutPages+load,activeLayoutPageId,dbConnections,excludedIntercepts,softIntercepts,interceptSets,sections,sectionGroups,layoutTemplates,plannedHoles,surfaceSamples,surfaceElements,generatedSurfaces+save+load,modelDomains",
    9: "project+load,collars,survey,layers+save+load,assays,assayElements,customLayers,viewerUiState,themes,rasters,boundaries,mapLayers,surfaceStructures,fieldStructuralRefs,lithoGroups,geophysSurveys,crmCertificates,dcipLines,alterationBoxes+load,modellingCodes+load,omfObjects,terrain,geophysPtsStops,geophysPtsColorMode,geophysPtsMin+load,geophysPtsMax+load,voxelModels+save+load,layerGroups,layoutPages+load,activeLayoutPageId,dbConnections,excludedIntercepts,softIntercepts,interceptSets,sections,sectionGroups,layoutTemplates,plannedHoles,surfaceSamples,surfaceElements,generatedSurfaces+save+load,modelDomains",
    10: "project+load,collars,survey,layers+save+load,assays+save+load,assayElements,customLayers,viewerUiState,themes,rasters,boundaries,mapLayers,surfaceStructures,fieldStructuralRefs,lithoGroups,geophysSurveys,crmCertificates,dcipLines,alterationBoxes+load,modellingCodes+load,omfObjects,terrain,geophysPtsStops,geophysPtsColorMode,geophysPtsMin+load,geophysPtsMax+load,voxelModels+save+load,layerGroups,layoutPages+load,activeLayoutPageId,dbConnections,excludedIntercepts,softIntercepts,interceptSets,sections,sectionGroups,layoutTemplates,plannedHoles,surfaceSamples,surfaceElements,generatedSurfaces+save+load,modelDomains",
    11: "project+load,collars,survey,layers+save+load,assays+save+load,assayElements,customLayers,viewerUiState,themes,rasters,boundaries,mapLayers,sectionImages,surfaceStructures,fieldStructuralRefs,lithoGroups,geophysSurveys,crmCertificates,dcipLines,alterationBoxes+load,modellingCodes+load,omfObjects,terrain,geophysPtsStops,geophysPtsColorMode,geophysPtsMin+load,geophysPtsMax+load,voxelModels+save+load,layerGroups,layoutPages+load,activeLayoutPageId,dbConnections,excludedIntercepts,softIntercepts,interceptSets,sections,sectionGroups,layoutTemplates,plannedHoles,surfaceSamples,surfaceElements,generatedSurfaces+save+load,modelDomains",
    12: "project+load,collars,survey,layers+save+load,assays+save+load,assayElements,customLayers,viewerUiState,themes,rasters,boundaries,mapLayers,sectionImages,surfaceStructures,fieldStructuralRefs,lithoGroups,geophysSurveys,crmCertificates,dcipLines,alterationBoxes+load,modellingCodes+load,structuralTrends+load,omfObjects,terrain,geophysPtsStops,geophysPtsColorMode,geophysPtsMin+load,geophysPtsMax+load,voxelModels+save+load,layerGroups,layoutPages+load,activeLayoutPageId,dbConnections,excludedIntercepts,softIntercepts,interceptSets,sections,sectionGroups,layoutTemplates,plannedHoles,surfaceSamples,surfaceElements,generatedSurfaces+save+load,modelDomains",
    13: "project+load,collars,survey,layers+save+load,assays+save+load,assayElements,customLayers,viewerUiState,themes,rasters,boundaries,mapLayers,sectionImages,surfaceStructures,fieldStructuralRefs,lithoGroups,geophysSurveys,crmCertificates,dcipLines,alterationBoxes+load,modellingCodes+load,structuralTrends+load,omfObjects,terrain,geophysPtsStops,geophysPtsColorMode,geophysPtsMin+load,geophysPtsMax+load,voxelModels+save+load,layerGroups,layoutPages+load,activeLayoutPageId,dbConnections,excludedIntercepts,softIntercepts,interceptSets,sections,sectionGroups,layoutTemplates,plannedHoles,surfaceSamples,surfaceElements,generatedSurfaces+save+load,modelDomains", // #660 — same fields; voxel models of every source may be compactCells (with keys)
    14: "project+load,collars,survey,layers+save+load,assays+save+load,assayElements,customLayers,viewerUiState,themes,rasters,boundaries,mapLayers,sectionImages,surfaceStructures,fieldStructuralRefs,lithoGroups,geophysSurveys,crmCertificates,dcipLines,alterationBoxes+load,modellingCodes+load,structuralTrends+load,omfObjects,terrain+save+load,geophysPtsStops,geophysPtsColorMode,geophysPtsMin+load,geophysPtsMax+load,voxelModels+save+load,layerGroups,layoutPages+load,activeLayoutPageId,dbConnections,excludedIntercepts,softIntercepts,interceptSets,sections,sectionGroups,layoutTemplates,plannedHoles,surfaceSamples,surfaceElements,generatedSurfaces+save+load,modelDomains", // #796 — big terrain as elevationsF32
    15: "project+load,collars,survey,layers+save+load,assays+save+load,assayElements,customLayers,viewerUiState,themes,rasters,boundaries,mapLayers,sectionImages,surfaceStructures,fieldStructuralRefs,lithoGroups,geophysSurveys,crmCertificates,dcipLines,alterationBoxes+load,modellingCodes+load,structuralTrends+load,explicitSurfaces,omfObjects,terrain+save+load,geophysPtsStops,geophysPtsColorMode,geophysPtsMin+load,geophysPtsMax+load,voxelModels+save+load,layerGroups,layoutPages+load,activeLayoutPageId,dbConnections,excludedIntercepts,softIntercepts,interceptSets,sections,sectionGroups,layoutTemplates,plannedHoles,surfaceSamples,surfaceElements,generatedSurfaces+save+load,modelDomains", // #811 — explicitSurfaces
    16: "project+load,collars,survey,layers+save+load,assays+save+load,assayElements,customLayers,viewerUiState,themes,rasters,boundaries,mapLayers,sectionImages,surfaceStructures,fieldStructuralRefs,lithoGroups,geophysSurveys,crmCertificates,dcipLines,alterationBoxes+load,modellingCodes+load,structuralTrends+load,explicitSurfaces,omfObjects,terrain+save+load,geophysPtsStops,geophysPtsColorMode,geophysPtsMin+load,geophysPtsMax+load,voxelModels+save+load,layerGroups,layoutPages+load,activeLayoutPageId,dbConnections,excludedIntercepts,softIntercepts,interceptSets,sections,sectionGroups,layoutTemplates,plannedHoles,surfaceSamples,surfaceElements,geochemThresholds,generatedSurfaces+save+load,modelDomains", // #841 — geochemThresholds
    17: "project+load,collars,survey,layers+save+load,assays+save+load,assayElements,customLayers,viewerUiState,themes,rasters,boundaries,mapLayers,sectionImages,surfaceStructures,fieldStructuralRefs,lithoGroups,geophysSurveys,crmCertificates,dcipLines,alterationBoxes+load,modellingCodes+load,structuralTrends+load,explicitSurfaces,omfObjects,terrain+save+load,geophysPtsStops,geophysPtsColorMode,geophysPtsMin+load,geophysPtsMax+load,voxelModels+save+load,layerGroups,layoutPages+load,activeLayoutPageId,dbConnections,excludedIntercepts,softIntercepts,interceptSets,sections,sectionGroups,layoutTemplates,plannedHoles,surfaceSamples,surfaceElements,geochemThresholds,surfaceQc,generatedSurfaces+save+load,modelDomains", // #842 — surfaceQc
    18: "project+load,collars,survey,layers+save+load,assays+save+load,assayElements,customLayers,viewerUiState,themes,rasters,boundaries,mapLayers,sectionImages,surfaceStructures,fieldStructuralRefs,lithoGroups,geophysSurveys,crmCertificates,dcipLines,alterationBoxes+load,modellingCodes+load,structuralTrends+load,explicitSurfaces,omfObjects,terrain+save+load,geophysPtsStops,geophysPtsColorMode,geophysPtsMin+load,geophysPtsMax+load,voxelModels+save+load,layerGroups,layoutPages+load,activeLayoutPageId,dbConnections,excludedIntercepts,softIntercepts,interceptSets,sections,sectionGroups,layoutTemplates,plannedHoles,surfaceSamples,surfaceElements,geochemThresholds,surfaceQc,evidenceOverlay,generatedSurfaces+save+load,modelDomains", // #1003 — evidenceOverlay
    19: "project+load,collars,survey,layers+save+load,assays+save+load,assayElements,customLayers,viewerUiState,themes,rasters,boundaries,mapLayers,sectionImages,surfaceStructures,fieldStructuralRefs,lithoGroups,geophysSurveys,crmCertificates,dcipLines,alterationBoxes+load,modellingCodes+load,structuralTrends+load,explicitSurfaces,omfObjects,terrain+save+load,geophysPtsStops,geophysPtsColorMode,geophysPtsMin+load,geophysPtsMax+load,voxelModels+save+load,layerGroups,layoutPages+load,activeLayoutPageId,dbConnections,excludedIntercepts,softIntercepts,interceptSets,sections,sectionGroups,layoutTemplates,plannedHoles,surfaceSamples+save+load,surfaceElements,geochemThresholds,surfaceQc,evidenceOverlay,generatedSurfaces+save+load,modelDomains", // #1073 — surface samples as exact columns
    20: "project+load,collars,survey,layers+save+load,assays+save+load,assayElements,customLayers,viewerUiState,themes,rasters,boundaries,mapLayers,sectionImages,surfaceStructures,fieldStructuralRefs,lithoGroups,geophysSurveys,crmCertificates,dcipLines,alterationBoxes+load,modellingCodes+load,structuralTrends+load,explicitSurfaces,omfObjects,terrain+save+load,geophysPtsStops,geophysPtsColorMode,geophysPtsMin+load,geophysPtsMax+load,voxelModels+save+load,layerGroups,layoutPages+load,activeLayoutPageId,excludedIntercepts,softIntercepts,interceptSets,sections,sectionGroups,layoutTemplates,plannedHoles,surfaceSamples+save+load,surfaceElements,geochemThresholds,surfaceQc,evidenceOverlay,generatedSurfaces+save+load,modelDomains", // #1081 — dbConnections left the file (per computer)
  };
  assert.ok(PINNED[PROJECT_VERSION], `PROJECT_VERSION ${PROJECT_VERSION} has no pinned fingerprint — add it`);
  assert.equal(formatFingerprint(), PINNED[PROJECT_VERSION], "the project format changed: bump PROJECT_VERSION and pin the new fingerprint");
  assert.equal(payloadFromFields(emptyFields()).version, PROJECT_VERSION);
});

// TASKS.csv #742 — the fingerprint above pins field keys, not encodings: a change INSIDE compactTable / compactLayers /
// compactIntervalLayers / compactVoxelModels / compactSurfaces (or a field's load) would not force the bump. A golden
// project, big enough to trip every encoder (2,000+ assays, interval and point rows, a 2,000+ vertex mesh, a voxel
// model), is saved and re-loaded and both JSON texts hashed, pinned per PROJECT_VERSION. If this fails and the change
// is deliberate: bump PROJECT_VERSION and add the new hashes. Never edit an existing entry.
function goldenLive() {
  const live = sampleLive();
  const n = 2400;
  live.assays = Array.from({ length: n }, (_, i) => ({ hole_id: `H${i % 7}`, from: i * 1.5, to: i * 1.5 + 1.5, values: { Cu: (i % 97) / 10, Au: i % 5 ? (i % 13) / 100 : null }, sample_id: `S${10000 + i}` }));
  live.layers = { ...EMPTY_LAYERS, litho: Array.from({ length: n }, (_, i) => ({ hole_id: `H${i % 7}`, from: i * 2, to: i * 2 + 2, value: ["AND", "BAS", "TUF"][i % 3] })),
    geophys_pts: Array.from({ length: n }, (_, i) => ({ x: 500000 + i * 12.5, y: 6200000 + (i % 40) * 25, z: 900 + (i % 11), value: 0.001 * (i % 300), survey: "mag" })) };
  const side = 50, vertices = [], indices = [];
  for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) vertices.push(500000 + i * 10, 6200000 + j * 10, 1000 + ((i * j) % 17) * 0.5);
  for (let j = 0; j < side - 1; j++) for (let i = 0; i < side - 1; i++) { const k = j * side + i; indices.push(k, k + 1, k + side, k + 1, k + side + 1, k + side); }
  live.generatedSurfaces = [{ id: "s1", name: "Contact", vertices, indices }];
  live.surfaceSamples = Array.from({ length: n }, (_, i) => ({ sample_id: `SS${i}`, x: 500000 + (i % 50) * 25, y: 6200000 + Math.floor(i / 50) * 25, z: i % 9 ? 1000 : null, medium: i % 3 ? "soil" : "rock chip", values: { Cu: (i % 89) * 1.5, Au: i % 4 ? (i % 11) * 0.7 : undefined }, ...(i % 5 ? {} : { bdl: ["Au"] }) })); // #1073
  live.voxelModels = [{ id: "v1", name: "inv", source: "simpeg", cells: Array.from({ length: 300 }, (_, i) => ({ x: 500000 + (i % 10) * 25, y: 6200000 + Math.floor(i / 10) * 25, z: 1000, dx: 25, dy: 25, dz: 12.5, value: 0.01 * (i % 37), support: i % 2 })) }];
  return live;
}

test("#742 the saved and re-loaded bytes of a golden project are pinned to PROJECT_VERSION", async () => {
  const { createHash } = await import("node:crypto");
  const sha = (t) => createHash("sha256").update(t).digest("hex").slice(0, 16);
  const saved = JSON.stringify(payloadFromFields(goldenLive()));
  const loaded = JSON.stringify(fieldsFromPayload(JSON.parse(saved), "golden.geostrix.json"));
  const PINNED = {
    13: { saved: "1d09b3a8fd93ceac", loaded: "07a3d6420fc738e5" },
    14: { saved: "ab5d167714e170ba", loaded: "07a3d6420fc738e5" }, // #796 — only "version" changed (the golden project has no terrain)
    15: { saved: "ba85f970b701cdea", loaded: "00c0d5b0160251f2" }, // #811 — version, and an empty explicitSurfaces list
    16: { saved: "669dbe6ad2d3ab55", loaded: "b536e8f471611636" }, // #841 — version, and an empty geochemThresholds list
    17: { saved: "4d334b35ad16089d", loaded: "713c9796d793d9bf" }, // #842 — version, and surfaceQc null
    18: { saved: "4353909a440f197d", loaded: "98b7041cd17b4331" }, // #1003 — version, and evidenceOverlay null
    19: { saved: "52e3be618958dbae", loaded: "8351488eaff7972d" }, // #1073 — 2,400 surface samples added to the golden project, saved as columns
    20: { saved: "d5a3c8b051084c3b", loaded: "bc98b8d0d850b608" }, // #1081 — version, and no dbConnections key
  };
  const p = JSON.parse(saved); // every encoder must actually have run, or the pin guards nothing
  assert.ok(p.assays?.__compactTable, "assays not compacted - make the golden project bigger");
  assert.ok(p.layers?.litho?.__compactTable, "interval layer not compacted");
  assert.ok(p.layers?.geophys_pts?.__compactRows, "point survey not compacted");
  assert.ok(p.generatedSurfaces?.[0]?.compactMesh, "mesh not compacted");
  assert.ok(p.voxelModels?.[0]?.compactCells, "voxel model not compacted");
  if (PROJECT_VERSION >= 19) assert.ok(p.surfaceSamples?.__compactTable, "surface samples not compacted"); // #1073
  assert.deepEqual({ saved: sha(saved), loaded: sha(loaded) }, PINNED[PROJECT_VERSION], "the project file's encoding changed: bump PROJECT_VERSION and pin the new hashes");
});

// TASKS.csv #660 — estimated / geoML / imported voxel models are written as columns too, and come back the same
test("#660 every voxel model is compacted and round-trips (numbers and text support classes)", async () => {
  const { compactVoxelModels, expandVoxelModels } = await import("../src/lib/projectFields.js");
  const cls = ["measured", "inferred", "extrapolated"];
  const cells = Array.from({ length: 500 }, (_, i) => ({ x: 450000 + i * 10, y: 6200000 + (i % 7) * 10, z: 900 - i, dx: 10, dy: 10, dz: 10, value: 0.25 * (i % 9), nSamples: i % 17, nHoles: 1 + (i % 4), support: cls[i % 3], supportIndex: (i % 10) / 10, nearestSampleM: i * 0.5 }));
  const m = { id: "v1", name: "Cu IDW", source: "estimate-idw2", cells, min: 0, max: 2 };
  const [c] = compactVoxelModels([m]);
  assert.ok(c.compactCells && !c.cells, "written as columns");
  assert.deepEqual(c.compactCells.keys, Object.keys(cells[0]));
  assert.ok(JSON.stringify(c).length < JSON.stringify(m).length / 2, `${JSON.stringify(c).length} vs ${JSON.stringify(m).length}`);
  const [back] = expandVoxelModels([JSON.parse(JSON.stringify(c))]);
  assert.equal(back.cells.length, 500);
  back.cells.forEach((b, i) => {
    const a = cells[i];
    for (const k of Object.keys(a)) {
      if (typeof a[k] === "string" || k === "value") assert.equal(b[k], a[k]); // the value is exact
      else assert.ok(Math.abs(b[k] - a[k]) <= 1e-6 * Math.max(1, Math.abs(a[k])) + 1e-3, `${k} ${b[k]} vs ${a[k]}`);
    }
    assert.equal(Object.keys(b).length, Object.keys(a).length);
  });
  // cells whose keys differ, or hold something that is not a number or text, are saved as they were
  const mixed = { id: "v2", source: "csv", cells: [{ x: 1, y: 1, z: 1, value: 1 }, { x: 2, y: 2, z: 2 }] };
  assert.equal(compactVoxelModels([mixed])[0], mixed);
  const obj = { id: "v3", source: "geoml", cells: [{ x: 1, y: 1, z: 1, value: 1, extra: { a: 1 } }] };
  assert.equal(compactVoxelModels([obj])[0], obj);
  // a v12 simpeg file (no keys) still expands with the old eight columns
  const old = compactVoxelModels([{ id: "s", source: "simpeg", cells: [{ x: 1, y: 2, z: 3, dx: 1, dy: 1, dz: 1, value: 5, support: 0.5 }] }])[0];
  const legacy = { ...old, compactCells: { n: old.compactCells.n, cols: old.compactCells.cols } };
  assert.deepEqual(expandVoxelModels([legacy])[0].cells[0], { x: 1, y: 2, z: 3, dx: 1, dy: 1, dz: 1, value: 5, support: 0.5 });
});
