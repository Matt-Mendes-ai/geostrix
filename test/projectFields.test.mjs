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
  dbConnections: "saved connection list (host/db/user only, never passwords): managed in its own dialog",
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
  live.project = { name: "Demo", epsg: 32609, desurveyMethod: "tangent" };
  live.geophysPtsMin = 0; // falsy but real: must survive (?? not ||)
  live.geophysPtsMax = 12.5;
  live.voxelModels = [{ id: "v1", source: "simpeg", cells: [{ x: 500000, y: 6200000, z: 1000, dx: 25, dy: 25, dz: 12.5, value: 0.5, support: 1 }] }];
  live.layoutPages = [{ id: "p1", name: "Page 1", elements: [] }, { id: "p2", name: "Page 2", elements: [] }];
  live.activeLayoutPageId = "p2";
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
